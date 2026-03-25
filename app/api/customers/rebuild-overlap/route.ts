/**
 * POST /api/customers/rebuild-overlap
 *
 * Fast standalone rebuild of customer_overlap_cache.
 * Derives overlap counts directly from source tables using case-insensitive
 * email matching — does NOT require a full profile rebuild first.
 *
 * Circles:
 *   Subscribers = any email with an ACTIVE recharge_subscription
 *   Loyalty     = any email in loyalty_customers
 *   VIP         = any email whose total_revenue >= p90 across all profiles
 */
import { NextRequest } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'

export const maxDuration = 120

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

export async function POST(_req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createSupabaseServiceClient()

  // ── 1. Collect all active subscriber emails (paginated) ───────────────────────
  const subscriberEmails = new Set<string>()
  {
    let from = 0
    while (true) {
      const { data } = await service
        .from('recharge_subscriptions')
        .select('customer_email, status')
        .eq('tenant_id', TENANT_ID)
        .range(from, from + 999)
      if (!data || data.length === 0) break
      for (const row of data) {
        if (row.customer_email && row.status === 'active') {
          subscriberEmails.add(row.customer_email.toLowerCase().trim())
        }
      }
      if (data.length < 1000) break
      from += 1000
    }
  }

  // ── 2. Collect all loyalty member emails (paginated) ──────────────────────────
  const loyaltyEmails = new Set<string>()
  {
    let from = 0
    while (true) {
      const { data } = await service
        .from('loyalty_customers')
        .select('email')
        .eq('tenant_id', TENANT_ID)
        .range(from, from + 999)
      if (!data || data.length === 0) break
      for (const row of data) {
        if (row.email) loyaltyEmails.add(row.email.toLowerCase().trim())
      }
      if (data.length < 1000) break
      from += 1000
    }
  }

  // ── 3. Fetch all customer_profiles (paginated) ────────────────────────────────
  type ProfileRow = { email: string; total_revenue: number }
  const allProfiles: ProfileRow[] = []
  {
    let from = 0
    while (true) {
      const { data } = await service
        .from('customer_profiles')
        .select('email, total_revenue')
        .eq('tenant_id', TENANT_ID)
        .range(from, from + 999)
      if (!data || data.length === 0) break
      allProfiles.push(...(data as ProfileRow[]))
      if (data.length < 1000) break
      from += 1000
    }
  }

  // ── 4. Compute p90 revenue threshold for VIP ──────────────────────────────────
  const revenues = allProfiles.map((p) => Number(p.total_revenue)).sort((a, b) => a - b)
  const p90 = revenues[Math.floor(revenues.length * 0.90)] ?? 0

  // ── 5. Count overlaps ─────────────────────────────────────────────────────────
  let subscribersOnly = 0, loyaltyOnly = 0, vipOnly = 0
  let subAndLoyalty = 0, subAndVip = 0, loyaltyAndVip = 0, allThree = 0

  for (const p of allProfiles) {
    const email = p.email.toLowerCase().trim()
    const isSub = subscriberEmails.has(email)
    const isLoy = loyaltyEmails.has(email)
    const isVip = Number(p.total_revenue) >= p90

    if (isSub && isLoy && isVip)       allThree++
    else if (isSub && isLoy)           subAndLoyalty++
    else if (isSub && isVip)           subAndVip++
    else if (isLoy && isVip)           loyaltyAndVip++
    else if (isSub)                    subscribersOnly++
    else if (isLoy)                    loyaltyOnly++
    else if (isVip)                    vipOnly++
  }

  // ── 6. Upsert overlap cache ───────────────────────────────────────────────────
  const { error } = await service.from('customer_overlap_cache').upsert({
    tenant_id:              TENANT_ID,
    total_customers:        allProfiles.length,
    subscribers_only:       subscribersOnly,
    loyalty_only:           loyaltyOnly,
    vip_only:               vipOnly,
    subscriber_and_loyalty: subAndLoyalty,
    subscriber_and_vip:     subAndVip,
    loyalty_and_vip:        loyaltyAndVip,
    all_three:              allThree,
    calculated_at:          new Date().toISOString(),
  }, { onConflict: 'tenant_id' })

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({
    ok: true,
    total_customers:        allProfiles.length,
    subscribers_only:       subscribersOnly,
    loyalty_only:           loyaltyOnly,
    vip_only:               vipOnly,
    subscriber_and_loyalty: subAndLoyalty,
    subscriber_and_vip:     subAndVip,
    loyalty_and_vip:        loyaltyAndVip,
    all_three:              allThree,
    _debug: {
      active_subscriber_emails: subscriberEmails.size,
      loyalty_emails:           loyaltyEmails.size,
      total_profiles:           allProfiles.length,
      vip_threshold_p90:        p90,
    },
  })
}
