/**
 * POST /api/customers/build-profiles
 * Builds unified customer profiles by joining Shopify orders with Recharge
 * subscriptions and LoyaltyLion data. Calculates engagement scores, LTV
 * segments, and cross-platform overlap metrics.
 */
import { NextRequest } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'

export const maxDuration = 300

const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const STORE_ID  = '00000000-0000-0000-0000-000000000002'

interface LineItem {
  title: string
  price: string
  quantity: number
}

interface OrderRow {
  email: string | null
  total_price: string
  processed_at: string | null
  created_at: string
  line_items: LineItem[] | null
}

export async function POST(_req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createSupabaseServiceClient()

  // ── Fetch all source data in parallel ────────────────────────────────────────
  const [ordersResult, subsResult, loyaltyResult] = await Promise.all([
    service
      .from('orders')
      .select('email, total_price, processed_at, created_at, line_items')
      .eq('store_id', STORE_ID)
      .eq('financial_status', 'paid')
      .order('processed_at', { ascending: true }),
    service
      .from('recharge_subscriptions')
      .select('customer_email, status, price, charge_interval_frequency, order_interval_unit')
      .eq('tenant_id', TENANT_ID),
    service
      .from('loyalty_customers')
      .select('email, tier, points_balance, points_spent_total')
      .eq('tenant_id', TENANT_ID),
  ])

  const orders = (ordersResult.data ?? []) as unknown as OrderRow[]

  // Build subscription map (email → best active subscription)
  const subsByEmail = new Map<string, { status: string; interval: string; mrr: number }>()
  for (const sub of subsResult.data ?? []) {
    if (!sub.customer_email) continue
    const email = sub.customer_email.toLowerCase()
    // Prefer active over cancelled entries for the same email
    if (!subsByEmail.has(email) || sub.status === 'active') {
      const freq = sub.charge_interval_frequency ?? 1
      const unit = (sub.order_interval_unit ?? 'month') as string
      const price = Number(sub.price) || 0
      let mrr = price
      if (unit === 'week') mrr = price * (52 / 12)
      else if (unit === 'day') mrr = price * (365 / 12)
      subsByEmail.set(email, {
        status: sub.status ?? '',
        interval: `Every ${freq} ${unit}`,
        mrr: Math.round(mrr * 100) / 100,
      })
    }
  }

  // Build loyalty map
  const loyaltyByEmail = new Map<string, { tier: string; balance: number; spent: number }>()
  for (const lc of loyaltyResult.data ?? []) {
    if (!lc.email) continue
    loyaltyByEmail.set(lc.email.toLowerCase(), {
      tier: lc.tier ?? '',
      balance: lc.points_balance ?? 0,
      spent: lc.points_spent_total ?? 0,
    })
  }

  // ── Group orders by email ─────────────────────────────────────────────────────
  interface CustomerAgg {
    orders: Array<{ amount: number; date: string; items: LineItem[] }>
  }
  const byEmail = new Map<string, CustomerAgg>()

  for (const order of orders) {
    const email = (order.email ?? '').toLowerCase().trim()
    if (!email) continue
    if (!byEmail.has(email)) byEmail.set(email, { orders: [] })
    byEmail.get(email)!.orders.push({
      amount: Number(order.total_price),
      date: order.processed_at ?? order.created_at,
      items: (order.line_items ?? []) as LineItem[],
    })
  }

  // ── Calculate LTV percentile thresholds ───────────────────────────────────────
  const allRevenues = Array.from(byEmail.values())
    .map((c) => c.orders.reduce((s, o) => s + o.amount, 0))
    .sort((a, b) => a - b)

  const n = allRevenues.length
  const p50 = allRevenues[Math.floor(n * 0.5)] ?? 0
  const p75 = allRevenues[Math.floor(n * 0.75)] ?? 0
  const p90 = allRevenues[Math.floor(n * 0.90)] ?? 0
  const p95 = allRevenues[Math.floor(n * 0.95)] ?? 0

  // ── Build profiles ────────────────────────────────────────────────────────────
  const now = new Date()
  const profiles: Record<string, unknown>[] = []

  for (const [email, { orders: customerOrders }] of byEmail) {
    // Sort ascending by date
    customerOrders.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    const totalRevenue = customerOrders.reduce((s, o) => s + o.amount, 0)
    const totalOrders = customerOrders.length
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0
    const firstOrderAt = customerOrders[0]?.date ?? null
    const lastOrderAt  = customerOrders[totalOrders - 1]?.date ?? null

    const daysSinceLastOrder = lastOrderAt
      ? Math.floor((now.getTime() - new Date(lastOrderAt).getTime()) / 86400000)
      : null

    // Average days between orders
    let avgDaysBetween = 0
    if (totalOrders >= 2) {
      const diffs: number[] = []
      for (let i = 1; i < customerOrders.length; i++) {
        const diff = (new Date(customerOrders[i].date).getTime() - new Date(customerOrders[i - 1].date).getTime()) / 86400000
        if (diff > 0) diffs.push(diff)
      }
      avgDaysBetween = diffs.length > 0 ? diffs.reduce((s, d) => s + d, 0) / diffs.length : 0
    }

    // Predicted next order date
    let predictedNextOrderDate: string | null = null
    if (avgDaysBetween > 0 && lastOrderAt) {
      const predicted = new Date(lastOrderAt)
      predicted.setDate(predicted.getDate() + Math.round(avgDaysBetween))
      predictedNextOrderDate = predicted.toISOString().slice(0, 10)
    }

    // Top products by revenue
    const productRevenue: Record<string, { count: number; revenue: number }> = {}
    for (const order of customerOrders) {
      for (const item of order.items) {
        if (!item.title) continue
        if (!productRevenue[item.title]) productRevenue[item.title] = { count: 0, revenue: 0 }
        productRevenue[item.title].count += item.quantity
        productRevenue[item.title].revenue += parseFloat(item.price) * item.quantity
      }
    }
    const topProducts = Object.entries(productRevenue)
      .sort(([, a], [, b]) => b.revenue - a.revenue)
      .slice(0, 5)
      .map(([title, d]) => ({ title, count: d.count, revenue: Math.round(d.revenue * 100) / 100 }))

    const firstProductBought  = customerOrders[0]?.items[0]?.title ?? null
    const mostRecentProduct   = customerOrders[totalOrders - 1]?.items[0]?.title ?? null

    // LTV segment
    let ltvSegment = 'Bronze'
    if (totalRevenue >= p95) ltvSegment = 'Diamond'
    else if (totalRevenue >= p75) ltvSegment = 'Gold'
    else if (totalRevenue >= p50) ltvSegment = 'Silver'

    // Engagement score (0–100)
    let score = 0
    // Recency: 40pts
    if (daysSinceLastOrder !== null) {
      if (daysSinceLastOrder <= 30) score += 40
      else if (daysSinceLastOrder <= 60) score += 30
      else if (daysSinceLastOrder <= 90) score += 20
      else if (daysSinceLastOrder <= 120) score += 10
    }
    // Frequency: 30pts
    if (totalOrders >= 10) score += 30
    else if (totalOrders >= 5) score += 20
    else if (totalOrders >= 3) score += 15
    else if (totalOrders >= 2) score += 10
    else score += 5
    // Monetary: 30pts
    if (totalRevenue >= p90) score += 30
    else if (totalRevenue >= p75) score += 20
    else if (totalRevenue >= p50) score += 10
    else score += 5

    // Platform membership
    const sub = subsByEmail.get(email)
    const isSubscriber = !!(sub && sub.status === 'active')
    const loyalty = loyaltyByEmail.get(email)
    const isLoyaltyMember = !!loyalty

    // Segment (reuse existing logic)
    let segment = 'lapsed'
    if (totalOrders === 0) segment = 'new'
    else if (totalRevenue >= p90) segment = 'vip'
    else if (daysSinceLastOrder !== null && daysSinceLastOrder < 90) segment = 'active'
    else if (daysSinceLastOrder !== null && daysSinceLastOrder < 180) segment = 'at_risk'

    profiles.push({
      tenant_id: TENANT_ID,
      email,
      total_orders: totalOrders,
      total_revenue: Math.round(totalRevenue * 100) / 100,
      avg_order_value: Math.round(avgOrderValue * 100) / 100,
      first_order_at: firstOrderAt,
      last_order_at: lastOrderAt,
      days_since_last_order: daysSinceLastOrder,
      avg_days_between_orders: Math.round(avgDaysBetween * 100) / 100,
      segment,
      is_subscriber: isSubscriber,
      subscription_interval: sub?.interval ?? null,
      subscription_mrr: sub?.mrr ?? 0,
      is_loyalty_member: isLoyaltyMember,
      loyalty_tier: loyalty?.tier ?? null,
      loyalty_points_balance: loyalty?.balance ?? 0,
      loyalty_points_spent: loyalty?.spent ?? 0,
      top_products: topProducts,
      first_product_bought: firstProductBought,
      most_recent_product: mostRecentProduct,
      predicted_next_order_date: predictedNextOrderDate,
      ltv_segment: ltvSegment,
      engagement_score: score,
      calculated_at: now.toISOString(),
    })
  }

  // ── Upsert profiles in chunks ─────────────────────────────────────────────────
  const CHUNK = 500
  for (let i = 0; i < profiles.length; i += CHUNK) {
    const { error } = await service
      .from('customer_profiles')
      .upsert(profiles.slice(i, i + CHUNK), { onConflict: 'tenant_id,email' })
    if (error) return Response.json({ error: `Profile upsert failed: ${error.message}` }, { status: 500 })
  }

  // ── Calculate and cache overlap metrics ───────────────────────────────────────
  let subscribersOnly = 0, loyaltyOnly = 0, vipOnly = 0
  let subAndLoyalty = 0, subAndVip = 0, loyaltyAndVip = 0, allThree = 0

  for (const profile of profiles) {
    const isSub     = profile.is_subscriber as boolean
    const isLoyalty = profile.is_loyalty_member as boolean
    const isVip     = (profile.total_revenue as number) >= p90

    if (isSub && isLoyalty && isVip)       allThree++
    else if (isSub && isLoyalty)           subAndLoyalty++
    else if (isSub && isVip)               subAndVip++
    else if (isLoyalty && isVip)           loyaltyAndVip++
    else if (isSub)                        subscribersOnly++
    else if (isLoyalty)                    loyaltyOnly++
    else if (isVip)                        vipOnly++
  }

  await service.from('customer_overlap_cache').upsert({
    tenant_id: TENANT_ID,
    total_customers: profiles.length,
    subscribers_only: subscribersOnly,
    loyalty_only: loyaltyOnly,
    vip_only: vipOnly,
    subscriber_and_loyalty: subAndLoyalty,
    subscriber_and_vip: subAndVip,
    loyalty_and_vip: loyaltyAndVip,
    all_three: allThree,
    calculated_at: now.toISOString(),
  }, { onConflict: 'tenant_id' })

  return Response.json({
    ok: true,
    profiles_built: profiles.length,
    overlap: {
      total: profiles.length,
      subscribers_only: subscribersOnly,
      loyalty_only: loyaltyOnly,
      vip_only: vipOnly,
      subscriber_and_loyalty: subAndLoyalty,
      subscriber_and_vip: subAndVip,
      loyalty_and_vip: loyaltyAndVip,
      all_three: allThree,
    },
  })
}
