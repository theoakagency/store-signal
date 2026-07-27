/**
 * GET /api/lbla/reports/kll-discount-summary?month=YYYY-MM
 * Requires a signed-in user; /lbla + /api/lbla are gated behind Supabase login in proxy.ts (LBLA team tool)
 *
 * Every discount that landed on a Korean Lash Lift line in one calendar month,
 * grouped for reading, plus the shipping and gift-with-purchase given away
 * alongside them. lashboxla.com retail only.
 *
 * This is NOT the royalty view. It deliberately ignores allowed_discount_codes:
 * every code counts here, allowlisted or not, because the question is "what did
 * we give away", not "what reduces the royalty".
 *
 * KLLEVENT giveaway orders are excluded entirely, same as the royalty report —
 * see lib/kll.ts, which both routes share so the two cannot disagree.
 */
import { NextRequest } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { TARGET_SKUS, isEventOrder, gwpCost, getDefaultMonth, monthRange, discountCodeGroup } from '@/lib/kll'

export const maxDuration = 60

const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const STORE_ID = '00000000-0000-0000-0000-000000000002'

interface LineItem {
  title: string
  variant_title: string | null
  quantity: number
  // Units refunded (Shopify refund_line_items, via lib/syncShopify.ts). A discount
  // is only "given away" on the units actually kept, so allocations are scaled by
  // the kept fraction below. Null/absent on pre-field orders → treated as 0.
  refunded_quantity: number | null
  price: string
  // The real per-line discount lives here, resolved to its originating code by
  // lib/syncShopify.ts. line_items[].total_discount is "0.00" for every
  // code-based discount on this store, so it is not read anywhere in this route.
  discount_allocations: Array<{ code: string | null; amount: string }> | null
  sku: string | null
}

interface OrderRow {
  shopify_order_id: number
  order_number: string
  line_items: LineItem[]
  discount_codes: Array<{ code: string; amount: string; type: string }> | null
  // shipping_charged is the PRE-discount shipping price; shipping_discounted is
  // the total shipping discount. Customer paid = charged - discounted.
  shipping_charged: number | null
  shipping_discounted: number | null
  // Shipping redeemed with LoyaltyLion points. Points are the customer's own
  // currency, so this is treated as customer-paid rather than given away —
  // consistent with the royalty report. Reported separately so it stays visible.
  shipping_loyalty_covered: boolean | null
}

interface DiscountGroupRow {
  label: string
  total_discounted: number
  order_count: number
  code_count: number
}

export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get('month') || getDefaultMonth()
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return Response.json({ error: 'month must be in YYYY-MM format' }, { status: 400 })
  }

  const { start, end } = monthRange(month)
  const service = createSupabaseServiceClient()

  // ── Fetch paid orders in range, paginated ──────────────────────────────────
  const PAGE = 1000
  const orders: OrderRow[] = []
  let from = 0
  while (true) {
    const { data, error } = await service
      .from('orders')
      .select(
        'shopify_order_id, order_number, line_items, discount_codes, shipping_charged, shipping_discounted, shipping_loyalty_covered'
      )
      .eq('store_id', STORE_ID)
      // Include partially-refunded orders (kept units are still real sales, netted
      // per line below); exclude fully 'refunded' orders. Matches the royalty
      // report and Shopify's "Sales by product".
      .in('financial_status', ['paid', 'partially_refunded'])
      .neq('test', true)
      .is('cancelled_at', null)
      .gte('processed_at', start)
      .lt('processed_at', end)
      // Stable compound sort is REQUIRED for correct .range() pagination — without
      // it PostgREST returns heap order and paging past 1,000 rows silently drops
      // and duplicates orders. Rides orders_store_status_date_idx.
      .order('processed_at', { ascending: true })
      .order('shopify_order_id', { ascending: true })
      .range(from, from + PAGE - 1)

    if (error) return Response.json({ error: `Orders query failed: ${error.message}` }, { status: 500 })
    if (!data || data.length === 0) break
    orders.push(...(data as unknown as OrderRow[]))
    if (data.length < PAGE) break
    from += PAGE
  }

  const kllOrders = orders.filter(
    (o) =>
      (o.line_items ?? []).some((li) => li.sku && TARGET_SKUS.has(li.sku.trim().toUpperCase())) &&
      !isEventOrder(o)
  )

  // ── Discounts by code group ────────────────────────────────────────────────
  // Only allocations sitting on a KLL line are counted: a discount spread across a
  // mixed basket should contribute the KLL share, not the whole order's discount.
  const groups = new Map<string, { total: number; orders: Set<string>; codes: Set<string> }>()
  let uncodedTotal = 0

  for (const order of kllOrders) {
    for (const li of order.line_items ?? []) {
      const sku = li.sku?.trim().toUpperCase()
      if (!sku || !TARGET_SKUS.has(sku)) continue

      // Only the discount on kept units counts as given away. keptFraction is 1
      // for every unrefunded line; a fully refunded line (fraction 0) contributes
      // nothing.
      const originalQty = li.quantity
      const keptQty = originalQty - (li.refunded_quantity ?? 0)
      if (keptQty <= 0) continue
      const keptFraction = originalQty > 0 ? keptQty / originalQty : 0

      for (const alloc of li.discount_allocations ?? []) {
        const amount = (parseFloat(alloc.amount) || 0) * keptFraction
        if (amount === 0) continue
        const raw = alloc.code?.trim()
        // Automatic/script discounts carry no code at all. They are money off with
        // nothing to attribute it to, so they are surfaced as their own total
        // rather than folded into a named row that would then be wrong.
        if (!raw) { uncodedTotal += amount; continue }

        const label = discountCodeGroup(raw)
        const g = groups.get(label) ?? { total: 0, orders: new Set(), codes: new Set() }
        g.total += amount
        g.orders.add(order.order_number)
        g.codes.add(raw.toUpperCase())
        groups.set(label, g)
      }
    }
  }

  const discountRows: DiscountGroupRow[] = [...groups.entries()]
    .map(([label, g]) => ({
      label,
      total_discounted: g.total,
      order_count: g.orders.size,
      code_count: g.codes.size,
    }))
    .sort((a, b) => b.total_discounted - a.total_discounted || a.label.localeCompare(b.label))

  // ── Shipping given away ────────────────────────────────────────────────────
  // The measurable giveaway is an order that WAS quoted a shipping price and then
  // had it discounted to nothing: the pre-discount price is what was forgone.
  //
  // Orders with shipping_charged = 0 shipped without any shipping line at all, so
  // Shopify records no pre-discount price and there is no figure to count. They
  // are counted separately (orders_no_shipping_line) rather than silently ignored,
  // because they are the majority and would otherwise make this total look like
  // the whole free-shipping story when it is not.
  let freeShippingGiven = 0
  let freeShippingOrders = 0
  let loyaltyCoveredShipping = 0
  let ordersNoShippingLine = 0
  let customerPaidShipping = 0

  for (const o of kllOrders) {
    const charged = o.shipping_charged ?? 0
    const discounted = o.shipping_discounted ?? 0
    if (charged === 0) { ordersNoShippingLine++; continue }
    const net = Math.max(0, charged - discounted)
    if (net > 0) { customerPaidShipping += net; continue }
    if (o.shipping_loyalty_covered) loyaltyCoveredShipping += charged
    else { freeShippingGiven += charged; freeShippingOrders++ }
  }

  // ── Actual carrier cost from ShipStation ───────────────────────────────────
  // Joined on shopify_order_id (derived by lib/syncShipStation.ts from the first
  // segment of external_shipment_id). Voided labels are excluded: a voided-then-
  // reprinted label would otherwise double-count its cost (migration 036).
  const orderIds = kllOrders.map((o) => o.shopify_order_id).filter(Boolean)
  let actualShippingCost = 0
  let labelsCounted = 0
  let voidedLabelsExcluded = 0
  const ordersWithLabel = new Set<number>()

  const CHUNK = 300 // keep the .in() list well inside PostgREST's URL length limit
  for (let i = 0; i < orderIds.length; i += CHUNK) {
    const { data, error } = await service
      .from('shipstation_shipments')
      .select('shopify_order_id, shipment_cost, status')
      .eq('tenant_id', TENANT_ID)
      .in('shopify_order_id', orderIds.slice(i, i + CHUNK))

    if (error) return Response.json({ error: `ShipStation query failed: ${error.message}` }, { status: 500 })
    for (const s of data ?? []) {
      if (String(s.status ?? '').toLowerCase() === 'voided') { voidedLabelsExcluded++; continue }
      actualShippingCost += parseFloat(s.shipment_cost) || 0
      labelsCounted++
      if (s.shopify_order_id) ordersWithLabel.add(s.shopify_order_id)
    }
  }

  // ── Gift-with-purchase cost ────────────────────────────────────────────────
  // Same per-line rule the royalty report used, imported rather than reimplemented.
  let totalGwpCost = 0
  for (const o of kllOrders) {
    for (const li of o.line_items ?? []) {
      const sku = li.sku?.trim().toUpperCase()
      if (!sku || !TARGET_SKUS.has(sku)) continue
      // No gift cost for a fully-refunded kit line.
      if (li.quantity - (li.refunded_quantity ?? 0) <= 0) continue
      totalGwpCost += gwpCost(sku, li.title, li.variant_title)
    }
  }

  return Response.json({
    month,
    discounts: {
      rows: discountRows,
      total_discounted: discountRows.reduce((s, r) => s + r.total_discounted, 0),
      uncoded_total: uncodedTotal,
    },
    summary: {
      kll_orders: kllOrders.length,
      free_shipping_given: freeShippingGiven,
      free_shipping_orders: freeShippingOrders,
      orders_no_shipping_line: ordersNoShippingLine,
      loyalty_covered_shipping: loyaltyCoveredShipping,
      customer_paid_shipping: customerPaidShipping,
      actual_shipping_cost: actualShippingCost,
      labels_counted: labelsCounted,
      voided_labels_excluded: voidedLabelsExcluded,
      orders_with_label: ordersWithLabel.size,
      total_gwp_cost: totalGwpCost,
    },
  })
}
