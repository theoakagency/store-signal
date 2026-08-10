/**
 * GET /api/lbla/reports/kll-wholesale?month=YYYY-MM
 * Requires a signed-in user; /lbla + /api/lbla are gated behind Supabase login in proxy.ts (LBLA team tool)
 *
 * Reads back the wholesale KLL data uploaded for one month (see the /upload
 * route) and splits it into CLEAN vs FLAGGED orders:
 *   CLEAN   — no order-level Shopify discount; line gross is trustworthy.
 *   FLAGGED — carried a Discount Code and/or a Discount Amount, so its line
 *             prices are unreliable and its value is pending review.
 *
 * The summary cards, detail rows, and SKU totals reflect CLEAN orders only.
 * Flagged orders are returned grouped, with a reference subtotal, but are kept
 * OUT of the headline numbers.
 *
 * Always returns `months` — the months that have been uploaded — so the page can
 * show what is available rather than leaving the user guessing at a date picker.
 */
import { NextRequest } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { getDefaultMonth } from '@/lib/kll'

export const maxDuration = 60

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

interface StoredRow {
  month: string
  order_number: string
  sku: string
  product_title: string | null
  quantity: number
  unit_price: number
  gross: number
  // Order-level discount (migration 040), repeated on every line of the order.
  // Null on both for a clean order, and on all rows uploaded before migration 040
  // — which is why June/July must be re-uploaded for the split to take effect.
  discount_code: string | null
  discount_amount: number | null
  source_filename: string | null
  uploaded_at: string
}

// An order is flagged if it carried a discount code or a positive discount amount.
function orderIsFlagged(code: string | null, amount: number | null): boolean {
  return (code != null && code.trim() !== '') || (amount != null && Number(amount) > 0)
}

export async function GET(req: NextRequest) {
  const monthParam = req.nextUrl.searchParams.get('month')
  const month = monthParam || getDefaultMonth()
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return Response.json({ error: 'month must be in YYYY-MM format' }, { status: 400 })
  }

  const service = createSupabaseServiceClient()

  // Which months exist at all. Paginated for the same reason every other query
  // here is: PostgREST caps at 1,000 rows regardless of how few distinct values
  // that collapses to.
  const PAGE = 1000
  const monthSet = new Set<string>()
  let from = 0
  while (true) {
    const { data, error } = await service
      .from('wholesale_kll_orders')
      .select('month')
      .eq('tenant_id', TENANT_ID)
      .order('month', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) return Response.json({ error: `Months query failed: ${error.message}` }, { status: 500 })
    if (!data || data.length === 0) break
    for (const r of data) monthSet.add(r.month)
    if (data.length < PAGE) break
    from += PAGE
  }
  const months = [...monthSet].sort().reverse()

  // Rows for the requested month.
  const rows: StoredRow[] = []
  from = 0
  while (true) {
    const { data, error } = await service
      .from('wholesale_kll_orders')
      .select('month, order_number, sku, product_title, quantity, unit_price, gross, discount_code, discount_amount, source_filename, uploaded_at')
      .eq('tenant_id', TENANT_ID)
      .eq('month', month)
      .order('order_number', { ascending: true })
      .order('sku', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) return Response.json({ error: `Rows query failed: ${error.message}` }, { status: 500 })
    if (!data || data.length === 0) break
    rows.push(...(data as unknown as StoredRow[]))
    if (data.length < PAGE) break
    from += PAGE
  }

  // Flag decision is per ORDER. Every row of an order carries the same discount
  // values, so read them off the order's rows.
  const flaggedOrders = new Set<string>()
  for (const r of rows) {
    if (orderIsFlagged(r.discount_code, r.discount_amount)) flaggedOrders.add(r.order_number)
  }

  const toDetail = (r: StoredRow) => ({
    order_number: r.order_number,
    sku: r.sku,
    product_title: r.product_title ?? '',
    qty: r.quantity,
    unit_price: Number(r.unit_price),
    gross: Number(r.gross),
  })

  const cleanRows = rows.filter((r) => !flaggedOrders.has(r.order_number)).map(toDetail)
  const flaggedStored = rows.filter((r) => flaggedOrders.has(r.order_number))

  // CLEAN detail table + SKU totals + headline summary all derive from cleanRows,
  // so they cannot drift apart.
  const skuTotals = new Map<string, { sku: string; product_title: string; units_sold: number }>()
  for (const r of cleanRows) {
    const entry = skuTotals.get(r.sku)
    if (entry) entry.units_sold += r.qty
    else skuTotals.set(r.sku, { sku: r.sku, product_title: r.product_title, units_sold: r.qty })
  }
  const skus = [...skuTotals.values()].sort(
    (a, b) => b.units_sold - a.units_sold || a.sku.localeCompare(b.sku)
  )

  // FLAGGED orders, grouped: one entry per order with its discount and KLL lines.
  const flaggedMap = new Map<string, {
    order_number: string
    discount_code: string | null
    discount_amount: number | null
    gross: number
    lines: ReturnType<typeof toDetail>[]
  }>()
  for (const r of flaggedStored) {
    let g = flaggedMap.get(r.order_number)
    if (!g) {
      g = { order_number: r.order_number, discount_code: r.discount_code, discount_amount: r.discount_amount != null ? Number(r.discount_amount) : null, gross: 0, lines: [] }
      flaggedMap.set(r.order_number, g)
    }
    const line = toDetail(r)
    g.lines.push(line)
    g.gross += line.gross
  }
  const flaggedGroups = [...flaggedMap.values()].sort((a, b) => b.gross - a.gross || a.order_number.localeCompare(b.order_number))

  const uploadedAt = rows.reduce<string | null>(
    (latest, r) => (!latest || r.uploaded_at > latest ? r.uploaded_at : latest), null
  )

  return Response.json({
    month,
    months,
    // Headline numbers are CLEAN-ONLY on purpose — flagged orders' true value is
    // pending a decision and must not inflate the reliable total.
    summary: {
      gross_sales: cleanRows.reduce((s, r) => s + r.gross, 0),
      total_orders: new Set(cleanRows.map((r) => r.order_number)).size,
      line_items: cleanRows.length,
    },
    flagged: {
      orders: flaggedGroups,
      order_count: flaggedGroups.length,
      // Reference only — deliberately NOT part of summary.gross_sales above.
      subtotal_gross: flaggedGroups.reduce((s, g) => s + g.gross, 0),
      line_items: flaggedStored.length,
    },
    upload: {
      uploaded_at: uploadedAt,
      source_filename: rows[0]?.source_filename ?? null,
    },
    skus,
    rows: cleanRows,
  })
}
