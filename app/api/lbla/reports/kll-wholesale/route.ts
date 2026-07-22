/**
 * GET /api/lbla/reports/kll-wholesale?month=YYYY-MM
 * Requires a signed-in user; /lbla + /api/lbla are gated behind Supabase login in proxy.ts (LBLA team tool)
 *
 * Reads back the wholesale KLL data uploaded for one month (see the /upload
 * route). Everything was filtered and costed at upload time, so this only
 * aggregates: gross is already quantity x net wholesale price per row and there
 * is no discount to subtract.
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
  source_filename: string | null
  uploaded_at: string
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
      .select('month, order_number, sku, product_title, quantity, unit_price, gross, source_filename, uploaded_at')
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

  const detailRows = rows.map((r) => ({
    order_number: r.order_number,
    sku: r.sku,
    product_title: r.product_title ?? '',
    qty: r.quantity,
    unit_price: Number(r.unit_price),
    gross: Number(r.gross),
  }))

  // Units per SKU, highest first — sorted server-side so the list cannot drift
  // from the rows it is derived from. Ties break on SKU for a stable order.
  const skuTotals = new Map<string, { sku: string; product_title: string; units_sold: number }>()
  for (const r of detailRows) {
    const entry = skuTotals.get(r.sku)
    if (entry) entry.units_sold += r.qty
    else skuTotals.set(r.sku, { sku: r.sku, product_title: r.product_title, units_sold: r.qty })
  }
  const skus = [...skuTotals.values()].sort(
    (a, b) => b.units_sold - a.units_sold || a.sku.localeCompare(b.sku)
  )

  const uploadedAt = rows.reduce<string | null>(
    (latest, r) => (!latest || r.uploaded_at > latest ? r.uploaded_at : latest), null
  )

  return Response.json({
    month,
    months,
    summary: {
      gross_sales: detailRows.reduce((s, r) => s + r.gross, 0),
      total_orders: new Set(detailRows.map((r) => r.order_number)).size,
      line_items: detailRows.length,
    },
    upload: {
      uploaded_at: uploadedAt,
      source_filename: rows[0]?.source_filename ?? null,
    },
    skus,
    rows: detailRows,
  })
}
