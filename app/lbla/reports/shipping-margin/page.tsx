'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────────────────

interface TierRow { method: string; orders: number; avg_charged: number; avg_paid: number; avg_margin: number; total_margin: number }
interface BucketRow { label: string; orders: number; pct_free: number; avg_label_cost: number; avg_margin: number; total_margin: number }
interface LossLeader { order_number: string; method: string; charged: number; paid: number; gap: number; subtotal: number }
interface DetailRow { order_number: string; shipping_method: string; subtotal: number; charged: number; paid: number; margin: number }

interface ReportResponse {
  range: { start: string; end: string }
  coverage: { total_paid_orders: number; shipped_orders: number; pos_orders: number; matched_orders: number; unmatched_shipped: number; match_rate: number }
  summary: { shipping_collected: number; shipping_paid: number; net_margin: number; margin_pct: number | null; orders: number }
  by_tier: TierRow[]
  by_bucket: BucketRow[]
  free_shipping: { orders: number; carrier_cost: number }
  loss_leaders: LossLeader[]
  cancelled_with_label: { orders: number; carrier_cost: number }
  detail: DetailRow[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function trailing30(): { start: string; end: string } {
  const now = new Date()
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - 30)
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) }
}

function fmtCurrency(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}
function fmtPct(n: number | null): string {
  return n == null ? '—' : `${(n * 100).toFixed(1)}%`
}
function fmtDate(d: string): string {
  const [y, m, day] = d.split('-').map(Number)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[m - 1]} ${day}, ${y}`
}

function downloadCsv(rows: DetailRow[], range: { start: string; end: string }) {
  const headers = ['Order Number', 'Shipping Method', 'Subtotal', 'Shipping Charged', 'Carrier Cost Paid', 'Shipping Margin']
  const csvRows = [
    headers,
    ...rows.map((r) => [
      r.order_number, r.shipping_method, r.subtotal.toFixed(2),
      r.charged.toFixed(2), r.paid.toFixed(2), r.margin.toFixed(2),
    ]),
  ]
  const csv = csvRows.map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `shipping-margin-${range.start}_to_${range.end}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Calculation explainer ──────────────────────────────────────────────────────

const CALCULATION_STEPS = [
  'For every order, we compare what the customer paid for shipping at checkout with what we actually paid the carrier for the shipping label',
  'Voided labels and return labels are left out, so a label that was cancelled and reprinted is never counted twice',
  'Some orders are excluded, like in-store pickups and orders we could not match to a label, and we show you how many in the coverage card',
  'These numbers cover carrier label costs only, not boxes, packing materials, or packing time',
  'Shipping margin is simply what we collected minus what we paid the carrier',
]

function CalculationExplainer() {
  const [open, setOpen] = useState(false)
  return (
    <div className="mb-6 rounded-2xl border border-cream-3 bg-white shadow-sm overflow-hidden">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-cream/50 transition">
        <span className="text-xs font-semibold text-ink-2">How this is calculated</span>
        <svg className={`h-3.5 w-3.5 text-ink-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}>
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

// ── Skeleton ────────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-cream-3 bg-white p-6 shadow-sm animate-pulse">
            <div className="h-3 w-24 rounded bg-cream-3" />
            <div className="mt-3 h-8 w-28 rounded bg-cream-2" />
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-2xl border border-cream-3 bg-white shadow-sm">
        <div className="divide-y divide-cream-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3 animate-pulse">
              <div className="h-4 w-40 rounded bg-cream-3" />
              <div className="h-4 w-16 rounded bg-cream-2 ml-auto" />
              <div className="h-4 w-16 rounded bg-cream-2" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Reusable stat card ──────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: 'teal' | 'red' | 'ink' }) {
  const color = accent === 'teal' ? 'text-teal-deep' : accent === 'red' ? 'text-red-600' : 'text-ink'
  return (
    <div className="rounded-2xl border border-cream-3 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">{label}</p>
      <p className={`mt-2 font-display text-3xl font-semibold ${color}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-ink-3">{sub}</p>}
    </div>
  )
}

const TH = 'px-3 py-3 text-xs font-semibold uppercase tracking-wide text-ink-3 whitespace-nowrap'

// ── Main page ────────────────────────────────────────────────────────────────────

export default function ShippingMarginReportPage() {
  const [range, setRange] = useState(trailing30())
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<ReportResponse | null>(null)

  const fetchReport = useCallback(async (r: { start: string; end: string }) => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/lbla/reports/shipping-margin?start=${r.start}&end=${r.end}`)
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to load report'); setReport(null); return }
      setReport(data as ReportResponse)
    } catch {
      setError('Network error'); setReport(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchReport(range) }, [range, fetchReport])

  const marginAccent = report && report.summary.net_margin < 0 ? 'red' : 'teal'

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
            <h1 className="font-display text-2xl font-semibold text-ink">Shipping Margin Report</h1>
            <p className="mt-1 text-sm text-ink-3">What we collect for shipping vs. what we pay carriers for the label. Carrier cost only.</p>
          </div>
          <div className="flex items-end gap-2">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-ink-2 mb-1">Start</label>
              <input type="date" value={range.start} max={range.end}
                onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))}
                className="rounded-xl border border-cream-3 bg-white px-3 py-2.5 text-sm text-ink focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20 transition" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-ink-2 mb-1">End</label>
              <input type="date" value={range.end} min={range.start}
                onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))}
                className="rounded-xl border border-cream-3 bg-white px-3 py-2.5 text-sm text-ink focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20 transition" />
            </div>
          </div>
        </div>
      </div>

      <CalculationExplainer />

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {isLoading && <Skeleton />}

      {!isLoading && report && !error && (
        <div className="space-y-8">

          {/* Headline cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Shipping Collected" value={fmtCurrency(report.summary.shipping_collected)} sub={`${report.summary.orders.toLocaleString()} matched orders`} />
            <StatCard label="Paid to Carriers" value={fmtCurrency(report.summary.shipping_paid)} sub="Label cost + insurance" />
            <StatCard label="Net Shipping Margin" value={fmtCurrency(report.summary.net_margin)} sub={`${fmtPct(report.summary.margin_pct)} of collected`} accent={marginAccent} />
            <StatCard label="Data Coverage" value={fmtPct(report.coverage.match_rate)} sub={`${report.coverage.matched_orders.toLocaleString()}/${report.coverage.shipped_orders.toLocaleString()} shipped orders · ${fmtDate(report.range.start)}–${fmtDate(report.range.end)}`} />
          </div>

          {report.summary.orders === 0 && (
            <div className="rounded-2xl border border-cream-3 bg-white p-10 text-center shadow-sm">
              <p className="text-sm text-ink-3">No matched shipped orders in this range. ShipStation label data only exists for recently-backfilled windows — try a more recent range.</p>
            </div>
          )}

          {report.summary.orders > 0 && (
            <>
              {/* Margin by tier */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-lg font-semibold text-ink">Margin by shipping tier</h2>
                  <button type="button" onClick={() => downloadCsv(report.detail, report.range)}
                    className="flex items-center gap-2 rounded-xl border border-cream-3 bg-white px-4 py-2 text-sm font-medium text-ink-2 transition hover:border-teal/40 hover:text-teal">
                    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M8 3v7M5 7l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M2 12v1a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-1" strokeLinecap="round" />
                    </svg>
                    Export CSV
                  </button>
                </div>
                <div className="overflow-hidden rounded-2xl border border-cream-3 bg-white shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-cream-2 bg-cream">
                          <th className={`${TH} text-left`}>Shipping Tier</th>
                          <th className={`${TH} text-right`}>Orders</th>
                          <th className={`${TH} text-right`}>Avg Charged</th>
                          <th className={`${TH} text-right`}>Avg Paid</th>
                          <th className={`${TH} text-right`}>Avg Margin</th>
                          <th className={`${TH} text-right`}>Total Margin</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-cream-2">
                        {report.by_tier.map((t, i) => (
                          <tr key={t.method} className={i % 2 === 0 ? 'bg-white' : 'bg-cream/40'}>
                            <td className="px-3 py-3 text-xs text-ink">{t.method}</td>
                            <td className="px-3 py-3 text-right font-data text-xs text-ink">{t.orders.toLocaleString()}</td>
                            <td className="px-3 py-3 text-right font-data text-xs text-ink">{fmtCurrency(t.avg_charged)}</td>
                            <td className="px-3 py-3 text-right font-data text-xs text-ink">{fmtCurrency(t.avg_paid)}</td>
                            <td className={`px-3 py-3 text-right font-data text-xs ${t.avg_margin < 0 ? 'text-red-600' : 'text-ink'}`}>{fmtCurrency(t.avg_margin)}</td>
                            <td className={`px-3 py-3 text-right font-data text-xs font-semibold ${t.total_margin < 0 ? 'text-red-600' : 'text-teal-deep'}`}>{fmtCurrency(t.total_margin)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-cream-3 bg-cream">
                          <td className="px-3 py-3 text-xs font-semibold text-ink">Total</td>
                          <td className="px-3 py-3 text-right font-data text-xs font-semibold text-ink">{report.summary.orders.toLocaleString()}</td>
                          <td colSpan={3} />
                          <td className={`px-3 py-3 text-right font-data text-xs font-semibold ${report.summary.net_margin < 0 ? 'text-red-600' : 'text-teal-deep'}`}>{fmtCurrency(report.summary.net_margin)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </section>

              {/* Margin by order-value bucket */}
              <section className="space-y-3">
                <h2 className="font-display text-lg font-semibold text-ink">Margin by order value</h2>
                <p className="text-xs text-ink-3">Buckets on order subtotal (before shipping and tax). The free-shipping threshold shows up as a jump in “% free shipping”.</p>
                <div className="overflow-hidden rounded-2xl border border-cream-3 bg-white shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-cream-2 bg-cream">
                          <th className={`${TH} text-left`}>Order Value</th>
                          <th className={`${TH} text-right`}>Orders</th>
                          <th className={`${TH} text-right`}>% Free Shipping</th>
                          <th className={`${TH} text-right`}>Avg Label Cost</th>
                          <th className={`${TH} text-right`}>Avg Margin</th>
                          <th className={`${TH} text-right`}>Total Margin</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-cream-2">
                        {report.by_bucket.map((b, i) => (
                          <tr key={b.label} className={i % 2 === 0 ? 'bg-white' : 'bg-cream/40'}>
                            <td className="px-3 py-3 text-xs text-ink">{b.label}</td>
                            <td className="px-3 py-3 text-right font-data text-xs text-ink">{b.orders.toLocaleString()}</td>
                            <td className="px-3 py-3 text-right font-data text-xs text-ink">{fmtPct(b.pct_free)}</td>
                            <td className="px-3 py-3 text-right font-data text-xs text-ink">{fmtCurrency(b.avg_label_cost)}</td>
                            <td className={`px-3 py-3 text-right font-data text-xs ${b.avg_margin < 0 ? 'text-red-600' : 'text-ink'}`}>{fmtCurrency(b.avg_margin)}</td>
                            <td className={`px-3 py-3 text-right font-data text-xs font-semibold ${b.total_margin < 0 ? 'text-red-600' : 'text-teal-deep'}`}>{fmtCurrency(b.total_margin)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-cream-3 bg-cream/40 px-4 py-3">
                    <p className="text-xs font-semibold text-ink-2">Cost of free shipping</p>
                    <p className="mt-1 text-sm text-ink-3">We paid <span className="font-data font-semibold text-ink">{fmtCurrency(report.free_shipping.carrier_cost)}</span> in carrier costs on <span className="font-semibold text-ink">{report.free_shipping.orders.toLocaleString()}</span> free-shipping orders in this range.</p>
                  </div>
                  <div className="rounded-xl border border-cream-3 bg-cream/40 px-4 py-3">
                    <p className="text-xs font-semibold text-ink-2">Cancelled after a label was bought</p>
                    <p className="mt-1 text-sm text-ink-3"><span className="font-semibold text-ink">{report.cancelled_with_label.orders.toLocaleString()}</span> cancelled orders had a paid label — <span className="font-data font-semibold text-ink">{fmtCurrency(report.cancelled_with_label.carrier_cost)}</span> in carrier cost with no revenue. Not included in the margin above.</p>
                  </div>
                </div>
              </section>

              {/* Loss leaders */}
              <section className="space-y-3">
                <h2 className="font-display text-lg font-semibold text-ink">Biggest shipping losses</h2>
                <p className="text-xs text-ink-3">Individual orders where the carrier cost most exceeded what the customer was charged.</p>
                {report.loss_leaders.length === 0 ? (
                  <div className="rounded-2xl border border-cream-3 bg-white p-6 text-center shadow-sm">
                    <p className="text-sm text-ink-3">No orders lost money on shipping in this range.</p>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-2xl border border-cream-3 bg-white shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-cream-2 bg-cream">
                            <th className={`${TH} text-left`}>Order</th>
                            <th className={`${TH} text-left`}>Tier</th>
                            <th className={`${TH} text-right`}>Subtotal</th>
                            <th className={`${TH} text-right`}>Charged</th>
                            <th className={`${TH} text-right`}>Paid</th>
                            <th className={`${TH} text-right`}>Loss</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-cream-2">
                          {report.loss_leaders.map((l, i) => (
                            <tr key={`${l.order_number}-${i}`} className={i % 2 === 0 ? 'bg-white' : 'bg-cream/40'}>
                              <td className="px-3 py-3 font-data text-xs text-ink">{l.order_number}</td>
                              <td className="px-3 py-3 text-xs text-ink-2 truncate" title={l.method}>{l.method}</td>
                              <td className="px-3 py-3 text-right font-data text-xs text-ink">{fmtCurrency(l.subtotal)}</td>
                              <td className="px-3 py-3 text-right font-data text-xs text-ink">{fmtCurrency(l.charged)}</td>
                              <td className="px-3 py-3 text-right font-data text-xs text-ink">{fmtCurrency(l.paid)}</td>
                              <td className="px-3 py-3 text-right font-data text-xs font-semibold text-red-600">-{fmtCurrency(l.gap)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </section>

              {/* Exclusions footnote */}
              <div className="rounded-2xl border border-cream-3 bg-cream/40 px-5 py-4 text-xs text-ink-3 leading-relaxed space-y-1">
                <p className="font-semibold text-ink-2">What&apos;s excluded</p>
                <p>{report.coverage.pos_orders.toLocaleString()} in-store pickup (POS) orders and {report.coverage.unmatched_shipped.toLocaleString()} shipped orders we couldn&apos;t match to a label are left out of the margin figures ({fmtPct(report.coverage.match_rate)} of shipped orders matched). Voided and return labels are excluded from all cost sums. Figures are carrier label cost plus insurance only — they do not include boxes, packing materials, or labor.</p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
