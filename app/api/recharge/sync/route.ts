/**
 * POST /api/recharge/sync
 * Fetches all Recharge subscription data and caches computed metrics.
 */
import { NextRequest } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'
import {
  getSubscriptions,
  getCharges,
  toMonthlyRevenue,
  type RechargeSubscription,
} from '@/lib/recharge'

export const maxDuration = 300

const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const STORE_ID  = '00000000-0000-0000-0000-000000000002'

// Adhesive product keywords (case-insensitive)
const ADHESIVE_KEYWORDS = ['adhesive', 'glue', 'bond', 'lash glue', 'mega bond', 'sensitive bond']

function isAdhesive(title: string): boolean {
  const lower = title.toLowerCase()
  return ADHESIVE_KEYWORDS.some((kw) => lower.includes(kw))
}

export async function POST(_req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createSupabaseServiceClient()

  const { data: store } = await service
    .from('stores')
    .select('recharge_api_token')
    .eq('id', STORE_ID)
    .single()

  const apiToken = (store as { recharge_api_token: string | null } | null)?.recharge_api_token
  if (!apiToken) return Response.json({ error: 'Recharge not connected' }, { status: 400 })

  // ── Fetch subscriptions ──────────────────────────────────────────────────────
  const [active, cancelled, expired] = await Promise.all([
    getSubscriptions(apiToken, 'ACTIVE'),
    getSubscriptions(apiToken, 'CANCELLED'),
    getSubscriptions(apiToken, 'EXPIRED'),
  ])
  const allSubscriptions = [...active, ...cancelled, ...expired]

  // ── Fetch last 12 months of charges ─────────────────────────────────────────
  const twelveMonthsAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()
  const now = new Date().toISOString()
  const charges = await getCharges(apiToken, { from: twelveMonthsAgo, to: now })

  // ── Upsert subscriptions ─────────────────────────────────────────────────────
  if (allSubscriptions.length > 0) {
    const rows = allSubscriptions.map((s: RechargeSubscription) => ({
      id: String(s.id),
      tenant_id: TENANT_ID,
      customer_id: String(s.customer_id),
      customer_email: s.customer?.email ?? null,
      status: s.status,
      product_title: s.product_title,
      variant_title: s.variant_title ?? null,
      price: parseFloat(s.price),
      quantity: s.quantity,
      charge_interval_frequency: s.charge_interval_frequency,
      order_interval_unit: s.order_interval_unit,
      created_at: s.created_at,
      cancelled_at: s.cancelled_at ?? null,
      next_charge_scheduled_at: s.next_charge_scheduled_at ?? null,
    }))
    await service.from('recharge_subscriptions').upsert(rows, { onConflict: 'id' })
  }

  // ── Upsert charges ───────────────────────────────────────────────────────────
  if (charges.length > 0) {
    const chargeRows = charges.map((c) => ({
      id: String(c.id),
      tenant_id: TENANT_ID,
      subscription_id: c.subscription_id ? String(c.subscription_id) : null,
      customer_email: c.customer?.email ?? null,
      status: c.status,
      total_price: parseFloat(c.total_price),
      scheduled_at: c.scheduled_at,
      processed_at: c.processed_at ?? null,
    }))
    await service.from('recharge_charges').upsert(chargeRows, { onConflict: 'id' })
  }

  // ── Compute metrics ──────────────────────────────────────────────────────────

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  // Active subscribers
  const activeSubscriptions = allSubscriptions.filter((s) => s.status === 'ACTIVE')
  const activeSubscribers = activeSubscriptions.length

  // MRR
  let mrr = 0
  const intervalCounts: Record<string, { count: number; mrr: number }> = {
    '3w': { count: 0, mrr: 0 },
    '4w': { count: 0, mrr: 0 },
    '6w': { count: 0, mrr: 0 },
    other: { count: 0, mrr: 0 },
  }

  const productMrr: Record<string, { count: number; mrr: number; intervals: number[] }> = {}

  for (const sub of activeSubscriptions) {
    const price = parseFloat(sub.price)
    const monthly = toMonthlyRevenue(price, sub.quantity, sub.charge_interval_frequency, sub.order_interval_unit)
    mrr += monthly

    // Interval bucketing (week-based)
    let bucket = 'other'
    if (sub.order_interval_unit === 'week') {
      if (sub.charge_interval_frequency === 3) bucket = '3w'
      else if (sub.charge_interval_frequency === 4) bucket = '4w'
      else if (sub.charge_interval_frequency === 6) bucket = '6w'
    }
    if (intervalCounts[bucket]) {
      intervalCounts[bucket].count++
      intervalCounts[bucket].mrr += monthly
    }

    // Per-product tracking
    const key = sub.product_title
    if (!productMrr[key]) productMrr[key] = { count: 0, mrr: 0, intervals: [] }
    productMrr[key].count++
    productMrr[key].mrr += monthly
    productMrr[key].intervals.push(sub.charge_interval_frequency)
  }

  const arr = mrr * 12

  // Avg subscription value
  const avgSubscriptionValue = activeSubscribers > 0
    ? activeSubscriptions.reduce((s, sub) => s + parseFloat(sub.price), 0) / activeSubscribers
    : 0

  // Top subscribed product
  const topProduct = Object.entries(productMrr).sort((a, b) => b[1].mrr - a[1].mrr)[0]
  const topSubscribedProduct = topProduct?.[0] ?? null

  // Churn rate 30d
  const cancelledLast30d = allSubscriptions.filter(
    (s) => s.status === 'CANCELLED' && s.cancelled_at && new Date(s.cancelled_at) >= thirtyDaysAgo
  ).length
  const activeThirtyDaysAgo = allSubscriptions.filter(
    (s) => s.created_at && new Date(s.created_at) <= thirtyDaysAgo && (s.status === 'ACTIVE' || (s.cancelled_at && new Date(s.cancelled_at) >= thirtyDaysAgo))
  ).length
  const churnRate30d = activeThirtyDaysAgo > 0 ? cancelledLast30d / activeThirtyDaysAgo : 0

  // Product breakdown
  const productBreakdown = Object.entries(productMrr)
    .sort((a, b) => b[1].mrr - a[1].mrr)
    .slice(0, 20)
    .map(([name, data]) => {
      const avgInterval = data.intervals.length > 0
        ? Math.round(data.intervals.reduce((a, b) => a + b, 0) / data.intervals.length)
        : null
      return {
        name,
        active_subscribers: data.count,
        mrr: Math.round(data.mrr * 100) / 100,
        pct_of_total: mrr > 0 ? Math.round((data.mrr / mrr) * 1000) / 10 : 0,
        avg_interval: avgInterval,
      }
    })

  // Subscriber vs non-subscriber LTV
  const subscriberEmails = new Set(allSubscriptions.map((s) => s.customer?.email).filter(Boolean))

  const { data: allCustomers } = await service
    .from('customers')
    .select('email, total_spent, orders_count')
    .eq('tenant_id', TENANT_ID)

  const subCustomers = (allCustomers ?? []).filter((c) => c.email && subscriberEmails.has(c.email))
  const nonSubCustomers = (allCustomers ?? []).filter((c) => !c.email || !subscriberEmails.has(c.email))

  function avgLtv(customers: { total_spent: string | number; orders_count: number }[]) {
    if (customers.length === 0) return { ltv: 0, orders: 0, aov: 0 }
    const totalSpent = customers.reduce((s, c) => s + Number(c.total_spent), 0)
    const totalOrders = customers.reduce((s, c) => s + c.orders_count, 0)
    return {
      ltv: Math.round((totalSpent / customers.length) * 100) / 100,
      orders: Math.round((totalOrders / customers.length) * 10) / 10,
      aov: totalOrders > 0 ? Math.round((totalSpent / totalOrders) * 100) / 100 : 0,
    }
  }

  const subLtv = avgLtv(subCustomers)
  const nonSubLtv = avgLtv(nonSubCustomers)
  const ltvMultiplier = nonSubLtv.ltv > 0 ? Math.round((subLtv.ltv / nonSubLtv.ltv) * 10) / 10 : null

  const subscriberVsNonsubscriberLtv = {
    subscribers: { count: subCustomers.length, ...subLtv },
    non_subscribers: { count: nonSubCustomers.length, ...nonSubLtv },
    ltv_multiplier: ltvMultiplier,
  }

  // Adhesive conversion opportunity
  const { data: recentOrders } = await service
    .from('orders')
    .select('email')
    .eq('tenant_id', TENANT_ID)
    .gte('created_at', new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString())

  const { data: lineItems } = await service
    .from('order_line_items')
    .select('order_id, title, email')
    .eq('tenant_id', TENANT_ID)
    .gte('created_at', new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString())

  const adhesiveBuyerEmails = new Set(
    (lineItems ?? [])
      .filter((li: { title: string }) => isAdhesive(li.title))
      .map((li: { email: string }) => li.email)
      .filter(Boolean)
  )

  const activeSubEmails = new Set(activeSubscriptions.map((s) => s.customer?.email).filter(Boolean))

  const adhesiveNonSubscribers = [...adhesiveBuyerEmails].filter(
    (email) => !activeSubEmails.has(email)
  ).length

  const adhesivePenetration = adhesiveBuyerEmails.size > 0
    ? activeSubEmails.size / adhesiveBuyerEmails.size
    : 0

  // Interval breakdown (rounded MRR)
  const intervalBreakdown = Object.fromEntries(
    Object.entries(intervalCounts).map(([k, v]) => [
      k,
      {
        count: v.count,
        mrr: Math.round(v.mrr * 100) / 100,
        pct: activeSubscribers > 0 ? Math.round((v.count / activeSubscribers) * 1000) / 10 : 0,
      },
    ])
  )

  // ── Cache metrics ────────────────────────────────────────────────────────────
  await service.from('recharge_metrics_cache').upsert({
    tenant_id: TENANT_ID,
    active_subscribers: activeSubscribers,
    mrr: Math.round(mrr * 100) / 100,
    arr: Math.round(arr * 100) / 100,
    avg_subscription_value: Math.round(avgSubscriptionValue * 100) / 100,
    churn_rate_30d: Math.round(churnRate30d * 10000) / 10000,
    top_subscribed_product: topSubscribedProduct,
    interval_breakdown: intervalBreakdown,
    subscriber_vs_nonsubscriber_ltv: subscriberVsNonsubscriberLtv,
    product_breakdown: productBreakdown,
    adhesive_penetration: Math.round(adhesivePenetration * 10000) / 10000,
    adhesive_nonsubscribers: adhesiveNonSubscribers,
    calculated_at: new Date().toISOString(),
  }, { onConflict: 'tenant_id' })

  return Response.json({
    ok: true,
    synced: {
      subscriptions: allSubscriptions.length,
      charges: charges.length,
    },
    metrics: {
      active_subscribers: activeSubscribers,
      mrr: Math.round(mrr * 100) / 100,
      arr: Math.round(arr * 100) / 100,
      churn_rate_30d: Math.round(churnRate30d * 10000) / 10000,
    },
  })
}
