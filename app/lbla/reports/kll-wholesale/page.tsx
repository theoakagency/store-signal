'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import CollapsibleCard from '@/app/lbla/_components/CollapsibleCard'

// ── Types ─────────────────────────────────────────────────────────────────────

interface DetailRow {
  order_number: string
  sku: string
  product_title: string
  qty: number
  unit_price: number
  gross: number
}

interface SkuTotal {
  sku: string
  product_title: string
  units_sold: number
}

type DiscountAction = 'ignore' | 'distribute_full' | 'distribute_custom' | 'full_price'

interface OrderDecision {
  action: DiscountAction
  custom_amount: number | null
  decided_by: string | null
  decided_at: string
}

interface FlaggedGroup {
  order_number: string
  discount_code: string | null
  discount_amount: number | null
  order_line_total: number | null
  order_line_count: number | null
  gross: number
  lines: DetailRow[]
  decision: OrderDecision | null
  contribution: number
  resolved: boolean
  counts_as_order: boolean
}

interface ReportResponse {
  month: string
  months: string[]
  // Headline = clean orders + resolved flagged orders (by their chosen method).
  summary: {
    gross_sales: number; total_orders: number; line_items: number
    clean_gross: number; clean_orders: number
    resolved_contribution: number; resolved_orders: number
  }
  flagged: {
    orders: FlaggedGroup[]; order_count: number
    pending_count: number; pending_subtotal_gross: number
    resolved_count: number; resolved_contribution: number
    line_items: number
  }
  upload: { uploaded_at: string | null; source_filename: string | null }
  skus: SkuTotal[]
  rows: DetailRow[]
}

const ACTION_OPTIONS: { value: DiscountAction; label: string }[] = [
  { value: 'ignore', label: 'Ignore — exclude from totals' },
  { value: 'distribute_full', label: 'Distribute full discount' },
  { value: 'distribute_custom', label: 'Distribute custom amount' },
  { value: 'full_price', label: 'Full price — keep as sale' },
]
const ACTION_LABEL: Record<DiscountAction, string> = {
  ignore: 'Ignored', distribute_full: 'Full discount distributed',
  distribute_custom: 'Custom amount distributed', full_price: 'Full price',
}

interface UploadResult {
  months: string[]
  line_items: number
  orders: number
  gross: number
  clean_orders: number
  flagged_orders: number
  clean_gross: number
  flagged_gross: number
  rows_in_file: number
  skipped_no_date: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getDefaultMonth(): string {
  const now = new Date()
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
}

function displayMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December']
  return `${months[m - 1]} ${y}`
}

function fmtCurrency(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function fmtWhen(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Distribution denominator = full order line value (all SKUs), falling back to
// the KLL gross for rows not yet re-uploaded with migration 042's column.
function denom(gross: number, orderLineTotal: number | null): number {
  return orderLineTotal != null && orderLineTotal > 0 ? orderLineTotal : gross
}

// Mirror of lib/wholesaleDiscount, for the live preview only. Distribute spreads
// the amount across the FULL order and keeps the KLL share.
function previewContribution(gross: number, orderLineTotal: number | null, discountAmount: number | null, action: DiscountAction | '', custom: number | null): number | null {
  const d = denom(gross, orderLineTotal)
  const distribute = (amt: number) => (d > 0 ? gross * Math.max(0, 1 - amt / d) : gross)
  switch (action) {
    case 'ignore': return 0
    case 'full_price': return gross
    case 'distribute_full': return distribute(discountAmount ?? 0)
    case 'distribute_custom': return custom != null && custom > 0 ? distribute(custom) : null
    default: return null
  }
}

// Per-line kept gross after distributing `amount` across the full order value.
function adjustedLineGross(lineGross: number, orderLineTotal: number | null, gross: number, amount: number): number {
  const d = denom(gross, orderLineTotal)
  return d > 0 ? lineGross * Math.max(0, 1 - amount / d) : lineGross
}

function downloadCsv(rows: DetailRow[], month: string) {
  // One column per column on screen, same order, same values.
  const headers = ['Order Number', 'SKU', 'Product Title', 'Qty', 'Unit Price', 'Gross']
  const csvRows = [
    headers,
    ...rows.map((r) => [
      r.order_number, r.sku, r.product_title, String(r.qty),
      r.unit_price.toFixed(2), r.gross.toFixed(2),
    ]),
  ]
  const csv = csvRows.map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `kll-wholesale-${month}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Explainer ─────────────────────────────────────────────────────────────────

const CALCULATION_STEPS = [
  'Upload the Shopify order export from wholesale.lashboxla.com — Orders → Export → "Orders and line items"',
  'Only Korean Lash Lift SKUs are kept, and only from orders marked paid',
  'Gross is quantity × the price on the line. Wholesale prices already have the customer\'s tier discount applied, so nothing is subtracted',
  'Re-uploading a corrected file for a month replaces that month — it does not add to it',
]

// ── Flagged order card, with its per-order decision control ────────────────────

function FlaggedOrderCard({ g, onChanged }: { g: FlaggedGroup; onChanged: () => void }) {
  const [action, setAction] = useState<DiscountAction | ''>(g.decision?.action ?? '')
  const [custom, setCustom] = useState<string>(g.decision?.custom_amount != null ? String(g.decision.custom_amount) : '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const customNum = custom.trim() !== '' ? parseFloat(custom) : null
  const preview = previewContribution(g.gross, g.order_line_total, g.discount_amount, action, customNum)
  const dirty = action !== (g.decision?.action ?? '') ||
    (action === 'distribute_custom' && (customNum ?? null) !== (g.decision?.custom_amount ?? null))

  // For the distribute breakdown: the amount being spread (full discount or the
  // entered custom amount), and whether we can show a full breakdown.
  const isDistribute = action === 'distribute_full' || action === 'distribute_custom'
  const distributeAmount = action === 'distribute_full' ? (g.discount_amount ?? 0) : (customNum ?? 0)
  const showBreakdown = isDistribute && distributeAmount > 0 && preview != null

  async function save() {
    if (action === '') return
    if (action === 'distribute_custom' && !(customNum != null && customNum > 0)) {
      setErr('Enter a positive dollar amount to distribute.')
      return
    }
    setSaving(true); setErr(null)
    try {
      const res = await fetch('/api/lbla/reports/kll-wholesale/decision', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_number: g.order_number, action, custom_amount: action === 'distribute_custom' ? customNum : null }),
      })
      const data = await res.json()
      if (!res.ok) { setErr(data.error ?? 'Save failed'); return }
      onChanged()
    } catch { setErr('Network error') } finally { setSaving(false) }
  }

  async function clearDecision() {
    setSaving(true); setErr(null)
    try {
      const res = await fetch(`/api/lbla/reports/kll-wholesale/decision?order_number=${encodeURIComponent(g.order_number)}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) { setErr(data.error ?? 'Clear failed'); return }
      setAction(''); setCustom(''); onChanged()
    } catch { setErr('Network error') } finally { setSaving(false) }
  }

  return (
    <div className={`overflow-hidden rounded-2xl border shadow-sm ${g.resolved ? 'border-teal/30 bg-white' : 'border-amber-200 bg-white'}`}>
      {/* Header: order number + discount, and a resolved tag */}
      <div className={`flex flex-wrap items-start justify-between gap-2 px-5 py-3 ${g.resolved ? 'bg-teal/5' : 'bg-amber-50'}`}>
        <div className="min-w-0">
          <p className="font-data text-sm font-semibold text-ink">{g.order_number}</p>
          <p className="mt-0.5 text-xs text-ink-2">
            <span className="font-medium text-ink">Discount:</span>{' '}
            {g.discount_code && g.discount_code.trim() !== '' ? g.discount_code : <span className="text-ink-3">(no code)</span>}
            {g.discount_amount != null && <> — <span className="font-data font-semibold text-ink">{fmtCurrency(g.discount_amount)}</span></>}
          </p>
        </div>
        {g.resolved && g.decision && (
          <div className="text-right">
            <span className="inline-block rounded-full border border-teal/40 bg-teal/10 px-2.5 py-0.5 text-[11px] font-semibold text-teal-deep">
              {ACTION_LABEL[g.decision.action]}
              {g.decision.action === 'distribute_custom' && g.decision.custom_amount != null ? ` (${fmtCurrency(g.decision.custom_amount)})` : ''}
            </span>
            <p className="mt-1 text-[11px] text-ink-3">
              {g.counts_as_order ? <>counts as <span className="font-data font-semibold text-ink">{fmtCurrency(g.contribution)}</span></> : 'excluded from totals'}
              {g.decision.decided_by && <> · {g.decision.decided_by}</>}
              {g.decision.decided_at && <> · {fmtWhen(g.decision.decided_at)}</>}
            </p>
          </div>
        )}
      </div>

      {/* KLL lines */}
      <div className="overflow-x-auto border-t border-cream-2">
        <table className="w-full table-fixed text-sm">
          <colgroup><col className="w-[160px]" /><col /><col className="w-[55px]" /><col className="w-[100px]" /><col className="w-[100px]" /></colgroup>
          <tbody className="divide-y divide-cream-2">
            {g.lines.map((r, i) => (
              <tr key={`${g.order_number}-${r.sku}-${i}`} className="bg-white">
                <td className="px-3 py-2 font-data text-xs text-ink truncate">{r.sku}</td>
                <td className="px-3 py-2 text-xs text-ink-3 truncate" title={r.product_title}>{r.product_title}</td>
                <td className="px-3 py-2 text-right font-data text-xs text-ink">{r.qty}</td>
                <td className="px-3 py-2 text-right font-data text-xs text-ink">{fmtCurrency(r.unit_price)}</td>
                <td className="px-3 py-2 text-right font-data text-xs text-ink">{fmtCurrency(r.gross)}</td>
              </tr>
            ))}
            <tr className="bg-cream/40">
              <td className="px-3 py-2 text-xs font-medium text-ink-2" colSpan={4}>Order gross (KLL lines)</td>
              <td className="px-3 py-2 text-right font-data text-xs font-semibold text-ink">{fmtCurrency(g.gross)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Decision control */}
      <div className="flex flex-wrap items-center gap-2 border-t border-cream-2 px-5 py-3">
        <label className="text-xs font-medium text-ink-2">Decision</label>
        <select
          value={action}
          onChange={(e) => setAction(e.target.value as DiscountAction | '')}
          disabled={saving}
          className="rounded-lg border border-cream-3 bg-white px-2.5 py-1.5 text-xs text-ink focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20 transition disabled:opacity-50"
        >
          <option value="">— Choose an action —</option>
          {ACTION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {action === 'distribute_custom' && (
          <div className="flex items-center gap-1">
            <label className="text-xs text-ink-3">Actual discount amount (excluding any credit / other reason bundled into the total)</label>
            <span className="ml-1 text-xs text-ink-3">$</span>
            <input
              type="number" min="0" step="0.01" value={custom} disabled={saving}
              onChange={(e) => setCustom(e.target.value)} placeholder="amount"
              className="w-28 rounded-lg border border-cream-3 bg-white px-2.5 py-1.5 font-data text-xs text-ink focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20 transition disabled:opacity-50"
            />
          </div>
        )}
        {preview != null && (
          <span className="text-xs text-ink-3">
            → counts as <span className="font-data font-semibold text-ink">{fmtCurrency(preview)}</span>
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {g.resolved && (
            <button type="button" onClick={clearDecision} disabled={saving}
              className="rounded-lg border border-cream-3 bg-white px-3 py-1.5 text-xs font-medium text-ink-3 transition hover:text-ink-2 disabled:opacity-50">
              Clear
            </button>
          )}
          <button type="button" onClick={save} disabled={saving || action === '' || !dirty}
            className="rounded-lg border border-teal/40 bg-teal/10 px-3 py-1.5 text-xs font-semibold text-teal-deep transition hover:bg-teal/20 disabled:opacity-40">
            {saving ? 'Saving…' : g.resolved ? 'Update' : 'Save'}
          </button>
        </div>
        {err && <p className="w-full text-xs text-red-600">{err}</p>}
      </div>

      {/* Distribution breakdown — shown for a distribute action with an amount */}
      {showBreakdown && (
        <div className="border-t border-cream-2 bg-cream/30 px-5 py-3 text-xs leading-relaxed text-ink-2">
          <dl className="space-y-0.5">
            <div className="flex justify-between gap-4"><dt>Order&apos;s total recorded discount</dt><dd className="font-data text-ink">{g.discount_amount != null ? fmtCurrency(g.discount_amount) : '—'}</dd></div>
            <div className="flex justify-between gap-4">
              <dt>{action === 'distribute_full' ? 'Discount distributed (full)' : 'Actual discount portion (entered)'}</dt>
              <dd className="font-data text-ink">{fmtCurrency(distributeAmount)}</dd>
            </div>
          </dl>
          <p className="mt-1.5 text-ink-3">
            Distributed proportionally across all{' '}
            {g.order_line_count != null
              ? <><span className="font-semibold text-ink-2">{g.order_line_count.toLocaleString()}</span> line items</>
              : 'line items'}{' '}
            in the order (KLL and non-KLL)
            {g.order_line_total != null
              ? <> — order line value <span className="font-data">{fmtCurrency(g.order_line_total)}</span>.</>
              : <> — <span className="text-amber-700">full order value not captured yet; re-upload this month to apply it (using KLL total meanwhile).</span></>}
          </p>
          <dl className="mt-1.5 space-y-0.5">
            <div className="flex justify-between gap-4"><dt>KLL Gross before adjustment</dt><dd className="font-data text-ink">{fmtCurrency(g.gross)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="font-medium text-ink">KLL Gross after adjustment</dt><dd className="font-data font-semibold text-ink">{fmtCurrency(preview!)}</dd></div>
          </dl>

          {/* Per-line adjusted unit price */}
          <div className="mt-2 overflow-x-auto rounded-lg border border-cream-2 bg-white">
            <table className="w-full table-fixed text-xs">
              <colgroup><col className="w-[150px]" /><col className="w-[45px]" /><col /><col /><col /></colgroup>
              <thead>
                <tr className="border-b border-cream-2 text-ink-3">
                  <th className="px-2.5 py-1.5 text-left font-semibold uppercase tracking-wide">SKU</th>
                  <th className="px-2 py-1.5 text-right font-semibold uppercase tracking-wide">Qty</th>
                  <th className="px-2 py-1.5 text-right font-semibold uppercase tracking-wide whitespace-nowrap">Unit Price</th>
                  <th className="px-2 py-1.5 text-right font-semibold uppercase tracking-wide whitespace-nowrap">Adj. Unit</th>
                  <th className="px-2.5 py-1.5 text-right font-semibold uppercase tracking-wide whitespace-nowrap">Adj. Gross</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-2">
                {g.lines.map((r, i) => {
                  const adjGross = adjustedLineGross(r.gross, g.order_line_total, g.gross, distributeAmount)
                  const adjUnit = r.qty > 0 ? adjGross / r.qty : 0
                  return (
                    <tr key={`adj-${g.order_number}-${r.sku}-${i}`}>
                      <td className="px-2.5 py-1 font-data text-ink truncate">{r.sku}</td>
                      <td className="px-2 py-1 text-right font-data text-ink">{r.qty}</td>
                      <td className="px-2 py-1 text-right font-data text-ink-3">{fmtCurrency(r.unit_price)}</td>
                      <td className="px-2 py-1 text-right font-data text-ink">{fmtCurrency(adjUnit)}</td>
                      <td className="px-2.5 py-1 text-right font-data text-ink">{fmtCurrency(adjGross)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function KllWholesalePage() {
  const [month, setMonth] = useState(getDefaultMonth())
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<ReportResponse | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const fetchReport = useCallback(async (selectedMonth: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/lbla/reports/kll-wholesale?month=${selectedMonth}`)
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to load report'); setReport(null); return }
      setReport(data as ReportResponse)
    } catch {
      setError('Network error')
      setReport(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchReport(month) }, [month, fetchReport])

  async function handleUpload(file: File) {
    setIsUploading(true)
    setUploadError(null)
    setUploadResult(null)
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch('/api/lbla/reports/kll-wholesale/upload', { method: 'POST', body })
      const data = await res.json()
      if (!res.ok) { setUploadError(data.error ?? 'Upload failed'); return }
      setUploadResult(data as UploadResult)
      // Jump to the month the file covered so the result is visible immediately.
      const first = (data.months as string[])[0]
      if (first && first !== month) setMonth(first)
      else await fetchReport(month)
    } catch {
      setUploadError('Network error while uploading')
    } finally {
      setIsUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const hasClean = !!report && report.rows.length > 0
  const hasFlagged = !!report && !!report.flagged && report.flagged.order_count > 0
  const hasAnything = hasClean || hasFlagged

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6 lg:px-8">

      {/* Header */}
      <div className="mb-6">
        <Link href="/lbla" className="flex items-center gap-1.5 text-xs font-medium text-ink-3 hover:text-teal transition mb-3 w-fit">
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M10 3L5 8l5 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Team Tools
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold text-ink">KLL Wholesale Report</h1>
            <p className="mt-1 text-sm text-ink-3">
              Korean Lash Lift items sold on wholesale.lashboxla.com, from an uploaded Shopify export.
            </p>
            <p className="mt-1.5 text-sm">
              <Link href="/lbla/reports/kll-royalty" className="font-medium text-teal-deep hover:text-teal transition">
                View KLL Royalty Report →
              </Link>
            </p>
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-ink-2 mb-1">Month</label>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="rounded-xl border border-cream-3 bg-white px-4 py-2.5 text-sm text-ink focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20 transition"
            />
          </div>
        </div>
      </div>

      {/* Wholesale prices are already net — say so up front, because the retail
          report next door does subtract discounts and the two look alike. */}
      <p className="mb-6 rounded-xl border border-teal/30 bg-teal/5 px-4 py-3 text-sm text-ink-2 leading-relaxed">
        Wholesale prices are <strong className="font-semibold text-ink">already net of the customer&apos;s tier discount</strong>,
        so Gross is the final figure — there is no discount to subtract and no separate Net Sales column.
      </p>

      <CollapsibleCard title="How this works" className="mb-6">
        <ul className="px-5 py-4 space-y-1.5">
          {CALCULATION_STEPS.map((step, i) => (
            <li key={i} className="flex gap-2 text-xs text-ink-3 leading-relaxed">
              <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-ink-3" />
              {step}
            </li>
          ))}
        </ul>
      </CollapsibleCard>

      {/* Upload */}
      <div className="mb-6 rounded-2xl border border-cream-3 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink">Upload Shopify export</p>
            <p className="mt-0.5 text-xs text-ink-3">
              CSV only. The month comes from the file, so you don&apos;t need to pick it first.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              disabled={isUploading}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f) }}
              className="block text-sm text-ink-2 file:mr-3 file:rounded-xl file:border file:border-cream-3 file:bg-cream file:px-4 file:py-2 file:text-sm file:font-medium file:text-ink-2 hover:file:border-teal/40 hover:file:text-teal file:transition disabled:opacity-50"
            />
            {isUploading && <span className="text-xs text-ink-3">Parsing…</span>}
          </div>
        </div>

        {uploadError && (
          <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{uploadError}</p>
        )}
        {uploadResult && (
          <p className="mt-3 rounded-xl border border-teal/30 bg-teal/5 px-4 py-3 text-sm text-ink-2">
            Imported <strong className="font-semibold text-ink">{uploadResult.line_items.toLocaleString()}</strong> KLL line
            item{uploadResult.line_items !== 1 ? 's' : ''} across{' '}
            <strong className="font-semibold text-ink">{uploadResult.orders.toLocaleString()}</strong> paid
            order{uploadResult.orders !== 1 ? 's' : ''} —{' '}
            {uploadResult.months.map(displayMonth).join(', ')}.{' '}
            <strong className="font-semibold text-ink">{uploadResult.clean_orders.toLocaleString()}</strong> clean
            ({fmtCurrency(uploadResult.clean_gross)}),{' '}
            <strong className="font-semibold text-ink">{uploadResult.flagged_orders.toLocaleString()}</strong> flagged for review
            ({fmtCurrency(uploadResult.flagged_gross)}).
            {' '}Read {uploadResult.rows_in_file.toLocaleString()} rows from the file.
            {uploadResult.skipped_no_date > 0 && ` ${uploadResult.skipped_no_date} row(s) had no usable date and were skipped.`}
          </p>
        )}

        {report && report.months.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-cream-2 pt-3">
            <span className="text-xs text-ink-3">Uploaded so far</span>
            {report.months.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMonth(m)}
                aria-pressed={m === month}
                className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                  m === month
                    ? 'border-teal/40 bg-teal/10 text-teal-deep'
                    : 'border-cream-3 bg-white text-ink-3 hover:text-ink-2'
                }`}
              >
                {displayMonth(m)}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Summary cards — clean orders + resolved flagged orders (by their chosen
          method). Pending flagged orders are still excluded until decided. */}
      {hasAnything && report && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-cream-3 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">Gross Sales — {displayMonth(report.month)}</p>
            <p className="mt-2 font-display text-3xl font-semibold text-ink">{fmtCurrency(report.summary.gross_sales)}</p>
            <p className="mt-1 text-xs text-ink-3">
              {fmtCurrency(report.summary.clean_gross)} clean
              {report.summary.resolved_orders > 0 && <> + {fmtCurrency(report.summary.resolved_contribution)} from {report.summary.resolved_orders} resolved</>}
              {report.flagged.pending_count > 0 && <>; excludes {fmtCurrency(report.flagged.pending_subtotal_gross)} from {report.flagged.pending_count} pending</>}
            </p>
          </div>
          <div className="rounded-2xl border border-cream-3 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">Total Orders — {displayMonth(report.month)}</p>
            <p className="mt-2 font-display text-3xl font-semibold text-ink">{report.summary.total_orders.toLocaleString()}</p>
            {report.flagged.pending_count > 0 && (
              <p className="mt-1 text-xs text-ink-3">+ {report.flagged.pending_count} flagged, pending review</p>
            )}
          </div>
        </div>
      )}

      {/* SKUs sold — CLEAN orders only, collapsed by default, same as the retail report */}
      {hasClean && report.skus.length > 0 && (
        <CollapsibleCard
          title={`SKUs Sold — ${displayMonth(report.month)}`}
          titleClassName="text-xs font-semibold uppercase tracking-wide text-ink-2"
          className="mb-6"
        >
          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col className="w-[150px]" />
                <col />
                <col className="w-[110px]" />
              </colgroup>
              <thead>
                <tr className="border-b border-cream-2">
                  <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-ink-3">SKU</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-ink-3">Product Title</th>
                  <th className="px-5 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-ink-3 whitespace-nowrap">Units Sold</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-2">
                {report.skus.map((s, i) => (
                  <tr key={s.sku} className={i % 2 === 0 ? 'bg-white' : 'bg-cream/40'}>
                    <td className="px-5 py-2.5 font-data text-xs text-ink">{s.sku}</td>
                    <td className="px-3 py-2.5 text-xs text-ink-2 truncate" title={s.product_title}>{s.product_title}</td>
                    <td className="px-5 py-2.5 text-right font-data text-xs font-semibold text-ink">{s.units_sold.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CollapsibleCard>
      )}

      {/* Empty state — nothing clean AND nothing flagged for this month */}
      {!isLoading && report && !hasAnything && !error && (
        <div className="rounded-2xl border border-cream-3 bg-white p-10 text-center shadow-sm">
          <p className="text-sm text-ink-3">
            Nothing uploaded for {displayMonth(report.month)} yet.
            {report.months.length > 0
              ? ' Pick an uploaded month above, or upload that month’s export.'
              : ' Upload a Shopify export to get started.'}
          </p>
        </div>
      )}

      {/* Detail table — CLEAN orders only */}
      {hasClean && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium text-ink">
              {report.rows.length.toLocaleString()} clean line item{report.rows.length !== 1 ? 's' : ''}
              {report.upload.source_filename && (
                <span className="ml-2 font-normal text-ink-3">from {report.upload.source_filename}</span>
              )}
            </p>
            <button
              type="button"
              onClick={() => downloadCsv(report.rows, report.month)}
              className="flex items-center gap-2 rounded-xl border border-cream-3 bg-white px-4 py-2 text-sm font-medium text-ink-2 transition hover:border-teal/40 hover:text-teal"
            >
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M8 3v7M5 7l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M2 12v1a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-1" strokeLinecap="round" />
              </svg>
              Export CSV
            </button>
          </div>

          <div className="overflow-hidden rounded-2xl border border-cream-3 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full table-fixed text-sm">
                <colgroup>
                  <col className="w-[120px]" />
                  <col className="w-[150px]" />
                  <col />
                  <col className="w-[55px]" />
                  <col className="w-[110px]" />
                  <col className="w-[110px]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-cream-2 bg-cream">
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-3 whitespace-nowrap">Order Number</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-3 whitespace-nowrap">SKU</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-3 whitespace-nowrap">Product Title</th>
                    <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-ink-3 whitespace-nowrap">Qty</th>
                    <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-ink-3 whitespace-nowrap">Unit Price</th>
                    <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-ink-3 whitespace-nowrap">Gross</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cream-2">
                  {report.rows.map((r, i) => (
                    <tr key={`${r.order_number}-${r.sku}-${i}`} className={i % 2 === 0 ? 'bg-white' : 'bg-cream/40'}>
                      <td className="px-3 py-3 font-data text-xs text-ink truncate">{r.order_number}</td>
                      <td className="px-3 py-3 font-data text-xs text-ink truncate">{r.sku}</td>
                      <td className="px-3 py-3 text-xs text-ink-2 truncate" title={r.product_title}>{r.product_title}</td>
                      <td className="px-3 py-3 text-right font-data text-xs text-ink">{r.qty}</td>
                      <td className="px-3 py-3 text-right font-data text-xs text-ink">{fmtCurrency(r.unit_price)}</td>
                      <td className="px-3 py-3 text-right font-data text-xs text-ink">{fmtCurrency(r.gross)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-cream-3 bg-cream">
                    <td colSpan={5} className="px-3 py-3 text-xs font-semibold text-ink">Total (Clean)</td>
                    <td className="px-3 py-3 text-right font-data text-xs font-semibold text-ink">{fmtCurrency(report.summary.clean_gross)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Flagged orders — order-level discounted, each with a per-order decision */}
      {hasFlagged && (
        <div className="mt-8 space-y-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink">Orders with Order-Level Discounts</h2>
            <p className="mt-1 text-sm text-ink-3">
              These orders carried a Shopify discount code and/or amount, so their raw line prices aren&apos;t reliable
              wholesale figures. Choose how each should count: ignore it, distribute the discount across its lines
              (full or a custom amount), or keep it at full price. Pending orders stay <strong className="font-semibold text-ink">out</strong> of
              the totals above until decided.
            </p>
          </div>

          {/* Pending */}
          {report.flagged.pending_count > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">
                Pending Review — {report.flagged.pending_count} order{report.flagged.pending_count !== 1 ? 's' : ''} ({fmtCurrency(report.flagged.pending_subtotal_gross)} excluded)
              </p>
              {report.flagged.orders.filter((g) => !g.resolved).map((g) => (
                <FlaggedOrderCard key={g.order_number} g={g} onChanged={() => fetchReport(month)} />
              ))}
            </div>
          )}

          {/* Resolved */}
          {report.flagged.resolved_count > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">
                Resolved — {report.flagged.resolved_count} order{report.flagged.resolved_count !== 1 ? 's' : ''}
                {report.summary.resolved_orders > 0 && <> ({fmtCurrency(report.summary.resolved_contribution)} added to totals)</>}
              </p>
              {report.flagged.orders.filter((g) => g.resolved).map((g) => (
                <FlaggedOrderCard key={g.order_number} g={g} onChanged={() => fetchReport(month)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
