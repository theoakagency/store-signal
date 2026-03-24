/**
 * POST /api/loyaltylion/sync
 * Fetches all LoyaltyLion data and caches computed metrics.
 */
import { NextRequest } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'
import {
  getCustomers,
  getActivities,
  type LoyaltyActivity,
} from '@/lib/loyaltylion'

export const maxDuration = 300

const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const STORE_ID  = '00000000-0000-0000-0000-000000000002'

// Approximate dollar value per point (typical LoyaltyLion default: $0.01/point)
const POINT_DOLLAR_VALUE = 0.01

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

  const s = store as { loyaltylion_token: string | null } | null
  if (!s?.loyaltylion_token) {
    return Response.json({ error: 'LoyaltyLion not connected' }, { status: 400 })
  }

  const token = s.loyaltylion_token

  // ── Fetch data ───────────────────────────────────────────────────────────────
  const twelveMonthsAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()
  const now = new Date().toISOString()

  let customers, activities
  try {
    ;[customers, activities] = await Promise.all([
      getCustomers(token),
      getActivities(token, { from: twelveMonthsAgo, to: now }),
    ])
  } catch (e) {
    const msg = (e as Error).message
    console.error('LoyaltyLion sync fetch error:', msg)
    return Response.json({ error: msg }, { status: 502 })
  }

  // ── Upsert customers ─────────────────────────────────────────────────────────
  if (customers.length > 0) {
    const rows = customers.map((c) => ({
      id: String(c.id),
      tenant_id: TENANT_ID,
      email: c.email,
      points_balance: c.merchant_loyalty_points?.balance ?? 0,
      points_earned_total: c.merchant_loyalty_points?.approved_earning ?? 0,
      points_spent_total: c.merchant_loyalty_points?.approved_spending ?? 0,
      tier: c.tier?.name ?? null,
      enrolled_at: c.enrolled_at,
      last_activity_at: c.last_activity_at,
    }))
    await service.from('loyalty_customers').upsert(rows, { onConflict: 'id' })
  }

  // ── Upsert activities ────────────────────────────────────────────────────────
  // Only store approved activities
  const approvedActivities = activities.filter((a) => a.state === 'approved')
  if (approvedActivities.length > 0) {
    const rows = approvedActivities.map((a) => ({
      id: String(a.id),
      tenant_id: TENANT_ID,
      customer_email: a.customer?.email ?? null,
      activity_type: a.name,
      points_change: a.points,
      description: null,
      created_at: a.created_at,
    }))
    await service.from('loyalty_activities').upsert(rows, { onConflict: 'id' })
  }

  // ── Compute metrics ──────────────────────────────────────────────────────────
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const recentActivities = approvedActivities.filter(
    (a) => new Date(a.created_at) >= thirtyDaysAgo
  )

  const points_issued_30d = recentActivities
    .filter((a) => a.points > 0)
    .reduce((s, a) => s + a.points, 0)

  const points_redeemed_30d = recentActivities
    .filter((a) => a.points < 0)
    .reduce((s, a) => s + Math.abs(a.points), 0)

  const redemption_rate = points_issued_30d > 0 ? points_redeemed_30d / points_issued_30d : 0

  const redeemerEmails30d = new Set(
    recentActivities.filter((a) => a.points < 0).map((a) => a.customer?.email)
  )
  const active_redeemers_30d = redeemerEmails30d.size

  const avg_points_balance = customers.length > 0
    ? customers.reduce((s, c) => s + (c.merchant_loyalty_points?.balance ?? 0), 0) / customers.length
    : 0

  const total_points_outstanding = customers.reduce((s, c) => s + (c.merchant_loyalty_points?.balance ?? 0), 0)
  const points_liability_value = total_points_outstanding * POINT_DOLLAR_VALUE

  // Tier breakdown
  const tierMap: Record<string, { count: number; total_spent: number }> = {}
  const { data: shopifyCustomers } = await service
    .from('customers')
    .select('email, total_spent')
    .eq('tenant_id', TENANT_ID)

  const spendByEmail = new Map(
    (shopifyCustomers ?? []).map((c: { email: string | null; total_spent: number }) => [c.email, Number(c.total_spent)])
  )

  for (const c of customers) {
    const tier = c.tier?.name ?? 'No Tier'
    if (!tierMap[tier]) tierMap[tier] = { count: 0, total_spent: 0 }
    tierMap[tier].count++
    tierMap[tier].total_spent += spendByEmail.get(c.email) ?? 0
  }

  const tier_breakdown = Object.entries(tierMap).map(([tier, data]) => ({
    tier,
    count: data.count,
    avg_ltv: data.count > 0 ? Math.round((data.total_spent / data.count) * 100) / 100 : 0,
  }))

  // Top redeemers (by total points spent)
  const top_redeemers = [...customers]
    .sort((a, b) => (b.merchant_loyalty_points?.approved_spending ?? 0) - (a.merchant_loyalty_points?.approved_spending ?? 0))
    .slice(0, 20)
    .map((c) => ({
      email: c.email,
      points_redeemed: c.merchant_loyalty_points?.approved_spending ?? 0,
      ltv: spendByEmail.get(c.email) ?? 0,
      tier: c.tier?.name ?? null,
    }))

  // Promotion response analysis — campaigns endpoint not available in LoyaltyLion v2 API
  const promotion_response_rate: unknown[] = []

  // ── Cache metrics ────────────────────────────────────────────────────────────
  await service.from('loyalty_metrics_cache').upsert({
    tenant_id: TENANT_ID,
    enrolled_customers: customers.length,
    active_redeemers_30d,
    points_issued_30d,
    points_redeemed_30d,
    redemption_rate: Math.round(redemption_rate * 10000) / 10000,
    avg_points_balance: Math.round(avg_points_balance * 100) / 100,
    points_liability_value: Math.round(points_liability_value * 100) / 100,
    promotion_response_rate,
    tier_breakdown,
    top_redeemers,
    calculated_at: new Date().toISOString(),
  }, { onConflict: 'tenant_id' })

  return Response.json({
    ok: true,
    synced: {
      customers: customers.length,
      activities: activities.length,
    },
    metrics: {
      enrolled_customers: customers.length,
      active_redeemers_30d,
      redemption_rate: Math.round(redemption_rate * 1000) / 10,
      points_liability_value: Math.round(points_liability_value * 100) / 100,
    },
    // DEBUG: raw sample to verify field names
    _debug: {
      sample_customer: customers[0] ?? null,
      sample_activity: activities[0] ?? null,
    },
  })
}
