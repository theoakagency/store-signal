/**
 * POST /api/customers/build-profiles?batch=N
 *
 * Builds unified customer profiles from the orders table.
 * Drops the line_items join so each call is lightweight enough to handle
 * 43k+ distinct emails within the 300s timeout.
 *
 * Call sequentially for each batch:
 *   POST /api/customers/build-profiles?batch=0   → returns { totalBatches, ... }
 *   POST /api/customers/build-profiles?batch=1
 *   ...
 *   POST /api/customers/build-profiles?batch=N   → also writes overlap cache
 *
 * LTV percentile thresholds are computed from ALL emails on every call so
 * each batch's segments are consistent with the full population.
 */
import { NextRequest } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'

export const maxDuration = 300

const TENANT_ID  = '00000000-0000-0000-0000-000000000001'
const STORE_ID   = '00000000-0000-0000-0000-000000000002'
const BATCH_SIZE = 5000

interface OrderRow {
  email: string | null
  total_price: string
  processed_at: string | null
  created_at: string
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const url   = new URL(req.url)
  const batch = Math.max(0, parseInt(url.searchParams.get('batch') ?? '0', 10))

  const service = createSupabaseServiceClient()

  // ── Fetch source data in parallel ────────────────────────────────────────────
  // Orders: lightweight columns only (no line_items).
  // Subscriptions + loyalty: small tables, fetch all.
  const [ordersResult, subsResult, loyaltyResult] = await Promise.all([
    service
      .from('orders')
      .select('email, total_price, processed_at, created_at')
      .eq('store_id', STORE_ID)
      .eq('financial_status', 'paid'),
    service
      .from('recharge_subscriptions')
      .select('customer_email, status, price, charge_interval_frequency, order_interval_unit')
      .eq('tenant_id', TENANT_ID),
    service
      .from('loyalty_customers')
      .select('email, tier, points_balance, points_spent_total')
      .eq('tenant_id', TENANT_ID),
  ])

  const orders = (ordersResult.data ?? []) as OrderRow[]

  // ── Build subscription map (email → best active sub) ─────────────────────────
  const subsByEmail = new Map<string, { status: string; interval: string; mrr: number }>()
  for (const sub of subsResult.data ?? []) {
    if (!sub.customer_email) continue
    const email = sub.customer_email.toLowerCase()
    if (!subsByEmail.has(email) || sub.status === 'active') {
      const freq  = sub.charge_interval_frequency ?? 1
      const unit  = (sub.order_interval_unit ?? 'month') as string
      const price = Number(sub.price) || 0
      let mrr = price
      if (unit === 'week') mrr = price * (52 / 12)
      else if (unit === 'day') mrr = price * (365 / 12)
      subsByEmail.set(email, {
        status:   sub.status ?? '',
        interval: `Every ${freq} ${unit}`,
        mrr:      Math.round(mrr * 100) / 100,
      })
    }
  }

  // ── Build loyalty map ─────────────────────────────────────────────────────────
  const loyaltyByEmail = new Map<string, { tier: string; balance: number; spent: number }>()
  for (const lc of loyaltyResult.data ?? []) {
    if (!lc.email) continue
    loyaltyByEmail.set(lc.email.toLowerCase(), {
      tier:    lc.tier ?? '',
      balance: lc.points_balance ?? 0,
      spent:   lc.points_spent_total ?? 0,
    })
  }

  // ── Group orders by email ─────────────────────────────────────────────────────
  interface CustomerAgg { amounts: number[]; timestamps: number[] }
  const byEmail = new Map<string, CustomerAgg>()

  for (const order of orders) {
    const email = (order.email ?? '').toLowerCase().trim()
    if (!email) continue
    if (!byEmail.has(email)) byEmail.set(email, { amounts: [], timestamps: [] })
    const agg = byEmail.get(email)!
    agg.amounts.push(Number(order.total_price))
    agg.timestamps.push(new Date(order.processed_at ?? order.created_at).getTime())
  }

  // ── Compute LTV percentile thresholds across ALL customers ───────────────────
  const allRevenues = Array.from(byEmail.values())
    .map((c) => c.amounts.reduce((s, v) => s + v, 0))
    .sort((a, b) => a - b)

  const n   = allRevenues.length
  const p50 = allRevenues[Math.floor(n * 0.50)] ?? 0
  const p75 = allRevenues[Math.floor(n * 0.75)] ?? 0
  const p90 = allRevenues[Math.floor(n * 0.90)] ?? 0
  const p95 = allRevenues[Math.floor(n * 0.95)] ?? 0

  // ── Determine batch slice ─────────────────────────────────────────────────────
  const sortedEmails  = Array.from(byEmail.keys()).sort()
  const totalEmails   = sortedEmails.length
  const totalBatches  = Math.ceil(totalEmails / BATCH_SIZE)
  const batchStart    = batch * BATCH_SIZE
  const batchEmails   = sortedEmails.slice(batchStart, batchStart + BATCH_SIZE)

  if (batchEmails.length === 0) {
    return Response.json({ ok: true, batch, totalBatches, totalEmails, processed: 0 })
  }

  // ── Build profiles for this batch ─────────────────────────────────────────────
  const now = new Date()
  const profiles: Record<string, unknown>[] = []

  for (const email of batchEmails) {
    const { amounts, timestamps } = byEmail.get(email)!

    const sortedTs   = [...timestamps].sort((a, b) => a - b)
    const totalRev   = amounts.reduce((s, v) => s + v, 0)
    const totalOrders = amounts.length
    const avgOV       = totalOrders > 0 ? totalRev / totalOrders : 0

    const firstOrderAt = sortedTs.length > 0 ? new Date(sortedTs[0]).toISOString() : null
    const lastOrderAt  = sortedTs.length > 0 ? new Date(sortedTs[sortedTs.length - 1]).toISOString() : null

    const daysSinceLast = lastOrderAt
      ? Math.floor((now.getTime() - sortedTs[sortedTs.length - 1]) / 86400000)
      : null

    // Average gap between consecutive orders
    let avgDaysBetween = 0
    if (sortedTs.length >= 2) {
      const diffs: number[] = []
      for (let i = 1; i < sortedTs.length; i++) {
        const d = (sortedTs[i] - sortedTs[i - 1]) / 86400000
        if (d > 0) diffs.push(d)
      }
      avgDaysBetween = diffs.length > 0 ? diffs.reduce((s, d) => s + d, 0) / diffs.length : 0
    }

    // Predicted next order
    let predictedNextOrderDate: string | null = null
    if (avgDaysBetween > 0 && lastOrderAt) {
      const p = new Date(sortedTs[sortedTs.length - 1])
      p.setDate(p.getDate() + Math.round(avgDaysBetween))
      predictedNextOrderDate = p.toISOString().slice(0, 10)
    }

    // LTV segment
    let ltvSegment = 'Bronze'
    if (totalRev >= p95)      ltvSegment = 'Diamond'
    else if (totalRev >= p75) ltvSegment = 'Gold'
    else if (totalRev >= p50) ltvSegment = 'Silver'

    // Engagement score (RFM, 0–100)
    let score = 0
    // Recency: 40pts
    if (daysSinceLast !== null) {
      if (daysSinceLast <= 30)       score += 40
      else if (daysSinceLast <= 60)  score += 30
      else if (daysSinceLast <= 90)  score += 20
      else if (daysSinceLast <= 120) score += 10
    }
    // Frequency: 30pts
    if (totalOrders >= 10)      score += 30
    else if (totalOrders >= 5)  score += 20
    else if (totalOrders >= 3)  score += 15
    else if (totalOrders >= 2)  score += 10
    else                        score += 5
    // Monetary: 30pts
    if (totalRev >= p90)      score += 30
    else if (totalRev >= p75) score += 20
    else if (totalRev >= p50) score += 10
    else                      score += 5

    // Platform membership
    const sub         = subsByEmail.get(email)
    const isSubscriber = !!(sub && sub.status === 'active')
    const loyalty      = loyaltyByEmail.get(email)
    const isLoyalty    = !!loyalty

    // Lifecycle segment
    let segment = 'lapsed'
    if (totalOrders === 0) segment = 'new'
    else if (totalRev >= p90) segment = 'vip'
    else if (daysSinceLast !== null && daysSinceLast < 90)  segment = 'active'
    else if (daysSinceLast !== null && daysSinceLast < 180) segment = 'at_risk'

    profiles.push({
      tenant_id:               TENANT_ID,
      email,
      total_orders:            totalOrders,
      total_revenue:           Math.round(totalRev * 100) / 100,
      avg_order_value:         Math.round(avgOV * 100) / 100,
      first_order_at:          firstOrderAt,
      last_order_at:           lastOrderAt,
      days_since_last_order:   daysSinceLast,
      avg_days_between_orders: Math.round(avgDaysBetween * 100) / 100,
      segment,
      is_subscriber:           isSubscriber,
      subscription_interval:   sub?.interval ?? null,
      subscription_mrr:        sub?.mrr ?? 0,
      is_loyalty_member:       isLoyalty,
      loyalty_tier:            loyalty?.tier ?? null,
      loyalty_points_balance:  loyalty?.balance ?? 0,
      loyalty_points_spent:    loyalty?.spent ?? 0,
      predicted_next_order_date: predictedNextOrderDate,
      ltv_segment:             ltvSegment,
      engagement_score:        score,
      calculated_at:           now.toISOString(),
      // top_products, first_product_bought, most_recent_product intentionally
      // omitted — existing values in the DB are preserved on upsert conflict.
    })
  }

  // ── Upsert in chunks of 500 ───────────────────────────────────────────────────
  const CHUNK = 500
  for (let i = 0; i < profiles.length; i += CHUNK) {
    const { error } = await service
      .from('customer_profiles')
      .upsert(profiles.slice(i, i + CHUNK), { onConflict: 'tenant_id,email' })
    if (error) {
      return Response.json({ error: `Profile upsert failed: ${error.message}` }, { status: 500 })
    }
  }

  // ── Final batch: compute overlap from all stored profiles ─────────────────────
  if (batch === totalBatches - 1) {
    const { data: allProfiles } = await service
      .from('customer_profiles')
      .select('is_subscriber, is_loyalty_member, total_revenue')
      .eq('tenant_id', TENANT_ID)

    let subscribersOnly = 0, loyaltyOnly = 0, vipOnly = 0
    let subAndLoyalty = 0, subAndVip = 0, loyaltyAndVip = 0, allThree = 0

    for (const p of allProfiles ?? []) {
      const isSub  = !!p.is_subscriber
      const isLoy  = !!p.is_loyalty_member
      const isVip  = Number(p.total_revenue) >= p90

      if (isSub && isLoy && isVip)  allThree++
      else if (isSub && isLoy)      subAndLoyalty++
      else if (isSub && isVip)      subAndVip++
      else if (isLoy && isVip)      loyaltyAndVip++
      else if (isSub)               subscribersOnly++
      else if (isLoy)               loyaltyOnly++
      else if (isVip)               vipOnly++
    }

    await service.from('customer_overlap_cache').upsert({
      tenant_id:              TENANT_ID,
      total_customers:        allProfiles?.length ?? totalEmails,
      subscribers_only:       subscribersOnly,
      loyalty_only:           loyaltyOnly,
      vip_only:               vipOnly,
      subscriber_and_loyalty: subAndLoyalty,
      subscriber_and_vip:     subAndVip,
      loyalty_and_vip:        loyaltyAndVip,
      all_three:              allThree,
      calculated_at:          now.toISOString(),
    }, { onConflict: 'tenant_id' })
  }

  return Response.json({
    ok:           true,
    batch,
    totalBatches,
    totalEmails,
    processed:    profiles.length,
  })
}
