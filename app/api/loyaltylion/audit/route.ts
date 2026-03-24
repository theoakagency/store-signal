/**
 * POST /api/loyaltylion/audit
 * Fetches ALL raw LoyaltyLion customers and activities and stores every field
 * including merchant_id, to determine the scope of cross-merchant data access.
 * TEMPORARY — remove once data ownership is confirmed with LoyaltyLion.
 */
import { NextRequest } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'

export const maxDuration = 300

const STORE_ID = '00000000-0000-0000-0000-000000000002'
const BASE = 'https://api.loyaltylion.com/v2'

async function fetchPage<T>(token: string, path: string, params: Record<string, string> = {}): Promise<T[]> {
  const query = new URLSearchParams({ per_page: '500', ...params })
  const res = await fetch(`${BASE}${path}?${query}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`LoyaltyLion ${path} error ${res.status}: ${body}`)
  }
  const data = await res.json() as Record<string, unknown>
  const key = path.replace('/', '')
  return (data[key] as T[] | undefined) ?? []
}

// Fetch all pages — only use for small datasets (customers)
async function fetchAll<T>(token: string, path: string, params: Record<string, string> = {}): Promise<T[]> {
  const results: T[] = []
  let cursor: string | null = null

  do {
    const query = new URLSearchParams({ per_page: '500', ...params })
    if (cursor) query.set('cursor', cursor)

    const res = await fetch(`${BASE}${path}?${query}`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`LoyaltyLion ${path} error ${res.status}: ${body}`)
    }

    const data = await res.json() as Record<string, unknown>
    const key = path.replace('/', '')
    const items = (data[key] as T[] | undefined) ?? []
    results.push(...items)

    const cur = data.cursor as { next: string | null } | undefined
    cursor = cur?.next ?? null
  } while (cursor)

  return results
}

export async function POST(_req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createSupabaseServiceClient()

  const { data: store } = await service
    .from('stores')
    .select('loyaltylion_token')
    .eq('id', STORE_ID)
    .single()

  const token = (store as { loyaltylion_token: string | null } | null)?.loyaltylion_token
  if (!token) return Response.json({ error: 'Not connected' }, { status: 400 })

  // ── Fetch all pages ──────────────────────────────────────────────────────────
  const twelveMonthsAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()
  const now = new Date().toISOString()

  let customers: Record<string, unknown>[], activities: Record<string, unknown>[]
  try {
    ;[customers, activities] = await Promise.all([
      fetchAll<Record<string, unknown>>(token, '/customers'),
      // Only fetch one page (500) — enough to determine cross-merchant scope
      fetchPage<Record<string, unknown>>(token, '/activities', {
        created_at_gte: twelveMonthsAgo,
        created_at_lte: now,
      }),
    ])
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 })
  }

  // ── Store raw customers ──────────────────────────────────────────────────────
  const customerRows = customers.map((c) => ({
    id: Number(c.id),
    merchant_id: c.merchant_id as string ?? null,
    email: c.email as string ?? null,
    shopify_source: (c.metadata as Record<string, string> | null)?.shopify_source_url ?? null,
    points_approved: (c.points_approved as number) ?? 0,
    points_pending: (c.points_pending as number) ?? 0,
    points_spent: (c.points_spent as number) ?? 0,
    enrolled: (c.enrolled as boolean) ?? false,
    enrolled_at: c.enrolled_at as string ?? null,
    tier_name: (c.loyalty_tier_membership as { loyalty_tier: { name: string } } | null)?.loyalty_tier?.name ?? null,
    guest: (c.guest as boolean) ?? true,
    raw: c,
    synced_at: new Date().toISOString(),
  }))

  if (customerRows.length > 0) {
    const { error } = await service
      .from('ll_audit_customers')
      .upsert(customerRows, { onConflict: 'id' })
    if (error) return Response.json({ error: `Customer upsert failed: ${error.message}` }, { status: 500 })
  }

  // ── Store raw activities ─────────────────────────────────────────────────────
  const activityRows = activities.map((a) => {
    const customer = a.customer as Record<string, unknown> | null
    const rule = a.rule as Record<string, unknown> | null
    return {
      id: Number(a.id),
      activity_merchant_id: a.merchant_id as string ?? null,
      customer_id: customer ? Number(customer.id) : null,
      customer_merchant_id: customer?.merchant_id as string ?? null,
      customer_email: customer?.email as string ?? null,
      value: (a.value as number) ?? 0,
      state: a.state as string ?? null,
      rule_id: rule ? Number(rule.id) : null,
      rule_name: rule?.name as string ?? null,
      created_at: a.created_at as string ?? null,
      raw: a,
      synced_at: new Date().toISOString(),
    }
  })

  if (activityRows.length > 0) {
    const { error } = await service
      .from('ll_audit_activities')
      .upsert(activityRows, { onConflict: 'id' })
    if (error) return Response.json({ error: `Activity upsert failed: ${error.message}` }, { status: 500 })
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  const uniqueCustomerMerchants = new Set(customers.map((c) => c.merchant_id as string))
  const uniqueActivityMerchants = new Set(activities.map((a) => a.merchant_id as string))
  const uniqueCustomerEmailsInActivities = new Set(
    activities.map((a) => (a.customer as Record<string, unknown> | null)?.email as string)
  )

  return Response.json({
    ok: true,
    customers: {
      total: customers.length,
      unique_merchant_ids: uniqueCustomerMerchants.size,
      sample_merchant_ids: [...uniqueCustomerMerchants].slice(0, 5),
    },
    activities: {
      total: activities.length,
      unique_merchant_ids: uniqueActivityMerchants.size,
      unique_customer_emails: uniqueCustomerEmailsInActivities.size,
      sample_merchant_ids: [...uniqueActivityMerchants].slice(0, 5),
    },
  })
}
