import { createSupabaseServiceClient } from '@/lib/supabase'
import { getCustomers, getActivities, getRewards, getCampaigns } from '@/lib/loyaltylion'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const STORE_ID  = '00000000-0000-0000-0000-000000000002'

// Dollar value per point — LoyaltyLion default is $0.01; adjustable via cache column
const POINT_DOLLAR_VALUE = 0.01

interface PromotionResult {
  campaign_id: string
  campaign_name: string
  started_at: string | null
  ended_at: string | null
  multiplier: number | null
  participants: number
  orders_during: number
  orders_before_14d: number
  lift_pct: number | null
  incremental_orders: number
  verdict: string
}

export async function runLoyaltySync(token: string, secret: string | null) {
  const service = createSupabaseServiceClient()

  const thirtyDaysAgoISO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const twelveMonthsAgoISO = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()
  const now = new Date().toISOString()

  // ── Step 1: Fetch customers, rewards, campaigns in parallel (fast) ────────────
  const [customers, rewards, campaigns] = await Promise.all([
    getCustomers(token, secret),
    getRewards(token, secret).catch(() => []),
    getCampaigns(token, secret).catch(() => []),
  ])

  // ── Step 2: Fetch activities — 30d for metrics, 12mo only if needed ───────────
  // The activities endpoint may return cross-merchant data, which causes excessive
  // pagination when fetching 12 months. Only go back 12 months if there are
  // completed campaigns that need lift analysis.
  const completedCampaigns = campaigns.filter(
    (c) => c.started_at && c.ended_at && new Date(c.ended_at) < new Date()
  )
  const activityFrom = completedCampaigns.length > 0 ? twelveMonthsAgoISO : thirtyDaysAgoISO
  const activities = await getActivities(token, { from: activityFrom, to: now }, secret)

  // ── Upsert loyalty_customers ─────────────────────────────────────────────────
  if (customers.length > 0) {
    const CHUNK = 500
    for (let i = 0; i < customers.length; i += CHUNK) {
      const rows = customers.slice(i, i + CHUNK).map((c) => ({
        id: String(c.id),
        tenant_id: TENANT_ID,
        email: c.email?.toLowerCase().trim() ?? null,
        points_balance: c.points_approved ?? 0,
        points_earned_total: c.points_approved ?? 0,
        points_spent_total: c.points_spent ?? 0,
        tier: c.loyalty_tier_membership?.loyalty_tier?.name ?? null,
        enrolled_at: c.enrolled_at,
        last_activity_at: null,
      }))
      await service.from('loyalty_customers').upsert(rows, { onConflict: 'id' })
    }
  }

  // ── Upsert loyalty_activities (approved only) ────────────────────────────────
  // Only store approved activities; pending purchase activities are excluded from DB
  // but included in metrics via customer balance fields below.
  const enrolledEmails = new Set(
    customers
      .map((c) => (c.email ?? '').toLowerCase().trim())
      .filter(Boolean)
  )
  const approvedActivities = activities.filter((a) => a.state === 'approved')
  if (approvedActivities.length > 0) {
    const CHUNK = 500
    for (let i = 0; i < approvedActivities.length; i += CHUNK) {
      const rows = approvedActivities.slice(i, i + CHUNK).map((a) => ({
        id: String(a.id),
        tenant_id: TENANT_ID,
        customer_email: a.customer?.email?.toLowerCase().trim() ?? null,
        activity_type: a.rule?.name ?? 'unknown',
        points_change: a.value,
        description: null,
        created_at: a.created_at,
      }))
      await service.from('loyalty_activities').upsert(rows, { onConflict: 'id' })
    }
  }

  // ── Compute core metrics ──────────────────────────────────────────────────────
  // Filter to only our enrolled customers' emails to avoid cross-merchant activity noise.
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const ownActivities30d = activities.filter((a) => {
    const email = a.customer?.email?.toLowerCase().trim()
    return email && enrolledEmails.has(email) && new Date(a.created_at) >= thirtyDaysAgo
  })

  // Include all states (approved + pending) so purchase points count toward issued.
  // Pending purchase activities (state = "pending") represent real points in-flight.
  const points_issued_30d = ownActivities30d
    .filter((a) => a.value > 0)
    .reduce((s, a) => s + a.value, 0)

  const points_redeemed_30d = ownActivities30d
    .filter((a) => a.value < 0)
    .reduce((s, a) => s + Math.abs(a.value), 0)

  const redemption_rate = points_issued_30d > 0 ? points_redeemed_30d / points_issued_30d : 0

  const redeemerEmails30d = new Set(
    ownActivities30d.filter((a) => a.value < 0).map((a) => a.customer?.email?.toLowerCase().trim())
  )
  const active_redeemers_30d = redeemerEmails30d.size

  const avg_points_balance = customers.length > 0
    ? customers.reduce((s, c) => s + (c.points_approved ?? 0), 0) / customers.length
    : 0

  const total_points_outstanding = customers.reduce((s, c) => s + (c.points_approved ?? 0), 0)
  const points_liability_value = total_points_outstanding * POINT_DOLLAR_VALUE

  // ── Tier breakdown (join with Shopify customers for LTV) ──────────────────────
  const { data: shopifyCustomers } = await service
    .from('customers')
    .select('email, total_spent')
    .eq('tenant_id', TENANT_ID)

  const spendByEmail = new Map(
    (shopifyCustomers ?? []).map((c: { email: string | null; total_spent: number }) => [
      (c.email ?? '').toLowerCase().trim(),
      Number(c.total_spent),
    ])
  )

  const tierMap: Record<string, { count: number; total_spent: number }> = {}
  for (const c of customers) {
    const tier = c.loyalty_tier_membership?.loyalty_tier?.name ?? 'No Tier'
    if (!tierMap[tier]) tierMap[tier] = { count: 0, total_spent: 0 }
    tierMap[tier].count++
    tierMap[tier].total_spent += spendByEmail.get((c.email ?? '').toLowerCase().trim()) ?? 0
  }

  const tier_breakdown = Object.entries(tierMap).map(([tier, data]) => ({
    tier,
    count: data.count,
    avg_ltv: data.count > 0 ? Math.round((data.total_spent / data.count) * 100) / 100 : 0,
  }))

  // ── Top redeemers ────────────────────────────────────────────────────────────
  const top_redeemers = [...customers]
    .sort((a, b) => (b.points_spent ?? 0) - (a.points_spent ?? 0))
    .slice(0, 20)
    .map((c) => ({
      email: c.email,
      points_redeemed: c.points_spent ?? 0,
      ltv: spendByEmail.get((c.email ?? '').toLowerCase().trim()) ?? 0,
      tier: c.loyalty_tier_membership?.loyalty_tier?.name ?? null,
    }))

  // ── Rewards catalog ──────────────────────────────────────────────────────────
  const rewards_catalog = rewards.map((r) => ({
    id: r.id,
    name: r.name,
    points_price: r.points_price,
    discount_type: r.discount_type,
    discount_value: r.discount_value,
    redemptions_count: r.redemptions_count,
    dollar_value: r.points_price * POINT_DOLLAR_VALUE,
  }))

  // ── Promotion response analysis (lift per points-multiplier campaign) ─────────
  // completedCampaigns already computed above when deciding activity date range.

  const promotion_response_rate: PromotionResult[] = []

  // Load all paid orders once — email + created_at — to avoid per-campaign queries
  const allOrderRows: { email: string; created_at: string }[] = []
  {
    let from = 0
    while (true) {
      const { data } = await service
        .from('orders')
        .select('email, created_at')
        .eq('store_id', STORE_ID)
        .eq('financial_status', 'paid')
        .range(from, from + 999)
      if (!data || data.length === 0) break
      for (const o of data) if (o.email) allOrderRows.push({ email: (o.email as string).toLowerCase().trim(), created_at: o.created_at as string })
      if (data.length < 1000) break
      from += 1000
    }
  }

  for (const camp of completedCampaigns.slice(0, 15)) {
    const campStart = new Date(camp.started_at!)
    const campEnd   = new Date(camp.ended_at!)
    const before14Start = new Date(campStart.getTime() - 14 * 86400000)

    // Participants = customers who earned points during campaign window
    const campActivities = approvedActivities.filter((a) => {
      const d = new Date(a.created_at)
      return d >= campStart && d <= campEnd && a.value > 0
    })

    const participantSet = new Set(
      campActivities
        .map((a) => a.customer?.email?.toLowerCase().trim())
        .filter((e): e is string => !!e)
    )

    if (participantSet.size === 0) continue

    // Count orders in time windows for participants
    let ordersDuring = 0
    let ordersBefore = 0

    for (const o of allOrderRows) {
      if (!participantSet.has(o.email)) continue
      const d = new Date(o.created_at)
      if (d >= campStart && d <= campEnd) ordersDuring++
      else if (d >= before14Start && d < campStart) ordersBefore++
    }

    const campDays = Math.max(1, (campEnd.getTime() - campStart.getTime()) / 86400000)
    const dailyDuring = ordersDuring / campDays
    const dailyBefore = ordersBefore / 14

    const liftPct = dailyBefore > 0
      ? Math.round(((dailyDuring - dailyBefore) / dailyBefore) * 1000) / 10
      : null

    const incrementalOrders = dailyBefore > 0
      ? Math.round(ordersDuring - dailyBefore * campDays)
      : 0

    const verdict =
      liftPct === null       ? 'Insufficient data (no baseline orders)'
      : liftPct > 20         ? 'Strong lift — drove incremental purchases'
      : liftPct > 5          ? 'Moderate lift'
      : liftPct > -5         ? 'Neutral — no measurable impact'
      : 'Negative lift — purchases declined during campaign'

    promotion_response_rate.push({
      campaign_id: camp.id,
      campaign_name: camp.name,
      started_at: camp.started_at,
      ended_at: camp.ended_at,
      multiplier: camp.points_multiplier,
      participants: participantSet.size,
      orders_during: ordersDuring,
      orders_before_14d: ordersBefore,
      lift_pct: liftPct,
      incremental_orders: incrementalOrders,
      verdict,
    })
  }

  // ── Write loyalty_metrics_cache ───────────────────────────────────────────────
  const { error: cacheError } = await service.from('loyalty_metrics_cache').upsert({
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
    rewards_catalog,
    calculated_at: new Date().toISOString(),
  }, { onConflict: 'tenant_id' })

  if (cacheError) throw new Error(`Failed to write loyalty_metrics_cache: ${cacheError.message}`)

  return {
    ok: true,
    synced: {
      customers: customers.length,
      activities: approvedActivities.length,
      rewards: rewards.length,
      campaigns: campaigns.length,
      campaigns_analyzed: promotion_response_rate.length,
    },
    metrics: {
      enrolled_customers: customers.length,
      active_redeemers_30d,
      redemption_rate: Math.round(redemption_rate * 10000) / 10000,
      points_liability_value: Math.round(points_liability_value * 100) / 100,
    },
  }
}
