/**
 * POST /api/products/analyze
 * 3-step product intelligence analysis:
 *   1. Product stats (revenue, repeat rates, subscription conversion)
 *   2. Market basket analysis (product affinity pairs)
 *   3. Purchase sequences (first product → second product within 90 days)
 */
import { NextRequest } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'

export const maxDuration = 300

const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const STORE_ID  = '00000000-0000-0000-0000-000000000002'

interface LineItem {
  title: string
  variant_title?: string
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

  // Fetch all subscriptions regardless of status — a customer who subscribed
  // and later cancelled still counts as having converted. Filtering to active-only
  // causes 0% rates for products where most subscribers have churned.
  const { data: subsData } = await service
    .from('recharge_subscriptions')
    .select('customer_email, product_title')
    .eq('tenant_id', TENANT_ID)

  // Paginate through orders to bypass PostgREST max-rows limit.
  // line_items JSONB is needed for product analysis so we keep it,
  // but use a smaller page size (2,000) to keep response payloads manageable.
  const orders: OrderRow[] = []
  const PAGE = 1000  // must be ≤ Supabase max-rows so the "< PAGE" sentinel works
  let from = 0
  while (true) {
    const { data, error } = await service
      .from('orders')
      .select('email, total_price, processed_at, created_at, line_items')
      .eq('store_id', STORE_ID)
      .eq('financial_status', 'paid')
      .order('processed_at', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error || !data || data.length === 0) break
    orders.push(...(data as unknown as OrderRow[]))
    if (data.length < PAGE) break
    from += PAGE
  }

  const totalOrderCount = orders.length

  // Build subscriber email set for conversion rate calculations
  const subscriberEmails = new Set<string>()
  const subscribedProductTitles = new Set<string>()
  for (const sub of subsData ?? []) {
    if (sub.customer_email) subscriberEmails.add(sub.customer_email.toLowerCase())
    if (sub.product_title) subscribedProductTitles.add(sub.product_title.toLowerCase())
  }

  const now30d  = Date.now() - 30  * 86400000
  const now90d  = Date.now() - 90  * 86400000
  const now365d = Date.now() - 365 * 86400000

  // ── Step 1: Product Stats ─────────────────────────────────────────────────────

  interface ProductAgg {
    title: string
    variant: string
    totalRevenue: number
    totalQty: number
    totalOrders: number
    revenue30d: number
    revenue90d: number
    revenue12m: number
    orderTotals: number[]
    // email → sorted order dates
    customerDates: Map<string, string[]>
  }

  const productMap = new Map<string, ProductAgg>()

  for (const order of orders) {
    const orderTs   = new Date(order.processed_at ?? order.created_at).getTime()
    const email     = (order.email ?? '').toLowerCase().trim()
    const orderTotal = Number(order.total_price)
    const items     = (order.line_items ?? []) as LineItem[]

    for (const item of items) {
      if (!item.title) continue
      const key = `${item.title}__${item.variant_title ?? ''}`

      if (!productMap.has(key)) {
        productMap.set(key, {
          title: item.title,
          variant: item.variant_title ?? '',
          totalRevenue: 0,
          totalQty: 0,
          totalOrders: 0,
          revenue30d: 0,
          revenue90d: 0,
          revenue12m: 0,
          orderTotals: [],
          customerDates: new Map(),
        })
      }

      const p = productMap.get(key)!
      const itemRevenue = parseFloat(item.price || '0') * (item.quantity || 1)
      p.totalRevenue += itemRevenue
      p.totalQty     += item.quantity || 1
      p.totalOrders  += 1
      p.orderTotals.push(orderTotal)
      if (orderTs >= now30d)  p.revenue30d  += itemRevenue
      if (orderTs >= now90d)  p.revenue90d  += itemRevenue
      if (orderTs >= now365d) p.revenue12m  += itemRevenue

      if (email) {
        if (!p.customerDates.has(email)) p.customerDates.set(email, [])
        p.customerDates.get(email)!.push(order.processed_at ?? order.created_at)
      }
    }
  }

  const productStatRows: Record<string, unknown>[] = []
  const now = new Date().toISOString()

  for (const p of productMap.values()) {
    const uniqueCustomers = p.customerDates.size
    const avgOV = p.orderTotals.length > 0
      ? p.orderTotals.reduce((s, v) => s + v, 0) / p.orderTotals.length
      : 0

    let repeatCount = 0
    const repurchaseDays: number[] = []
    for (const dates of p.customerDates.values()) {
      if (dates.length > 1) {
        repeatCount++
        const sorted = dates.map((d) => new Date(d).getTime()).sort((a, b) => a - b)
        repurchaseDays.push((sorted[1] - sorted[0]) / 86400000)
      }
    }
    const repeatRate        = uniqueCustomers > 0 ? repeatCount / uniqueCustomers : 0
    const avgDaysRepurchase = repurchaseDays.length > 0
      ? repurchaseDays.reduce((s, d) => s + d, 0) / repurchaseDays.length
      : 0

    let subBuyers = 0
    for (const email of p.customerDates.keys()) {
      if (subscriberEmails.has(email)) subBuyers++
    }
    const subConversionRate = uniqueCustomers > 0 ? subBuyers / uniqueCustomers : 0
    const isSubscribable    = subscribedProductTitles.has(p.title.toLowerCase())

    productStatRows.push({
      tenant_id: TENANT_ID,
      product_title: p.title,
      variant_title: p.variant,
      total_revenue: Math.round(p.totalRevenue * 100) / 100,
      total_quantity_sold: p.totalQty,
      total_orders: p.totalOrders,
      unique_customers: uniqueCustomers,
      avg_order_value_with_product: Math.round(avgOV * 100) / 100,
      repeat_purchase_rate: Math.round(repeatRate * 10000) / 10000,
      avg_days_to_repurchase: Math.round(avgDaysRepurchase * 100) / 100,
      first_purchase_leads_to_second: Math.round(repeatRate * 10000) / 10000,
      subscription_conversion_rate: Math.round(subConversionRate * 10000) / 10000,
      is_subscribable: isSubscribable,
      revenue_30d: Math.round(p.revenue30d * 100) / 100,
      revenue_90d: Math.round(p.revenue90d * 100) / 100,
      revenue_12m: Math.round(p.revenue12m * 100) / 100,
      calculated_at: now,
    })
  }

  const CHUNK = 200
  for (let i = 0; i < productStatRows.length; i += CHUNK) {
    const { error } = await service.from('product_stats').upsert(
      productStatRows.slice(i, i + CHUNK),
      { onConflict: 'tenant_id,product_title,variant_title' }
    )
    if (error) return Response.json({ error: `Product stats failed: ${error.message}` }, { status: 500 })
  }

  // ── Step 2: Market Basket Analysis ───────────────────────────────────────────

  // Count per-product order appearances (denominator for lift)
  const productOrderCount = new Map<string, number>()
  // Order sets of product titles (deduplicated per order)
  const orderSets: string[][] = []

  for (const order of orders) {
    const items = (order.line_items ?? []) as LineItem[]
    const titles = [...new Set(items.map((i) => i.title).filter(Boolean))]
    if (titles.length > 1) orderSets.push(titles)
    for (const t of titles) productOrderCount.set(t, (productOrderCount.get(t) ?? 0) + 1)
  }

  // Count co-occurrences (canonical pair: a < b alphabetically)
  const pairCounts = new Map<string, number>()
  for (const titles of orderSets) {
    for (let i = 0; i < titles.length; i++) {
      for (let j = i + 1; j < titles.length; j++) {
        const a = titles[i] <= titles[j] ? titles[i] : titles[j]
        const b = titles[i] <= titles[j] ? titles[j] : titles[i]
        const key = `${a}|||${b}`
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1)
      }
    }
  }

  const affinityRows: Record<string, unknown>[] = []
  for (const [key, count] of pairCounts) {
    if (count < 5) continue   // minimum threshold for statistical significance
    const [a, b] = key.split('|||')
    const countA = productOrderCount.get(a) ?? 1
    const countB = productOrderCount.get(b) ?? 1
    const pB     = countB / totalOrderCount

    const confAB = count / countA
    const confBA = count / countB
    const liftAB = pB > 0 ? confAB / pB : 0
    const liftBA = countA > 0 ? confBA / (countA / totalOrderCount) : 0

    affinityRows.push({
      tenant_id: TENANT_ID, product_a: a, product_b: b,
      co_purchase_count: count,
      co_purchase_rate: Math.round((count / totalOrderCount) * 10000) / 10000,
      confidence: Math.round(confAB * 10000) / 10000,
      lift: Math.round(liftAB * 100) / 100,
      calculated_at: now,
    }, {
      tenant_id: TENANT_ID, product_a: b, product_b: a,
      co_purchase_count: count,
      co_purchase_rate: Math.round((count / totalOrderCount) * 10000) / 10000,
      confidence: Math.round(confBA * 10000) / 10000,
      lift: Math.round(liftBA * 100) / 100,
      calculated_at: now,
    })
  }

  if (affinityRows.length > 0) {
    await service.from('product_affinities').delete().eq('tenant_id', TENANT_ID)
    for (let i = 0; i < affinityRows.length; i += CHUNK) {
      await service.from('product_affinities').upsert(
        affinityRows.slice(i, i + CHUNK),
        { onConflict: 'tenant_id,product_a,product_b' }
      )
    }
  }

  // ── Step 3: Purchase Sequences ────────────────────────────────────────────────

  // Group orders by customer email, sorted by date
  const customerOrderList = new Map<string, Array<{ date: Date; firstProduct: string; total: number }>>()
  for (const order of orders) {
    const email = (order.email ?? '').toLowerCase().trim()
    if (!email) continue
    const items = (order.line_items ?? []) as LineItem[]
    const firstProduct = items[0]?.title
    if (!firstProduct) continue
    if (!customerOrderList.has(email)) customerOrderList.set(email, [])
    customerOrderList.get(email)!.push({
      date: new Date(order.processed_at ?? order.created_at),
      firstProduct,
      total: Number(order.total_price),
    })
  }

  // Customer total LTV for sequence enrichment
  const customerLTV = new Map<string, number>()
  for (const [email, ol] of customerOrderList) {
    customerLTV.set(email, ol.reduce((s, o) => s + o.total, 0))
  }

  interface SeqAgg { count: number; totalDays: number; emails: Set<string> }
  const sequenceMap = new Map<string, SeqAgg>()

  for (const [email, ol] of customerOrderList) {
    ol.sort((a, b) => a.date.getTime() - b.date.getTime())
    if (ol.length < 2) continue

    const first = ol[0]
    for (let i = 1; i < ol.length; i++) {
      const daysBetween = (ol[i].date.getTime() - first.date.getTime()) / 86400000
      if (daysBetween > 90) break  // only within 90 days of first purchase
      const second = ol[i].firstProduct
      if (second === first.firstProduct) continue
      const seqKey = `${first.firstProduct}|||${second}`
      if (!sequenceMap.has(seqKey)) sequenceMap.set(seqKey, { count: 0, totalDays: 0, emails: new Set() })
      const seq = sequenceMap.get(seqKey)!
      seq.count++
      seq.totalDays += daysBetween
      seq.emails.add(email)
      break  // only first→second transition per customer
    }
  }

  const sequenceRows: Record<string, unknown>[] = []
  for (const [key, seq] of sequenceMap) {
    if (seq.count < 3) continue
    const [firstProduct, secondProduct] = key.split('|||')
    const avgLTV = seq.emails.size > 0
      ? Array.from(seq.emails).reduce((s, e) => s + (customerLTV.get(e) ?? 0), 0) / seq.emails.size
      : 0
    sequenceRows.push({
      tenant_id: TENANT_ID,
      first_product: firstProduct,
      second_product: secondProduct,
      sequence_count: seq.count,
      avg_days_between: Math.round((seq.totalDays / seq.count) * 100) / 100,
      ltv_of_customers_in_sequence: Math.round(avgLTV * 100) / 100,
      calculated_at: now,
    })
  }

  if (sequenceRows.length > 0) {
    await service.from('purchase_sequences').delete().eq('tenant_id', TENANT_ID)
    await service.from('purchase_sequences').upsert(sequenceRows, {
      onConflict: 'tenant_id,first_product,second_product',
    })
  }

  return Response.json({
    ok: true,
    products_analyzed: productStatRows.length,
    affinity_pairs: affinityRows.length / 2,
    sequences: sequenceRows.length,
  })
}
