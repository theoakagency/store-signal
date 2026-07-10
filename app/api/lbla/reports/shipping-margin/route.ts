/**
 * GET /api/lbla/reports/shipping-margin?start=YYYY-MM-DD&end=YYYY-MM-DD
 * Requires a signed-in user; /lbla + /api/lbla are gated behind Supabase login in proxy.ts (LBLA team tool)
 *
 * Compares what customers paid for shipping at checkout (orders.shipping_charged)
 * against what LashBox actually paid the carrier for the label
 * (shipstation_shipments.shipment_cost + insurance_cost), for orders placed in
 * the range. All figures are CARRIER LABEL COST only — not boxes or packing labor.
 *
 * Follows the KLL royalty report precedent:
 *  - financial_status = 'paid', excluding test + cancelled orders
 *  - paginated orders query with a stable sort for correct .range() paging
 *  - chunked .in() lookup of matched ShipStation labels
 *
 * Cost correctness (migration 036): voided and return labels are excluded from
 * every cost sum, and insurance is added on top of shipment_cost.
 */
import { NextRequest } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase'

export const maxDuration = 60

const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const STORE_ID = '00000000-0000-0000-0000-000000000002'

// Order-value buckets on subtotal_price (excludes shipping + tax).
const BUCKETS: Array<{ label: string; min: number; max: number }> = [
  { label: '$0–25', min: 0, max: 25 },
  { label: '$25–50', min: 25, max: 50 },
  { label: '$50–75', min: 50, max: 75 },
  { label: '$75–100', min: 75, max: 100 },
  { label: '$100–150', min: 100, max: 150 },
  { label: '$150+', min: 150, max: Infinity },
]

const LOSS_LEADER_LIMIT = 25

// ── Types ──────────────────────────────────────────────────────────────────────

interface OrderRow {
  shopify_order_id: number
  order_number: string
  fulfillment_status: string | null
  source_name: string | null
  shipping_charged: number | null
  shipping_discounted: number | null
  shipping_method: string | null
  subtotal_price: number | null
}

interface LabelRow {
  shopify_order_id: number | null
  shipment_cost: number | null
  insurance_cost: number | null
  status: string | null
  is_return_label: boolean | null
}

// ── Date helpers ────────────────────────────────────────────────────────────────

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// Default range: trailing 30 days ending today (UTC).
function defaultRange(): { start: string; end: string } {
  const now = new Date()
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - 30)
  return { start: isoDate(start), end: isoDate(end) }
}

// end is inclusive of the selected calendar day → query < (end + 1 day).
function rangeBounds(start: string, end: string): { startISO: string; endISO: string } {
  const [sy, sm, sd] = start.split('-').map(Number)
  const [ey, em, ed] = end.split('-').map(Number)
  const startISO = new Date(Date.UTC(sy, sm - 1, sd)).toISOString()
  const endISO = new Date(Date.UTC(ey, em - 1, ed + 1)).toISOString()
  return { startISO, endISO }
}

// Carrier cost of a single label, or null if it must be excluded (voided/return).
function labelCost(l: LabelRow): number | null {
  if (l.status === 'voided') return null
  if (l.is_return_label === true) return null
  return (l.shipment_cost ?? 0) + (l.insurance_cost ?? 0)
}

// Sum matched (non-voided, non-return) label cost per order id, over any order set.
async function carrierCostByOrder(
  service: ReturnType<typeof createSupabaseServiceClient>,
  orderIds: number[]
): Promise<Map<number, number>> {
  const costByOrder = new Map<number, number>()
  for (let i = 0; i < orderIds.length; i += 500) {
    const chunk = orderIds.slice(i, i + 500)
    const { data, error } = await service
      .from('shipstation_shipments')
      .select('shopify_order_id, shipment_cost, insurance_cost, status, is_return_label')
      .eq('tenant_id', TENANT_ID)
      .in('shopify_order_id', chunk)
    if (error) throw new Error(`ShipStation query failed: ${error.message}`)
    for (const row of (data ?? []) as LabelRow[]) {
      if (row.shopify_order_id === null) continue
      const cost = labelCost(row)
      if (cost === null) continue
      costByOrder.set(row.shopify_order_id, (costByOrder.get(row.shopify_order_id) ?? 0) + cost)
    }
  }
  return costByOrder
}

// ── Route handler ───────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const def = defaultRange()
  const start = req.nextUrl.searchParams.get('start') || def.start
  const end = req.nextUrl.searchParams.get('end') || def.end
  const dateRe = /^\d{4}-\d{2}-\d{2}$/
  if (!dateRe.test(start) || !dateRe.test(end)) {
    return Response.json({ error: 'start and end must be YYYY-MM-DD dates' }, { status: 400 })
  }
  if (start > end) {
    return Response.json({ error: 'start must be on or before end' }, { status: 400 })
  }

  const { startISO, endISO } = rangeBounds(start, end)
  const service = createSupabaseServiceClient()

  // ── Fetch paid orders in range, paginated with a stable sort ────────────────
  const PAGE = 1000
  const orders: OrderRow[] = []
  let from = 0
  while (true) {
    const { data, error } = await service
      .from('orders')
      .select('shopify_order_id, order_number, fulfillment_status, source_name, shipping_charged, shipping_discounted, shipping_method, subtotal_price')
      .eq('store_id', STORE_ID)
      .eq('financial_status', 'paid')
      .neq('test', true)
      .is('cancelled_at', null)
      .gte('processed_at', startISO)
      .lt('processed_at', endISO)
      // Stable sort REQUIRED for correct .range() paging. Sorting by
      // shopify_order_id alone doesn't match orders_store_status_date_idx
      // (store_id, financial_status, processed_at) and forces a full re-sort
      // of the filtered set on every page — that's what was timing out in
      // production. (processed_at, shopify_order_id) rides the index instead;
      // shopify_order_id breaks ties to keep paging deterministic. Same fix
      // as the KLL royalty report (app/api/lbla/reports/kll-royalty/route.ts).
      .order('processed_at', { ascending: true })
      .order('shopify_order_id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) return Response.json({ error: `Orders query failed: ${error.message}` }, { status: 500 })
    if (!data || data.length === 0) break
    orders.push(...(data as OrderRow[]))
    if (data.length < PAGE) break
    from += PAGE
  }

  // ── Matched label cost per order (voided/return excluded) ────────────────────
  const orderIds = [...new Set(orders.map((o) => o.shopify_order_id))]
  let costByOrder: Map<number, number>
  try {
    costByOrder = await carrierCostByOrder(service, orderIds)
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 })
  }

  const isPos = (o: OrderRow) => o.source_name === 'pos'
  const isShipped = (o: OrderRow) => o.fulfillment_status === 'fulfilled'
  const isMatched = (o: OrderRow) => costByOrder.has(o.shopify_order_id)

  // ── Coverage KPIs ────────────────────────────────────────────────────────────
  const shippedNonPos = orders.filter((o) => isShipped(o) && !isPos(o))
  const matchedShipped = shippedNonPos.filter(isMatched)
  const coverage = {
    total_paid_orders: orders.length,
    shipped_orders: shippedNonPos.length,
    pos_orders: orders.filter(isPos).length,
    matched_orders: matchedShipped.length,
    unmatched_shipped: shippedNonPos.length - matchedShipped.length,
    match_rate: shippedNonPos.length ? matchedShipped.length / shippedNonPos.length : 0,
  }

  // ── Margin set: every matched order (both sides known) ───────────────────────
  const matched = orders.filter(isMatched).map((o) => {
    const charged = o.shipping_charged ?? 0
    const paid = costByOrder.get(o.shopify_order_id) ?? 0
    return {
      order_number: o.order_number,
      method: o.shipping_method,
      subtotal: o.subtotal_price ?? 0,
      charged,
      paid,
      margin: charged - paid,
      is_free: charged === 0,
    }
  })

  const sum = (arr: number[]) => arr.reduce((s, n) => s + n, 0)
  const collected = sum(matched.map((m) => m.charged))
  const paidToCarriers = sum(matched.map((m) => m.paid))
  const summary = {
    shipping_collected: collected,
    shipping_paid: paidToCarriers,
    net_margin: collected - paidToCarriers,
    margin_pct: collected > 0 ? (collected - paidToCarriers) / collected : null,
    orders: matched.length,
  }

  // ── Margin by shipping tier ──────────────────────────────────────────────────
  const tierMap = new Map<string, typeof matched>()
  for (const m of matched) {
    const key = m.method ?? '(no tier / pickup)'
    if (!tierMap.has(key)) tierMap.set(key, [])
    tierMap.get(key)!.push(m)
  }
  const by_tier = [...tierMap.entries()]
    .map(([method, ms]) => ({
      method,
      orders: ms.length,
      avg_charged: sum(ms.map((m) => m.charged)) / ms.length,
      avg_paid: sum(ms.map((m) => m.paid)) / ms.length,
      avg_margin: sum(ms.map((m) => m.margin)) / ms.length,
      total_margin: sum(ms.map((m) => m.margin)),
    }))
    .sort((a, b) => b.orders - a.orders)

  // ── Margin by order-value bucket ─────────────────────────────────────────────
  const by_bucket = BUCKETS.map((b) => {
    const ms = matched.filter((m) => m.subtotal >= b.min && m.subtotal < b.max)
    const freeCount = ms.filter((m) => m.is_free).length
    return {
      label: b.label,
      orders: ms.length,
      pct_free: ms.length ? freeCount / ms.length : 0,
      avg_label_cost: ms.length ? sum(ms.map((m) => m.paid)) / ms.length : 0,
      avg_margin: ms.length ? sum(ms.map((m) => m.margin)) / ms.length : 0,
      total_margin: sum(ms.map((m) => m.margin)),
    }
  })

  // ── Free-shipping cost (what threshold-free + code-free shipping costs us) ────
  const freeOrders = matched.filter((m) => m.is_free)
  const free_shipping = {
    orders: freeOrders.length,
    carrier_cost: sum(freeOrders.map((m) => m.paid)),
  }

  // ── Loss leaders: matched orders where carrier cost most exceeded charged ─────
  const loss_leaders = [...matched]
    .filter((m) => m.margin < 0)
    .sort((a, b) => a.margin - b.margin)
    .slice(0, LOSS_LEADER_LIMIT)
    .map((m) => ({
      order_number: m.order_number,
      method: m.method ?? '(no tier / pickup)',
      charged: m.charged,
      paid: m.paid,
      gap: -m.margin, // positive = amount lost on this order's shipping
      subtotal: m.subtotal,
    }))

  // ── Cancelled-after-label: real cost, zero revenue — surfaced separately ─────
  const cancelled: OrderRow[] = []
  from = 0
  while (true) {
    const { data, error } = await service
      .from('orders')
      .select('shopify_order_id, order_number, fulfillment_status, source_name, shipping_charged, shipping_discounted, shipping_method, subtotal_price')
      .eq('store_id', STORE_ID)
      .neq('test', true)
      .not('cancelled_at', 'is', null)
      .gte('processed_at', startISO)
      .lt('processed_at', endISO)
      // Same stable-sort fix as the query above — see that comment.
      .order('processed_at', { ascending: true })
      .order('shopify_order_id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) return Response.json({ error: `Cancelled orders query failed: ${error.message}` }, { status: 500 })
    if (!data || data.length === 0) break
    cancelled.push(...(data as OrderRow[]))
    if (data.length < PAGE) break
    from += PAGE
  }
  let cancelledCostByOrder: Map<number, number>
  try {
    cancelledCostByOrder = await carrierCostByOrder(service, [...new Set(cancelled.map((o) => o.shopify_order_id))])
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 })
  }
  const cancelledWithLabel = cancelled.filter((o) => cancelledCostByOrder.has(o.shopify_order_id))
  const cancelled_with_label = {
    orders: cancelledWithLabel.length,
    carrier_cost: sum(cancelledWithLabel.map((o) => cancelledCostByOrder.get(o.shopify_order_id) ?? 0)),
  }

  // ── Per-order detail (CSV export) ────────────────────────────────────────────
  const detail = matched.map((m) => ({
    order_number: m.order_number,
    shipping_method: m.method ?? '',
    subtotal: m.subtotal,
    charged: m.charged,
    paid: m.paid,
    margin: m.margin,
  }))

  return Response.json({
    range: { start, end },
    coverage,
    summary,
    by_tier,
    by_bucket,
    free_shipping,
    loss_leaders,
    cancelled_with_label,
    detail,
  })
}
