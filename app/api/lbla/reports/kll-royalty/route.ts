/**
 * GET /api/lbla/reports/kll-royalty?month=YYYY-MM
 * Public endpoint — no user auth required (LBLA team tool)
 *
 * Computes the KLL royalty report for one calendar month:
 * gross/net sales and royalty (10% of Final Net) per target-SKU line
 * item, with discount amounts only counted when the order's discount
 * code is on the allowed_discount_codes list, GWP cost deducted for
 * kit SKUs based on title/variant text, and shipping cost allocated
 * from the matched ShipStation label, split evenly across the order's
 * line items.
 */
import { NextRequest } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase'

export const maxDuration = 60

const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const STORE_ID = '00000000-0000-0000-0000-000000000002'

const ROYALTY_RATE = 0.10

// Only these 16 SKUs count toward the KLL royalty
const TARGET_SKUS = new Set([
  'MKLBKLLKTGWP', 'KLLMXGPLT', 'KLLFLTSHD', 'KLLRUSBEYEPD3',
  'KLLBRSH3', 'KLLBRSH2', 'KLLBRSH1', 'KLLEYEPRCWP',
  'KLLESN6', 'KLLLBA', 'KLLVCG', 'KLLST2NL',
  'KLLST1LSL', 'KLLPTPRM', 'KLLST3TM', 'MKLBKLLKT',
])

// Kit SKUs get GWP cost deductions and are ineligible for most discount codes
const KIT_SKUS = new Set(['MKLBKLLKT', 'MKLBKLLKTGWP'])

interface LineItem {
  id: number
  title: string
  variant_title: string | null
  quantity: number
  price: string
  total_discount: string
  // Per-line discount amounts resolved to their originating code by the Shopify
  // sync (lib/syncShopify.ts). Shopify reports total_discount = "0.00" for
  // order-level code discounts, so the real per-line amount is read from here.
  // code is null for automatic/script discounts (no code) — never deductible.
  discount_allocations: Array<{ code: string | null; amount: string }> | null
  sku: string | null
  variant_id: number | null
  product_id: number | null
}

interface OrderRow {
  id: string
  shopify_order_id: number
  order_number: string
  line_items: LineItem[]
  line_items_count: number
  discount_codes: Array<{ code: string; amount: string; type: string }> | null
}

interface AllowedCodeRule {
  code_pattern: string
  match_type: 'exact' | 'prefix'
  kit_eligible: boolean
}

interface DetailRow {
  order_number: string
  sku: string
  product_title: string
  qty: number
  unit_price: number
  gross_sales: number
  discount_code: string
  discount_amount: number
  gwp_cost: number
  net_sales: number
  item_shipping_cost: number
  final_net: number
  royalty: number
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function getDefaultMonth(): string {
  const now = new Date()
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}`
}

function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number)
  const start = new Date(Date.UTC(y, m - 1, 1))
  const end = new Date(Date.UTC(y, m, 1))
  return { start: start.toISOString(), end: end.toISOString() }
}

// ── Discount matching ─────────────────────────────────────────────────────────

function codeMatchesRule(code: string, rule: AllowedCodeRule): boolean {
  return rule.match_type === 'exact' ? code === rule.code_pattern : code.startsWith(rule.code_pattern)
}

// Whether a single discount code is deductible for this SKU: it must match an
// allowed rule, and for kit SKUs that rule must also be kit-eligible. Codes are
// evaluated independently — an allowed code stacked with a non-allowed code (e.g.
// an LL- LoyaltyLion code) still gets credit for its own allocation; only the
// non-allowed code's amount is excluded.
function codeAllowedForSku(code: string, sku: string, rules: AllowedCodeRule[]): boolean {
  const isKit = KIT_SKUS.has(sku)
  return rules.some((rule) => codeMatchesRule(code, rule) && (!isKit || rule.kit_eligible))
}

// ── GWP cost ──────────────────────────────────────────────────────────────────

function gwpCost(sku: string, title: string, variantTitle: string | null): number {
  if (!KIT_SKUS.has(sku)) return 0
  const combined = `${title} ${variantTitle ?? ''}`.toLowerCase()
  if (combined.includes('precision lash applicator')) return 6.90
  if (combined.includes('mixing palette')) return 3.00
  return 0
}

// ── Route handler ─────────────────────────────────────────────────────────────

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
      .select('id, shopify_order_id, order_number, line_items, line_items_count, discount_codes')
      .eq('store_id', STORE_ID)
      .eq('financial_status', 'paid')
      .neq('test', true)
      .is('cancelled_at', null)
      .gte('processed_at', start)
      .lt('processed_at', end)
      // Stable, deterministic order is REQUIRED for correct .range() pagination.
      // Without it PostgREST returns rows in physical-heap order, so paging past
      // 1,000 rows silently drops and duplicates orders. (processed_at, shopify_order_id)
      // rides orders_store_status_date_idx — an index-ordered scan, so it stays fast —
      // and shopify_order_id (unique per store, NOT NULL) breaks processed_at ties to
      // guarantee a total order. Sorting by shopify_order_id alone forces a full
      // per-page re-sort and times out on live data.
      .order('processed_at', { ascending: true })
      .order('shopify_order_id', { ascending: true })
      .range(from, from + PAGE - 1)

    if (error) return Response.json({ error: `Orders query failed: ${error.message}` }, { status: 500 })
    if (!data || data.length === 0) break
    orders.push(...(data as unknown as OrderRow[]))
    if (data.length < PAGE) break
    from += PAGE
  }

  // Only orders containing at least one target SKU matter for this report
  const inScopeOrders = orders.filter((o) =>
    (o.line_items ?? []).some((li) => li.sku && TARGET_SKUS.has(li.sku.trim().toUpperCase()))
  )

  // ── Fetch matched ShipStation shipment cost per order ──────────────────────
  const shopifyOrderIds = [...new Set(inScopeOrders.map((o) => o.shopify_order_id))]
  const shipmentCostByOrderId = new Map<number, number>()

  for (let i = 0; i < shopifyOrderIds.length; i += 500) {
    const chunk = shopifyOrderIds.slice(i, i + 500)
    const { data, error } = await service
      .from('shipstation_shipments')
      .select('shopify_order_id, shipment_cost')
      .eq('tenant_id', TENANT_ID)
      .in('shopify_order_id', chunk)

    if (error) return Response.json({ error: `ShipStation query failed: ${error.message}` }, { status: 500 })
    for (const row of (data ?? []) as { shopify_order_id: number | null; shipment_cost: number | null }[]) {
      if (row.shopify_order_id === null) continue
      const prev = shipmentCostByOrderId.get(row.shopify_order_id) ?? 0
      shipmentCostByOrderId.set(row.shopify_order_id, prev + (row.shipment_cost ?? 0))
    }
  }

  // ── Fetch allowed discount code rules ───────────────────────────────────────
  const { data: rulesData, error: rulesError } = await service
    .from('allowed_discount_codes')
    .select('code_pattern, match_type, kit_eligible')
    .eq('tenant_id', TENANT_ID)

  if (rulesError) return Response.json({ error: `Discount rules query failed: ${rulesError.message}` }, { status: 500 })
  const rules = (rulesData ?? []) as AllowedCodeRule[]

  // ── Compute detail rows ──────────────────────────────────────────────────────
  const detailRows: DetailRow[] = []

  for (const order of inScopeOrders) {
    const orderCodes = (order.discount_codes ?? []).map((c) => c.code.trim().toUpperCase())
    const shipmentCost = shipmentCostByOrderId.get(order.shopify_order_id) ?? 0
    const lineItemsCount = order.line_items_count || (order.line_items ?? []).length || 1
    const itemShippingCost = shipmentCost / lineItemsCount

    for (const li of order.line_items ?? []) {
      const sku = li.sku?.trim().toUpperCase()
      if (!sku || !TARGET_SKUS.has(sku)) continue

      const unitPrice = parseFloat(li.price) || 0
      const qty = li.quantity
      const grossSales = unitPrice * qty

      // Sum only the per-line discount attributable to allowlisted codes. Each
      // allocation is tied to exactly one code by the sync, so stacked codes are
      // credited independently — a non-allowed code no longer zeroes an allowed
      // one. Allocations with no code (automatic/script discounts) never match.
      let discountAmount = 0
      for (const alloc of li.discount_allocations ?? []) {
        const code = alloc.code?.trim().toUpperCase()
        if (!code) continue
        if (codeAllowedForSku(code, sku, rules)) {
          discountAmount += parseFloat(alloc.amount) || 0
        }
      }

      const gwp = gwpCost(sku, li.title, li.variant_title)

      const netSales = grossSales - discountAmount - gwp
      const finalNet = Math.max(0, netSales - itemShippingCost)
      const royalty = ROYALTY_RATE * finalNet

      detailRows.push({
        order_number: order.order_number,
        sku,
        product_title: li.title,
        qty,
        unit_price: unitPrice,
        gross_sales: grossSales,
        discount_code: orderCodes.join(', '),
        discount_amount: discountAmount,
        gwp_cost: gwp,
        net_sales: netSales,
        item_shipping_cost: itemShippingCost,
        final_net: finalNet,
        royalty,
      })
    }
  }

  const summary = {
    net_sales: detailRows.reduce((sum, r) => sum + r.net_sales, 0),
    royalty: detailRows.reduce((sum, r) => sum + r.royalty, 0),
  }

  return Response.json({ month, summary, rows: detailRows })
}
