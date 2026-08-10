/**
 * POST /api/lbla/reports/kll-wholesale/upload
 * Body: multipart/form-data with `file` = a Shopify "Orders and line items" CSV export
 *
 * wholesale.lashboxla.com is a separate Shopify store with no API connection, so
 * its KLL sales are uploaded by hand each month. This parses the export, keeps
 * only paid orders containing target KLL SKUs, and REPLACES the stored data for
 * every month the file covers.
 *
 * Prices here are Sparklayer B2B tier prices: `Lineitem price` is ALREADY the net
 * wholesale price after the customer's tier discount, so for a clean order
 * gross = quantity x price is the final figure with nothing to subtract.
 *
 * BUT some orders also carry an ORDER-LEVEL Shopify discount (Discount Code /
 * Discount Amount) — sample give-aways, show discounts, credits, extra % off —
 * that makes their line prices unreliable. Those columns are captured here
 * (forward-filled per order, same as Financial Status / Created at, since Shopify
 * only populates them on an order's first line) so the report can hold those
 * orders back as "flagged / pending review" instead of trusting their gross.
 */
import { NextRequest } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'
import { parseCsvToObjects } from '@/lib/csv'
import { TARGET_SKUS } from '@/lib/kll'

export const maxDuration = 60

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

// Exact Shopify export column names.
const COL = {
  name: 'Name',
  createdAt: 'Created at',
  sku: 'Lineitem sku',
  title: 'Lineitem name',
  qty: 'Lineitem quantity',
  price: 'Lineitem price',
  financialStatus: 'Financial Status',
  discountCode: 'Discount Code',
  discountAmount: 'Discount Amount',
} as const

interface ParsedRow {
  tenant_id: string
  month: string
  order_number: string
  order_created_at: string | null
  sku: string
  product_title: string
  quantity: number
  unit_price: number
  gross: number
  // Order-level Shopify discount, repeated on every line of the order. NULL for a
  // clean order. The report flags any order with a code or a positive amount.
  discount_code: string | null
  discount_amount: number | null
  source_filename: string
}

/**
 * Month as YYYY-MM taken from the leading date of `Created at` as Shopify wrote
 * it (store-local, e.g. "2026-06-15 10:23:45 -0700"). Deliberately NOT re-derived
 * through Date/UTC: an order placed late on the last evening of the month would
 * shift into the next month under UTC and stop agreeing with the date range the
 * exporter picked in Shopify Admin. Falls back to Date parsing only if the value
 * is not in Shopify's usual shape.
 */
function monthOf(createdAt: string): string | null {
  const m = createdAt.match(/^(\d{4})-(\d{2})-\d{2}/)
  if (m) return `${m[1]}-${m[2]}`
  const d = new Date(createdAt)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export async function POST(req: NextRequest) {
  // /api/lbla is already gated in proxy.ts, but this endpoint WRITES, so it
  // checks the session itself rather than relying on the proxy alone.
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  let file: File | null = null
  try {
    const form = await req.formData()
    const f = form.get('file')
    if (f instanceof File) file = f
  } catch {
    return Response.json({ error: 'Could not read the uploaded form data' }, { status: 400 })
  }
  if (!file) return Response.json({ error: 'No file was uploaded' }, { status: 400 })
  if (!/\.csv$/i.test(file.name)) {
    return Response.json({ error: 'That is not a .csv file. Export from Shopify Admin as CSV.' }, { status: 400 })
  }

  const text = await file.text()
  const { headers, rows } = parseCsvToObjects(text)
  if (rows.length === 0) return Response.json({ error: 'That file has no data rows' }, { status: 400 })

  const missing = [COL.name, COL.sku, COL.qty, COL.price, COL.createdAt, COL.financialStatus]
    .filter((c) => !headers.includes(c))
  if (missing.length > 0) {
    return Response.json({
      error: `This does not look like a Shopify "Orders and line items" export — missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`,
    }, { status: 400 })
  }

  // Shopify writes order-level fields only on an order's FIRST line; continuation
  // lines repeat `Name` and leave Financial Status, Created at, and the discount
  // columns blank. Resolve them per order across the whole file before filtering,
  // so a paid order's second and later line items are not silently discarded and
  // so every line inherits the order's discount.
  const orderStatus = new Map<string, string>()
  const orderCreatedAt = new Map<string, string>()
  const orderDiscountCode = new Map<string, string>()
  const orderDiscountAmount = new Map<string, string>()
  for (const r of rows) {
    const name = r[COL.name]
    if (!name) continue
    const status = r[COL.financialStatus]
    if (status && !orderStatus.has(name)) orderStatus.set(name, status)
    const created = r[COL.createdAt]
    if (created && !orderCreatedAt.has(name)) orderCreatedAt.set(name, created)
    // First non-blank wins (the order's first line). A clean order never sets these.
    const code = r[COL.discountCode]
    if (code && code.trim() && !orderDiscountCode.has(name)) orderDiscountCode.set(name, code.trim())
    const amount = r[COL.discountAmount]
    if (amount && amount.trim() && !orderDiscountAmount.has(name)) orderDiscountAmount.set(name, amount.trim())
  }

  const parsed: ParsedRow[] = []
  const skippedNoMonth: string[] = []
  const monthsSeen = new Set<string>()
  const ordersSeen = new Set<string>()

  for (const r of rows) {
    const orderNumber = r[COL.name]
    if (!orderNumber) continue

    if ((orderStatus.get(orderNumber) ?? '').trim().toLowerCase() !== 'paid') continue

    const sku = r[COL.sku]?.trim().toUpperCase()
    if (!sku || !TARGET_SKUS.has(sku)) continue

    const createdAt = orderCreatedAt.get(orderNumber) ?? ''
    const month = monthOf(createdAt)
    if (!month) { skippedNoMonth.push(orderNumber); continue }

    const quantity = parseInt(r[COL.qty], 10)
    const unitPrice = parseFloat(r[COL.price])
    if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) continue

    // Order-level discount, forward-filled. Amount strips a leading currency
    // symbol/commas just in case; null when the order carried no discount.
    const discountCode = orderDiscountCode.get(orderNumber) ?? null
    const rawAmount = orderDiscountAmount.get(orderNumber)
    const parsedAmount = rawAmount != null ? parseFloat(rawAmount.replace(/[$,]/g, '')) : NaN
    const discountAmount = Number.isFinite(parsedAmount) ? parsedAmount : null

    monthsSeen.add(month)
    ordersSeen.add(orderNumber)
    parsed.push({
      tenant_id: TENANT_ID,
      month,
      order_number: orderNumber,
      order_created_at: createdAt || null,
      sku,
      product_title: r[COL.title] ?? '',
      quantity,
      // Sparklayer tier price — already net, nothing subtracted.
      unit_price: unitPrice,
      gross: quantity * unitPrice,
      discount_code: discountCode,
      discount_amount: discountAmount,
      source_filename: file.name,
    })
  }

  if (parsed.length === 0) {
    return Response.json({
      error: 'No paid KLL line items found in that file. Check it is the wholesale store export and covers the right dates.',
    }, { status: 400 })
  }

  const service = createSupabaseServiceClient()
  const months = [...monthsSeen].sort()

  // Replace, don't merge: a corrected re-upload must not leave rows behind from
  // the version it supersedes. Scoped to the months this file actually covers, so
  // uploading June never disturbs May.
  for (const month of months) {
    const { error } = await service
      .from('wholesale_kll_orders')
      .delete()
      .eq('tenant_id', TENANT_ID)
      .eq('month', month)
    if (error) return Response.json({ error: `Could not clear existing ${month} data: ${error.message}` }, { status: 500 })
  }

  const CHUNK = 500
  for (let i = 0; i < parsed.length; i += CHUNK) {
    const { error } = await service.from('wholesale_kll_orders').insert(parsed.slice(i, i + CHUNK))
    if (error) return Response.json({ error: `Insert failed: ${error.message}` }, { status: 500 })
  }

  // Clean vs flagged breakdown of what was just stored, for the upload receipt.
  const isFlagged = (r: ParsedRow) =>
    (r.discount_code != null && r.discount_code.trim() !== '') || (r.discount_amount != null && r.discount_amount > 0)
  const flaggedOrderSet = new Set(parsed.filter(isFlagged).map((r) => r.order_number))

  return Response.json({
    months,
    line_items: parsed.length,
    orders: ordersSeen.size,
    gross: parsed.reduce((s, r) => s + r.gross, 0),
    clean_orders: ordersSeen.size - flaggedOrderSet.size,
    flagged_orders: flaggedOrderSet.size,
    clean_gross: parsed.filter((r) => !flaggedOrderSet.has(r.order_number)).reduce((s, r) => s + r.gross, 0),
    flagged_gross: parsed.filter((r) => flaggedOrderSet.has(r.order_number)).reduce((s, r) => s + r.gross, 0),
    rows_in_file: rows.length,
    skipped_no_date: skippedNoMonth.length,
  })
}
