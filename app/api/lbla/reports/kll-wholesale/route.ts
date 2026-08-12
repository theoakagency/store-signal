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
import { orderContribution, distributedLineGross, distributionDenominator, type DiscountAction } from '@/lib/wholesaleDiscount'

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
  // Full order line value + line count (migration 042); NULL until re-uploaded.
  order_line_total: number | null
  order_line_count: number | null
  // Shopify "Total" + upload rule set (migration 043). rule_set NULL = legacy.
  order_total: number | null
  rule_set: string | null
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
    // select('*') so the report keeps working before migration 043 is applied:
    // rows come back without order_total/rule_set, which fall back to null/legacy.
    const { data, error } = await service
      .from('wholesale_kll_orders')
      .select('*')
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

  const toDetail = (r: StoredRow) => ({
    order_number: r.order_number,
    sku: r.sku,
    product_title: r.product_title ?? '',
    qty: r.quantity,
    unit_price: Number(r.unit_price),
    gross: Number(r.gross),
  })

  const uploadedAt = rows.reduce<string | null>(
    (latest, r) => (!latest || r.uploaded_at > latest ? r.uploaded_at : latest), null
  )
  const sortSkus = (rs: { sku: string; product_title: string; units_sold: number }[]) =>
    rs.sort((a, b) => b.units_sold - a.units_sold || a.sku.localeCompare(b.sku))
  const buildSkus = (detail: ReturnType<typeof toDetail>[]) => {
    const m = new Map<string, { sku: string; product_title: string; units_sold: number }>()
    for (const r of detail) {
      const e = m.get(r.sku)
      if (e) e.units_sold += r.qty
      else m.set(r.sku, { sku: r.sku, product_title: r.product_title, units_sold: r.qty })
    }
    return sortSkus([...m.values()])
  }

  // Which rule set this month was uploaded under. All rows of a month share it;
  // NULL (pre-043 June/July) is legacy. An empty month defaults to simplified.
  const ruleSet: 'legacy' | 'simplified' =
    rows.length > 0 ? ((rows[0].rule_set ?? 'legacy') === 'simplified' ? 'simplified' : 'legacy') : 'simplified'

  // Manual line items for this month (migration 044) — hand-entered, merged into
  // the detail table / SKUs / totals for BOTH rule sets, and listed for audit.
  // Kept in their own table so a re-upload can't wipe them; a missing table
  // (pre-044) is tolerated as "no manual entries".
  interface ManualEntry { id: string; order_number: string | null; sku: string; product_title: string | null; quantity: number; unit_price: number; gross: number; added_by: string | null; added_at: string; updated_at: string }
  const manualEntries: ManualEntry[] = []
  {
    const { data, error } = await service
      .from('wholesale_manual_line_items')
      .select('*')
      .eq('tenant_id', TENANT_ID)
      .eq('month', month)
      .order('added_at', { ascending: true })
    if (!error) {
      for (const m of data ?? []) {
        manualEntries.push({
          id: m.id, order_number: m.order_number ?? null, sku: m.sku, product_title: m.product_title ?? null,
          quantity: Number(m.quantity), unit_price: Number(m.unit_price), gross: Number(m.gross),
          added_by: m.added_by ?? null, added_at: m.added_at, updated_at: m.updated_at,
        })
      }
    }
  }
  const manualRows = manualEntries.map((m) => ({
    order_number: m.order_number ?? '', sku: m.sku, product_title: m.product_title ?? '',
    qty: m.quantity, unit_price: m.unit_price, gross: m.gross,
  }))
  const manualGross = manualRows.reduce((s, r) => s + r.gross, 0)
  const blankManualOrders = manualEntries.filter((m) => !(m.order_number && m.order_number.trim())).length
  // Distinct orders across all counted detail rows (blank-order manual lines each
  // count as their own order); non-blank manual orders merge with matching ones.
  const countDistinctOrders = (detail: { order_number: string }[]) =>
    new Set(detail.filter((r) => r.order_number).map((r) => r.order_number)).size + blankManualOrders

  // ── SIMPLIFIED (August onward): no decisions ───────────────────────────────
  // Line prices are the real paid prices, so every order counts at its line
  // price. Rule 2: a $0/blank order Total drops the whole order. Rule 3: a $0 KLL
  // line gross drops just that line. Order-level Discount Code/Amount is credit
  // only — those orders still count, and are listed for visibility. No flagging.
  if (ruleSet === 'simplified') {
    const orderTotalOf = new Map<string, number | null>()
    for (const r of rows) if (!orderTotalOf.has(r.order_number)) orderTotalOf.set(r.order_number, r.order_total != null ? Number(r.order_total) : null)

    const isZeroTotal = (on: string) => { const t = orderTotalOf.get(on); return t == null || t <= 0 }

    // Rule 2 — excluded orders (for the informational list).
    const excludedOrders = [...orderTotalOf.entries()]
      .filter(([on]) => isZeroTotal(on))
      .map(([on]) => ({ order_number: on, order_total: orderTotalOf.get(on) ?? null, reason: 'Order Total is $0 or blank' }))
      .sort((a, b) => a.order_number.localeCompare(b.order_number))

    // Counted lines: from non-excluded orders, dropping $0-gross lines (rule 3).
    const countedRows = rows
      .filter((r) => !isZeroTotal(r.order_number) && Number(r.gross) > 0)
      .map(toDetail)
      .sort((a, b) => a.order_number.localeCompare(b.order_number) || a.sku.localeCompare(b.sku))

    // Rule 1 — credit orders: still counted at full price, listed for visibility.
    const creditOrderNumbers = new Set(
      rows.filter((r) => !isZeroTotal(r.order_number) && orderIsFlagged(r.discount_code, r.discount_amount)).map((r) => r.order_number)
    )
    const creditMap = new Map<string, { order_number: string; discount_code: string | null; discount_amount: number | null; gross: number; lines: ReturnType<typeof toDetail>[] }>()
    for (const r of countedRows) {
      if (!creditOrderNumbers.has(r.order_number)) continue
      const src = rows.find((x) => x.order_number === r.order_number)!
      let g = creditMap.get(r.order_number)
      if (!g) { g = { order_number: r.order_number, discount_code: src.discount_code, discount_amount: src.discount_amount != null ? Number(src.discount_amount) : null, gross: 0, lines: [] }; creditMap.set(r.order_number, g) }
      g.lines.push(r); g.gross += r.gross
    }
    const creditOrders = [...creditMap.values()].sort((a, b) => b.gross - a.gross || a.order_number.localeCompare(b.order_number))

    // Merge manual line items into the main table / SKUs / totals.
    const allDetail = [...countedRows, ...manualRows].sort(
      (a, b) => a.order_number.localeCompare(b.order_number) || a.sku.localeCompare(b.sku)
    )
    const grossSales = countedRows.reduce((s, r) => s + r.gross, 0) + manualGross
    const totalOrders = countDistinctOrders(allDetail)
    return Response.json({
      month, months, rule_set: ruleSet,
      summary: {
        gross_sales: grossSales,
        total_orders: totalOrders,
        line_items: allDetail.length,
        clean_gross: grossSales, clean_orders: totalOrders,
        resolved_contribution: 0, resolved_orders: 0,
      },
      // No flag/decide workflow under the simplified rules.
      flagged: { orders: [], order_count: 0, pending_count: 0, pending_subtotal_gross: 0, resolved_count: 0, resolved_contribution: 0, line_items: 0 },
      informational: {
        excluded_orders: excludedOrders,
        credit_orders: creditOrders,
      },
      manual_entries: manualEntries,
      upload: { uploaded_at: uploadedAt, source_filename: rows[0]?.source_filename ?? null },
      skus: buildSkus(allDetail),
      rows: allDetail,
    })
  }

  // ── LEGACY (June/July): flag / decide / resolve — unchanged ────────────────
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

  const cleanRows = rows.filter((r) => !flaggedOrders.has(r.order_number)).map(toDetail)
  const flaggedStored = rows.filter((r) => flaggedOrders.has(r.order_number))

  // FLAGGED orders, grouped: one entry per order with its discount, KLL lines, and
  // its decision (if any) applied.
  const flaggedMap = new Map<string, {
    order_number: string
    discount_code: string | null
    discount_amount: number | null
    order_line_total: number | null
    order_line_count: number | null
    gross: number
    lines: ReturnType<typeof toDetail>[]
  }>()
  for (const r of flaggedStored) {
    let g = flaggedMap.get(r.order_number)
    if (!g) {
      g = {
        order_number: r.order_number,
        discount_code: r.discount_code,
        discount_amount: r.discount_amount != null ? Number(r.discount_amount) : null,
        order_line_total: r.order_line_total != null ? Number(r.order_line_total) : null,
        order_line_count: r.order_line_count != null ? Number(r.order_line_count) : null,
        gross: 0,
        lines: [],
      }
      flaggedMap.set(r.order_number, g)
    }
    const line = toDetail(r)
    g.lines.push(line)
    g.gross += line.gross
  }

  const flaggedGroups = [...flaggedMap.values()].map((g) => {
    const d = decisions.get(g.order_number) ?? null
    const { contribution, resolved, counts_as_order } = orderContribution(g.gross, g.order_line_total, g.discount_amount, d)
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

  // Resolved orders (except ignore) merge into the main detail rows with their
  // ADJUSTED per-line values, so the table, SKU totals and CSV reflect the chosen
  // decision. full_price keeps the recorded lines; distribute spreads the amount
  // across the full order and each KLL line keeps its share (same rule as the
  // per-order contribution, so the merged gross reconciles to the headline total).
  const resolvedRows: ReturnType<typeof toDetail>[] = []
  for (const g of resolved) {
    if (!g.counts_as_order || !g.decision) continue // ignore contributes nothing
    if (g.decision.action === 'full_price') {
      resolvedRows.push(...g.lines)
      continue
    }
    const amount = g.decision.action === 'distribute_full'
      ? (g.discount_amount ?? 0)
      : (g.decision.custom_amount ?? 0)
    const denom = distributionDenominator(g.gross, g.order_line_total)
    for (const line of g.lines) {
      const adjGross = distributedLineGross(line.gross, denom, amount)
      resolvedRows.push({
        ...line,
        gross: adjGross,
        unit_price: line.qty > 0 ? adjGross / line.qty : 0,
      })
    }
  }

  // The main detail table = clean lines + resolved lines + manual entries.
  const detailRows = [...cleanRows, ...resolvedRows, ...manualRows].sort(
    (a, b) => a.order_number.localeCompare(b.order_number) || a.sku.localeCompare(b.sku)
  )

  // SKU totals over the merged rows (clean + resolved + manual); qty is unchanged
  // by a discount, so resolved orders add their full units (ignore excluded above).
  const skus = buildSkus(detailRows)

  // Clean orders + resolved orders' chosen contributions + manual lines.
  const cleanGross = cleanRows.reduce((s, r) => s + r.gross, 0)
  const resolvedContribution = resolved.reduce((s, g) => s + g.contribution, 0)
  const resolvedCounts = resolved.filter((g) => g.counts_as_order).length
  const grossSales = cleanGross + resolvedContribution + manualGross
  const totalOrders = countDistinctOrders(detailRows)

  return Response.json({
    month,
    months,
    rule_set: ruleSet, // 'legacy'
    // Headline = clean orders + resolved flagged orders + manual line items.
    // Pending flagged orders are still excluded until a decision is saved.
    summary: {
      gross_sales: grossSales,
      total_orders: totalOrders,
      line_items: detailRows.length,
      clean_gross: cleanGross,
      clean_orders: new Set(cleanRows.map((r) => r.order_number)).size,
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
    // Simplified-only section; legacy months don't have it.
    informational: null,
    manual_entries: manualEntries,
    upload: {
      uploaded_at: uploadedAt,
      source_filename: rows[0]?.source_filename ?? null,
    },
    skus,
    rows: detailRows,
  })
}
