'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import CollapsibleCard from '@/app/lbla/_components/CollapsibleCard'

// ── Types ─────────────────────────────────────────────────────────────────────

interface DiscountRow {
  label: string
  total_discounted: number
  order_count: number
  code_count: number
}

interface ReportResponse {
  month: string
  discounts: {
    rows: DiscountRow[]
    total_discounted: number
    uncoded_total: number
  }
  summary: {
    kll_orders: number
    free_shipping_given: number
    free_shipping_orders: number
    orders_no_shipping_line: number
    loyalty_covered_shipping: number
    customer_paid_shipping: number
    actual_shipping_cost: number
    labels_counted: number
    voided_labels_excluded: number
    orders_with_label: number
    total_gwp_cost: number
  }
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

// ── Explainer ─────────────────────────────────────────────────────────────────

const CALCULATION_STEPS = [
  'Every discount applied to a Korean Lash Lift line in the selected month, whatever the code',
  'Brand Ambassador (DT) and Loyalty Lion (LL) codes are one row each — there are hundreds of individual codes and they only mean anything added up',
  'Every other code gets its own row',
  'Order Count is how many separate orders that code (or group) appeared on',
  'KLL Event giveaway orders are left out entirely — those are comped stock, not sales',
]

function CalculationExplainer() {
  return (
    <CollapsibleCard title="How this is put together" className="mb-6">
      <ul className="px-5 py-4 space-y-1.5">
        {CALCULATION_STEPS.map((step, i) => (
          <li key={i} className="flex gap-2 text-xs text-ink-3 leading-relaxed">
            <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-ink-3" />
            {step}
          </li>
        ))}
      </ul>
    </CollapsibleCard>
  )
}

function TableSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-cream-3 bg-white shadow-sm">
      <div className="divide-y divide-cream-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-3 animate-pulse">
            <div className="h-4 w-40 rounded bg-cream-3" />
            <div className="h-4 w-24 rounded bg-cream-2 ml-auto" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Summary figure ────────────────────────────────────────────────────────────

function SummaryFigure({
  label, value, note,
}: { label: string; value: string; note?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{label}</p>
        {note && <p className="mt-0.5 text-xs text-ink-3 leading-relaxed">{note}</p>}
      </div>
      <p className="font-data text-base font-semibold text-ink whitespace-nowrap">{value}</p>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function KllDiscountSummaryPage() {
  const [month, setMonth] = useState(getDefaultMonth())
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<ReportResponse | null>(null)

  const fetchReport = useCallback(async (selectedMonth: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/lbla/reports/kll-discount-summary?month=${selectedMonth}`)
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
    <div className="mx-auto max-w-[1080px] px-4 py-8 sm:px-6 lg:px-8">

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
            <h1 className="font-display text-2xl font-semibold text-ink">KLL Discount Summary</h1>
            <p className="mt-1 text-sm text-ink-3">
              Discounts, free shipping and gift cost on Korean Lash Lift orders, lashboxla.com retail only.
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

      {/* Scoping notice. Deliberately always visible and above the fold — a mixed
          cart's discount is split across its lines, and these figures only ever
          count the Korean Lash Lift share. Reading them as the order's full
          discount would overstate June by roughly 90%, so this cannot sit behind a
          tooltip or inside the collapsed explainer. */}
      <p className="mb-6 rounded-xl border border-teal/30 bg-teal/5 px-4 py-3 text-sm text-ink-2 leading-relaxed">
        These figures reflect discounts applied to <strong className="font-semibold text-ink">Korean Lash Lift products only</strong>,
        not total discounts across the full order. Where an order also contained non-KLL items, only the portion of the
        discount allocated to the KLL line items is counted here.
      </p>

      <CalculationExplainer />

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {isLoading && <TableSkeleton />}

      {!isLoading && report && !error && report.discounts.rows.length === 0 && (
        <div className="rounded-2xl border border-cream-3 bg-white p-10 text-center shadow-sm">
          <p className="text-sm text-ink-3">No discounted Korean Lash Lift sales found for {displayMonth(report.month)}.</p>
        </div>
      )}

      {!isLoading && report && !error && report.discounts.rows.length > 0 && (
        <>
          {/* Discounts by code */}
          <div className="mb-6 overflow-hidden rounded-2xl border border-cream-3 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cream-2 bg-cream px-5 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-2">
                Discounts — {displayMonth(report.month)}
              </p>
              <p className="text-xs text-ink-3">
                {report.discounts.rows.length} row{report.discounts.rows.length !== 1 ? 's' : ''} across {report.summary.kll_orders.toLocaleString()} KLL orders
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full table-fixed text-sm">
                <colgroup>
                  <col />
                  <col className="w-[170px]" />
                  <col className="w-[120px]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-cream-2">
                    <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-ink-3">Discount Code / Category</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-ink-3 whitespace-nowrap">Total Discounted</th>
                    <th className="px-5 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-ink-3 whitespace-nowrap">Order Count</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cream-2">
                  {report.discounts.rows.map((r, i) => (
                    <tr key={r.label} className={i % 2 === 0 ? 'bg-white' : 'bg-cream/40'}>
                      <td className="px-5 py-2.5 text-xs text-ink truncate" title={r.label}>
                        {r.label}
                        {r.code_count > 1 && (
                          <span className="ml-2 text-ink-3">({r.code_count.toLocaleString()} codes)</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-data text-xs text-ink">{fmtCurrency(r.total_discounted)}</td>
                      <td className="px-5 py-2.5 text-right font-data text-xs text-ink">{r.order_count.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-cream-3 bg-cream">
                    <td className="px-5 py-3 text-xs font-semibold text-ink">Total</td>
                    <td className="px-3 py-3 text-right font-data text-xs font-semibold text-ink">{fmtCurrency(report.discounts.total_discounted)}</td>
                    <td className="px-5 py-3" />
                  </tr>
                </tfoot>
              </table>
            </div>
            {report.discounts.uncoded_total > 0 && (
              /* Automatic/script discounts have no code to attribute them to. Shown
                 rather than dropped so the rows above still reconcile to reality. */
              <p className="border-t border-cream-2 px-5 py-3 text-xs text-ink-3 leading-relaxed">
                A further {fmtCurrency(report.discounts.uncoded_total)} came off automatically with no discount code attached,
                so it has no row above.
              </p>
            )}
          </div>

          {/* Shipping + GWP */}
          <div className="overflow-hidden rounded-2xl border border-cream-3 bg-white shadow-sm">
            <div className="border-b border-cream-2 bg-cream px-5 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-2">
                Shipping &amp; Gift Cost — {displayMonth(report.month)}
              </p>
            </div>
            <dl className="divide-y divide-cream-2">
              {/* A count, not a dollar figure: these orders were never quoted a
                  shipping charge, so there is no amount to total. */}
              <SummaryFigure
                label="Orders with No Shipping Charge Recorded"
                value={report.summary.orders_no_shipping_line.toLocaleString()}
                note={`KLL orders that were never charged for shipping — most likely qualified automatically for the $150+ free-shipping threshold at checkout. No shipping was quoted, so there is no dollar amount to count.`}
              />
              <SummaryFigure
                label="Free Shipping Given Away (Discount Code)"
                value={fmtCurrency(report.summary.free_shipping_given)}
                note={`Shipping that was quoted a real cost and then reduced to $0 by a discount code (e.g. Loyalty Lion top-tier free shipping), across ${report.summary.free_shipping_orders.toLocaleString()} orders.`}
              />
              <SummaryFigure
                label="Actual Shipping Cost Paid"
                value={fmtCurrency(report.summary.actual_shipping_cost)}
                note={`Carrier cost from ShipStation across ${report.summary.labels_counted.toLocaleString()} labels on ${report.summary.orders_with_label.toLocaleString()} of ${report.summary.kll_orders.toLocaleString()} KLL orders${report.summary.voided_labels_excluded > 0 ? `, with ${report.summary.voided_labels_excluded.toLocaleString()} voided label${report.summary.voided_labels_excluded !== 1 ? 's' : ''} excluded` : ''}.`}
              />
              <SummaryFigure
                label="Total GWP Cost"
                value={fmtCurrency(report.summary.total_gwp_cost)}
                note="Cost of the free gifts bundled with Korean Lash Lift kits sold this month."
              />
            </dl>
            {report.summary.loyalty_covered_shipping > 0 && (
              /* Points are the customer's own currency, so this is not a giveaway —
                 the royalty report treats it as customer-paid too. Surfaced so the
                 free-shipping figure above cannot be read as the whole picture. */
              <p className="border-t border-cream-2 px-5 py-3 text-xs text-ink-3 leading-relaxed">
                A further {fmtCurrency(report.summary.loyalty_covered_shipping)} of shipping was redeemed with Loyalty Lion
                points. That counts as paid by the customer rather than given away, so it is not in the figure above.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
