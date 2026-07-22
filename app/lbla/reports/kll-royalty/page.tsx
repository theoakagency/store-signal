'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────────────────

// The API also returns per-row `item_shipping_cost` / `final_net` and a
// `summary.shipping` total. Shipping is no longer part of the royalty
// calculation (July 2026 client policy) and is deliberately not surfaced
// anywhere in this report, so those fields are left off these types.
// `final_net` now equals `net_sales` for every row, which is why the table
// shows Net Sales alone rather than both.
//
// The API also returns the ROYALTY-BASIS figures per row — `discount_amount` and
// `net_sales` (allowlisted codes only), `gwp_cost`, and `royalty` itself. None of
// them appear on this page or in its CSV any more: this is a plain sales record,
// and it reports only what the customer actually paid. They are left off this type
// so nothing can read them by accident. The calculation still lives in the API if
// it is ever needed again.

interface DetailRow {
  order_number: string
  sku: string
  product_title: string
  qty: number
  unit_price: number
  gross_sales: number
  discount_code: string
  actual_discount_amount: number
  actual_net_sales: number
}

interface SkuTotal {
  sku: string
  product_title: string
  units_sold: number
}

// Same reasoning as DetailRow above: the summary's royalty-basis totals are
// returned by the API but deliberately absent from this type.
interface ReportResponse {
  month: string
  summary: {
    gross_sales: number
    total_orders: number
    actual_discounts: number
    actual_net_sales: number
  }
  skus: SkuTotal[]
  rows: DetailRow[]
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

function downloadCsv(rows: DetailRow[], month: string) {
  // One column per column on screen, in the same order and carrying the same
  // values — Discount Amount and Net Sales are the ACTUAL figures, what the
  // customer really paid.
  //
  // The royalty-basis discount / net sales and GWP Cost columns used to ride
  // along so the Royalty figure could be reconstructed from the file. Royalty is
  // no longer reported anywhere on this page, so they had no on-screen
  // counterpart left to reconcile against and have been dropped. The API still
  // returns all three if that ever needs reversing.
  const headers = [
    'Order', 'SKU', 'Product Title', 'Qty', 'Unit Price', 'Gross',
    'Discount Code', 'Discount Amount', 'Net Sales',
  ]
  const csvRows = [
    headers,
    ...rows.map((r) => [
      r.order_number, r.sku, r.product_title, String(r.qty),
      r.unit_price.toFixed(2), r.gross_sales.toFixed(2),
      r.discount_code, r.actual_discount_amount.toFixed(2), r.actual_net_sales.toFixed(2),
    ]),
  ]
  const csv = csvRows.map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `kll-royalty-${month}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Detail table columns ───────────────────────────────────────────────────────

// Order / SKU-Product / Qty / Unit Price / Gross are always shown — they answer
// "what sold". Discount and Net Sales are a single hideable unit: they are the
// two customer-paid figures and only make sense read together, so there is one
// toggle for the pair rather than one each.
//
// GWP and Royalty are deliberately absent as columns. GWP is a per-item input to
// Net Sales rather than something a reader checks row by row, and royalty is
// reported for the month as a whole — both appear only in the Totals block above
// the table.

const ALWAYS_VISIBLE_COLUMN_COUNT = 5

// The pair is tinted and pulled together so it reads as one block distinct from
// the always-visible columns. The tint sits on the cells themselves, so it wins
// over the tbody zebra striping — intentional: the band should be continuous
// down the column rather than alternating with the rows.
//
// Padding is asymmetric to close the gap between the two columns only: each keeps
// normal px-3 breathing room on its outer edge (Gross before, table edge after)
// and gives up padding on the edge facing its partner.
//
// Both columns are RIGHT-aligned. That is what actually makes them read as a pair:
// left-aligning Discount parked its text against the left edge of the band while
// Net Sales sat against the right edge, leaving a wide empty gap between the two
// values no amount of padding could close. Right-aligning both puts the discount
// block directly alongside the net sales figure.
const PAIR_TINT_BODY = 'bg-teal/5'
const PAIR_TINT_EDGE = 'bg-teal/10' // header + footer, slightly stronger to cap the band
const PAIR_PAD_LEFT = 'pl-3 pr-0.5'   // Discount — outer edge left
// Net Sales carries a hairline seam on its inner edge. Once the two columns were
// tight enough to read as one unit, their right-aligned headers ran together into
// "DISCOUNT NET SALES"; the seam separates the two labels without reopening the
// gap. It is deliberately fainter than the table's own row rules so it reads as a
// join inside the tinted band, not as a boundary between two unrelated columns.
const PAIR_PAD_RIGHT = 'pl-1 pr-3 border-l border-teal/25' // Net Sales — outer edge right

// ── Calculation explainer ──────────────────────────────────────────────────────

const CALCULATION_STEPS = [
  'This shows every Korean Lash Lift item sold in the selected month, with the gross sale price for each line',
  'Gross Sales is the full sale price of those items added up, before any discount',
  'Total Orders counts each order once, however many Korean Lash Lift items it contained',
  'KLL Event giveaway orders are left out entirely — those are comped stock, not sales',
  'The Discount and Net Sales columns in the table show what the customer actually paid on each line',
]

function CalculationExplainer() {
  const [open, setOpen] = useState(false)

  return (
    <div className="mb-6 rounded-2xl border border-cream-3 bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-cream/50 transition"
      >
        <span className="text-xs font-semibold text-ink-2">How this number is calculated</span>
        <svg
          className={`h-3.5 w-3.5 text-ink-3 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}
        >
          <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <ul className="border-t border-cream-2 px-5 py-4 space-y-1.5">
          {CALCULATION_STEPS.map((step, i) => (
            <li key={i} className="flex gap-2 text-xs text-ink-3 leading-relaxed">
              <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-ink-3" />
              {step}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Table skeleton ────────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-cream-3 bg-white shadow-sm">
      <div className="divide-y divide-cream-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-3 animate-pulse">
            <div className="h-4 w-20 rounded bg-cream-3" />
            <div className="h-4 w-32 rounded bg-cream-2" />
            <div className="h-4 w-12 rounded bg-cream-2 ml-auto" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Column show/hide control ───────────────────────────────────────────────────

function ColumnToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
        on
          ? 'border-teal/40 bg-teal/10 text-teal-deep'
          : 'border-cream-3 bg-white text-ink-3 hover:border-cream-3 hover:text-ink-2'
      }`}
    >
      Show Discounts and Net Sales
    </button>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function KllRoyaltyReportPage() {
  const [month, setMonth] = useState(getDefaultMonth())
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<ReportResponse | null>(null)
  // Discount + Net Sales show and hide together as one unit.
  const [showPair, setShowPair] = useState(true)
  const togglePair = useCallback(() => setShowPair((v) => !v), [])

  // The "Total" label cell covers exactly the always-visible columns. When the
  // pair is shown it is followed by two tinted cells (an empty one under Discount,
  // then the Net Sales total) so the tinted band runs unbroken to the bottom of
  // the table; when hidden, the label alone spans the whole row.
  const totalLabelSpan = ALWAYS_VISIBLE_COLUMN_COUNT

  const fetchReport = useCallback(async (selectedMonth: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/lbla/reports/kll-royalty?month=${selectedMonth}`)
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
            <h1 className="font-display text-2xl font-semibold text-ink">KLL Royalty Report</h1>
            <p className="mt-1 text-sm text-ink-3">
              Korean Lash Lift items sold, lashboxla.com retail only.{' '}
              <Link href="/lbla/settings/discount-codes" className="text-teal-deep hover:text-teal transition">Manage allowed discount codes →</Link>
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

      <CalculationExplainer />

      {/* Error */}
      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Summary cards */}
      {report && !error && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-cream-3 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">Gross Sales — {displayMonth(report.month)}</p>
            <p className="mt-2 font-display text-3xl font-semibold text-ink">{fmtCurrency(report.summary.gross_sales)}</p>
          </div>
          <div className="rounded-2xl border border-cream-3 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">Total Orders — {displayMonth(report.month)}</p>
            <p className="mt-2 font-display text-3xl font-semibold text-ink">{report.summary.total_orders.toLocaleString()}</p>
          </div>
        </div>
      )}

      {/* SKUs sold this month, highest units first. Ordering is done server-side so
          the list cannot drift from the totals it is derived from. */}
      {report && !error && report.skus.length > 0 && (
        <div className="mb-6 overflow-hidden rounded-2xl border border-cream-3 bg-white shadow-sm">
          <div className="border-b border-cream-2 bg-cream px-5 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-2">SKUs Sold — {displayMonth(report.month)}</p>
          </div>
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
        </div>
      )}

      {/* Loading */}
      {isLoading && <TableSkeleton />}

      {/* No results */}
      {!isLoading && report && report.rows.length === 0 && !error && (
        <div className="rounded-2xl border border-cream-3 bg-white p-10 text-center shadow-sm">
          <p className="text-sm text-ink-3">No target-SKU sales found for {displayMonth(report.month)}.</p>
        </div>
      )}

      {/* Detail table */}
      {!isLoading && report && report.rows.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium text-ink">
              {report.rows.length.toLocaleString()} line item{report.rows.length !== 1 ? 's' : ''}
            </p>
            <div className="flex flex-wrap items-center gap-3">
            <ColumnToggle on={showPair} onToggle={togglePair} />
            {/* The export is the client-facing deliverable, so it always carries the
                full data set — hiding a column on screen must not silently drop it
                from the CSV someone reconciles against. */}
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
          </div>

          {/* The previous wording explained why these columns didn't tie back to the
              Totals block's royalty figures. Both are gone, so there is nothing left
              to reconcile against — all that still needs saying is what the columns
              mean. */}
          <p className="rounded-xl border border-cream-3 bg-cream/50 px-4 py-2.5 text-xs text-ink-3 leading-relaxed">
            Gross is the full sale price before any discount. Discount and Net Sales show what the customer{' '}
            <em>actually</em>{' '}paid on that line, with every discount code counted.
          </p>

          <div className="overflow-hidden rounded-2xl border border-cream-3 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full table-fixed text-sm">
                {/* SKU / Product is deliberately the ONLY column without a width.
                    Under table-fixed, columns with no specified width absorb all the
                    leftover space, so every other column holds exactly the width set
                    here. Giving the pair a fixed width was not enough on its own —
                    when every column is sized, the browser distributes slack across
                    all of them proportionally, which re-inflated Discount and Net
                    Sales into a wide band and pushed their contents apart. */}
                <colgroup>
                  <col className="w-[90px]" />
                  <col />
                  <col className="w-[55px]" />
                  <col className="w-[105px]" />
                  <col className="w-[105px]" />
                  {showPair && <col className="w-[130px]" />}
                  {/* Sized to the widest value it must hold ($199.00) plus its outer
                      padding and the "NET SALES" header, and no wider. Every extra
                      pixel here lands as blank space to the LEFT of a right-aligned
                      figure — i.e. directly in the gap between the two columns. */}
                  {showPair && <col className="w-[82px]" />}
                </colgroup>
                <thead>
                  <tr className="border-b border-cream-2 bg-cream">
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-3 whitespace-nowrap">Order</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-3 whitespace-nowrap">SKU / Product</th>
                    <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-ink-3 whitespace-nowrap">Qty</th>
                    <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-ink-3 whitespace-nowrap">Unit Price</th>
                    <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-ink-3 whitespace-nowrap">Gross</th>
                    {showPair && (
                      <th className={`${PAIR_TINT_EDGE} ${PAIR_PAD_LEFT} py-3 text-right text-xs font-semibold uppercase tracking-wide text-teal-deep whitespace-nowrap`}>Discount</th>
                    )}
                    {showPair && (
                      <th className={`${PAIR_TINT_EDGE} ${PAIR_PAD_RIGHT} py-3 text-right text-xs font-semibold uppercase tracking-wide text-teal-deep whitespace-nowrap`}>Net Sales</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-cream-2">
                  {report.rows.map((r, i) => (
                    <tr key={`${r.order_number}-${r.sku}-${i}`} className={i % 2 === 0 ? 'bg-white' : 'bg-cream/40'}>
                      <td className="px-3 py-3 font-data text-xs text-ink truncate">{r.order_number}</td>
                      <td className="px-3 py-3 text-xs text-ink truncate" title={r.product_title}>
                        <span className="font-data">{r.sku}</span>
                        <span className="block text-ink-3 truncate">{r.product_title}</span>
                      </td>
                      <td className="px-3 py-3 text-right font-data text-xs text-ink">{r.qty}</td>
                      <td className="px-3 py-3 text-right font-data text-xs text-ink">{fmtCurrency(r.unit_price)}</td>
                      <td className="px-3 py-3 text-right font-data text-xs text-ink">{fmtCurrency(r.gross_sales)}</td>
                      {showPair && (
                        <td className={`${PAIR_TINT_BODY} ${PAIR_PAD_LEFT} py-3 text-right text-xs text-ink-2 truncate`}>
                          {r.discount_code || '—'}
                          {r.actual_discount_amount > 0 && (
                            <span className="block font-data text-ink-3">-{fmtCurrency(r.actual_discount_amount)}</span>
                          )}
                        </td>
                      )}
                      {showPair && (
                        <td className={`${PAIR_TINT_BODY} ${PAIR_PAD_RIGHT} py-3 text-right font-data text-xs text-ink`}>{fmtCurrency(r.actual_net_sales)}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-cream-3 bg-cream">
                    <td colSpan={totalLabelSpan} className="px-3 py-3 text-xs font-semibold text-ink">Total</td>
                    {showPair && (
                      <td className={`${PAIR_TINT_EDGE} ${PAIR_PAD_LEFT} py-3`} />
                    )}
                    {/* Sums the column above it, so this is the ACTUAL net sales
                        total — deliberately not the royalty-basis Net Sales in the
                        Totals block. A footer that didn't add up to its own column
                        would read as an arithmetic error. */}
                    {showPair && (
                      <td className={`${PAIR_TINT_EDGE} ${PAIR_PAD_RIGHT} py-3 text-right font-data text-xs font-semibold text-ink`}>{fmtCurrency(report.summary.actual_net_sales)}</td>
                    )}
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
