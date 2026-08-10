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
import { orderContribution, type DiscountAction } from '@/lib/wholesaleDiscount'

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

  // Saved per-order decisions (migration 041) — keyed by order number, so they
  // survive re-uploads. Only the flagged orders in this month matter.
  const decisions = new Map<string, { action: DiscountAction; custom_amount: number | null; decided_by: string | null; decided_at: string }>()
  if (flaggedOrders.size > 0) {
    const ids = [...flaggedOrders]
    const CH = 300
    for (let i = 0; i < ids.length; i += CH) {
      const { data, error } = await service
        .from('wholesale_order_discount_decisions')
        .select('order_number, action, custom_amount, decided_by, decided_at')
        .eq('tenant_id', TENANT_ID)
        .in('order_number', ids.slice(i, i + CH))
      // A missing table (migration 041 not applied yet) must not break the report;
      // treat as "no decisions" so every flagged order simply stays pending.
      if (error) break
      for (const d of data ?? []) {
        decisions.set(d.order_number, {
          action: d.action as DiscountAction,
          custom_amount: d.custom_amount != null ? Number(d.custom_amount) : null,
          decided_by: d.decided_by ?? null,
          decided_at: d.decided_at,
        })
      }
    }
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

  // FLAGGED orders, grouped: one entry per order with its discount, KLL lines, and
  // its decision (if any) applied.
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

  const flaggedGroups = [...flaggedMap.values()].map((g) => {
    const d = decisions.get(g.order_number) ?? null
    const { contribution, resolved, counts_as_order } = orderContribution(g.gross, g.discount_amount, d)
    return {
      ...g,
      decision: d, // null when pending
      contribution,       // what this order adds to Gross Sales once resolved (0 while pending)
      resolved,           // has a saved decision
      counts_as_order,    // false for ignore
    }
  }).sort((a, b) => {
    // Pending first, then resolved; each group by gross desc.
    if (a.resolved !== b.resolved) return a.resolved ? 1 : -1
    return b.gross - a.gross || a.order_number.localeCompare(b.order_number)
  })

  const pending = flaggedGroups.filter((g) => !g.resolved)
  const resolved = flaggedGroups.filter((g) => g.resolved)

  // Clean orders + resolved orders' chosen contributions make the headline total.
  const cleanGross = cleanRows.reduce((s, r) => s + r.gross, 0)
  const cleanOrders = new Set(cleanRows.map((r) => r.order_number)).size
  const resolvedContribution = resolved.reduce((s, g) => s + g.contribution, 0)
  const resolvedCounts = resolved.filter((g) => g.counts_as_order).length

  const uploadedAt = rows.reduce<string | null>(
    (latest, r) => (!latest || r.uploaded_at > latest ? r.uploaded_at : latest), null
  )

  return Response.json({
    month,
    months,
    // Headline = clean orders + resolved flagged orders (by their chosen method).
    // Pending flagged orders are still excluded until a decision is saved.
    summary: {
      gross_sales: cleanGross + resolvedContribution,
      total_orders: cleanOrders + resolvedCounts,
      line_items: cleanRows.length,
      clean_gross: cleanGross,
      clean_orders: cleanOrders,
      resolved_contribution: resolvedContribution,
      resolved_orders: resolvedCounts,
    },
    flagged: {
      orders: flaggedGroups,
      order_count: flaggedGroups.length,
      pending_count: pending.length,
      // Pending original KLL gross — reference only, NOT in summary.gross_sales.
      pending_subtotal_gross: pending.reduce((s, g) => s + g.gross, 0),
      resolved_count: resolved.length,
      resolved_contribution: resolvedContribution,
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
