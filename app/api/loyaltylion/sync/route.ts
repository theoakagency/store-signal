/**
 * POST /api/loyaltylion/sync
 * Fetches all LoyaltyLion data and caches computed metrics.
 */
import { NextRequest } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'
import {
  getCustomers,
  getActivities,
  getRewards,
  getCampaigns,
  type LoyaltyActivity,
  type LoyaltyCampaign,
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
    .select('loyaltylion_token, loyaltylion_secret')
    .eq('id', STORE_ID)
    .single()

  const s = store as { loyaltylion_token: string | null; loyaltylion_secret: string | null } | null
  if (!s?.loyaltylion_token || !s?.loyaltylion_secret) {
    return Response.json({ error: 'LoyaltyLion not connected' }, { status: 400 })
  }

  const { loyaltylion_token: token, loyaltylion_secret: secret } = s

  // ── Fetch data ───────────────────────────────────────────────────────────────
  const twelveMonthsAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()
  const now = new Date().toISOString()

  const [customers, activities, campaigns] = await Promise.all([
    getCustomers(token, secret),
    getActivities(token, secret, { from: twelveMonthsAgo, to: now }),
    getCampaigns(token, secret),
  ])

  // ── Upsert customers ─────────────────────────────────────────────────────────
  if (customers.length > 0) {
    const rows = customers.map((c) => ({
      id: String(c.id),
      tenant_id: TENANT_ID,
      email: c.email,
      points_balance: c.points_balance,
      points_earned_total: c.points_earned_total,
      points_spent_total: c.points_spent_total,
      tier: c.tier?.name ?? null,
      enrolled_at: c.enrolled_at,
      last_activity_at: c.last_activity_at,
    }))
    await service.from('loyalty_customers').upsert(rows, { onConflict: 'id' })
  }

  // ── Upsert activities ────────────────────────────────────────────────────────
  if (activities.length > 0) {
    const rows = activities.map((a) => ({
      id: String(a.id),
      tenant_id: TENANT_ID,
      customer_email: a.customer?.email ?? null,
      activity_type: a.activity_type,
      points_change: a.points_change,
      description: a.description ?? null,
      created_at: a.created_at,
    }))
    await service.from('loyalty_activities').upsert(rows, { onConflict: 'id' })
  }

  // ── Compute metrics ──────────────────────────────────────────────────────────
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const fortyFourDaysAgo = new Date(Date.now() - 44 * 24 * 60 * 60 * 1000)

  const recentActivities = activities.filter(
    (a) => new Date(a.created_at) >= thirtyDaysAgo
  )

  const points_issued_30d = recentActivities
    .filter((a) => a.points_change > 0)
    .reduce((s, a) => s + a.points_change, 0)

  const points_redeemed_30d = recentActivities
    .filter((a) => a.points_change < 0)
    .reduce((s, a) => s + Math.abs(a.points_change), 0)

  const redemption_rate = points_issued_30d > 0 ? points_redeemed_30d / points_issued_30d : 0

  const redeemerEmails30d = new Set(
    recentActivities.filter((a) => a.points_change < 0).map((a) => a.customer?.email)
  )
  const active_redeemers_30d = redeemerEmails30d.size

  const avg_points_balance = customers.length > 0
    ? customers.reduce((s, c) => s + c.points_balance, 0) / customers.length
    : 0

  const total_points_outstanding = customers.reduce((s, c) => s + c.points_balance, 0)
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
    .sort((a, b) => b.points_spent_total - a.points_spent_total)
    .slice(0, 20)
    .map((c) => ({
      email: c.email,
      points_redeemed: c.points_spent_total,
      ltv: spendByEmail.get(c.email) ?? 0,
      tier: c.tier?.name ?? null,
    }))

  // Promotion response analysis — campaign lift
  const promotion_response_rate = await computePromotionLift(campaigns, activities, service)

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
  })
}

async function computePromotionLift(
  campaigns: LoyaltyCampaign[],
  activities: LoyaltyActivity[],
  service: ReturnType<typeof createSupabaseServiceClient>
): Promise<unknown[]> {
  const results = []

  const pointsMultiplierCampaigns = campaigns.filter(
    (c) => c.points_multiplier && c.points_multiplier > 1 && c.started_at
  )

  for (const campaign of pointsMultiplierCampaigns.slice(0, 10)) {
    if (!campaign.started_at) continue

    const startDate = new Date(campaign.started_at)
    const endDate = campaign.ended_at ? new Date(campaign.ended_at) : new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000)

    // Customers who earned points during campaign
    const campaignParticipants = new Set(
      activities
        .filter((a) => {
          const d = new Date(a.created_at)
          return d >= startDate && d <= endDate && a.points_change > 0
        })
        .map((a) => a.customer?.email)
        .filter(Boolean)
    )

    if (campaignParticipants.size === 0) continue

    const windowDays = Math.round((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000))

    // Orders during campaign window for participants
    const { data: duringOrders } = await service
      .from('orders')
      .select('email')
      .eq('tenant_id', TENANT_ID)
      .eq('financial_status', 'paid')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())
      .in('email', [...campaignParticipants])

    // Orders for same customers in 2 weeks before campaign
    const preWindowStart = new Date(startDate.getTime() - 14 * 24 * 60 * 60 * 1000)
    const { data: beforeOrders } = await service
      .from('orders')
      .select('email')
      .eq('tenant_id', TENANT_ID)
      .eq('financial_status', 'paid')
      .gte('created_at', preWindowStart.toISOString())
      .lt('created_at', startDate.toISOString())
      .in('email', [...campaignParticipants])

    // Normalize to per-day order rates
    const duringRate = (duringOrders?.length ?? 0) / Math.max(windowDays, 1)
    const beforeRate = (beforeOrders?.length ?? 0) / 14
    const lift = beforeRate > 0 ? (duringRate - beforeRate) / beforeRate : null
    const incrementalOrders = Math.round((duringOrders?.length ?? 0) - (beforeRate * windowDays))

    results.push({
      campaign_id: campaign.id,
      campaign_name: campaign.name,
      started_at: campaign.started_at,
      ended_at: campaign.ended_at,
      multiplier: campaign.points_multiplier,
      participants: campaignParticipants.size,
      orders_during: duringOrders?.length ?? 0,
      orders_before_14d: beforeOrders?.length ?? 0,
      lift_pct: lift !== null ? Math.round(lift * 1000) / 10 : null,
      incremental_orders: incrementalOrders,
      verdict: lift === null
        ? 'Insufficient data'
        : lift > 0.1
          ? 'Drove incremental purchases'
          : lift < -0.1
            ? 'No measurable lift (may be coincidental)'
            : 'Minimal lift observed',
    })
  }

  return results
}
