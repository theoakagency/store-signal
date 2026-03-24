'use client'

import { useState } from 'react'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────────────────

interface IntervalBucket {
  count: number
  mrr: number
  pct: number
}

interface LtvGroup {
  count: number
  ltv: number
  orders: number
  aov: number
}

interface ProductRow {
  name: string
  active_subscribers: number
  mrr: number
  pct_of_total: number
  avg_interval: number | null
}

interface Metrics {
  active_subscribers: number
  mrr: number
  arr: number
  avg_subscription_value: number
  churn_rate_30d: number
  top_subscribed_product: string | null
  interval_breakdown: Record<string, IntervalBucket>
  subscriber_vs_nonsubscriber_ltv: {
    subscribers: LtvGroup & { count: number }
    non_subscribers: LtvGroup & { count: number }
    ltv_multiplier: number | null
  }
  product_breakdown: ProductRow[]
  adhesive_penetration: number
  adhesive_nonsubscribers: number
  calculated_at: string
}

interface Cancellation {
  customer_email: string | null
  product_title: string | null
  price: number | null
  cancelled_at: string | null
  charge_interval_frequency: number | null
  order_interval_unit: string | null
}

interface Subscription {
  customer_email: string | null
  product_title: string | null
  price: number | null
  charge_interval_frequency: number | null
  order_interval_unit: string | null
  status: string
  next_charge_scheduled_at: string | null
}

interface Props {
  connected: boolean
  metrics: Metrics | null
  recentCancellations: Cancellation[]
  topSubscriptions: Subscription[]
}

// ── Formatting helpers ─────────────────────────────────────────────────────────

function fmt(n: number, decimals = 0): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}
function fmtUsd(n: number): string {
  return '$' + fmt(n, n < 10 ? 2 : 0)
}
function fmtPct(n: number): string {
  return (n * 100).toFixed(1) + '%'
}
function intervalLabel(freq: number | null, unit: string | null): string {
  if (!freq || !unit) return '—'
  return `${freq}${unit === 'week' ? 'w' : unit === 'month' ? 'mo' : 'd'}`
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border bg-white p-5 shadow-sm ${accent ? 'border-teal/30 ring-1 ring-teal/10' : 'border-cream-3'}`}>
      <p className="text-xs font-data uppercase tracking-widest text-ink-3">{label}</p>
      <p className={`mt-1.5 font-display text-2xl font-bold ${accent ? 'text-teal-deep' : 'text-ink'}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-ink-3">{sub}</p>}
    </div>
  )
}

function NotConnected() {
  return (
    <div className="rounded-2xl border border-cream-3 bg-white p-10 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-cream-2">
        <svg className="h-7 w-7 text-ink-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      <h2 className="font-display text-lg font-semibold text-ink">Recharge not connected</h2>
      <p className="mt-2 text-sm text-ink-3">Connect your Recharge account to see subscription analytics.</p>
      <Link href="/dashboard/integrations" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-teal px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-dark transition">
        Go to Integrations →
      </Link>
    </div>
  )
}

// ── Main dashboard ─────────────────────────────────────────────────────────────

export default function SubscriptionsDashboard({ connected, metrics, recentCancellations, topSubscriptions }: Props) {
  const [aiInsight, setAiInsight] = useState('')
  const [aiLoading, setAiLoading] = useState(false)

  if (!connected) return <NotConnected />

  async function generateInsight() {
    if (aiLoading || !metrics) return
    setAiLoading(true)
    setAiInsight('')
    try {
      const res = await fetch('/api/insights/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metrics }),
      })
      const data = await res.json() as { insight?: string; error?: string }
      setAiInsight(data.insight ?? data.error ?? 'No insight generated.')
    } catch {
      setAiInsight('Error generating insight.')
    } finally {
      setAiLoading(false)
    }
  }

  const m = metrics
  const ib = m?.interval_breakdown ?? {}
  const ltv = m?.subscriber_vs_nonsubscriber_ltv
  const products = m?.product_breakdown ?? []
  const totalMrr = m?.mrr ?? 0
  const totalIntervalCount = ['3w', '4w', '6w', 'other'].reduce((s, k) => s + (ib[k]?.count ?? 0), 0)

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Subscription Program</h1>
          {m?.calculated_at && (
            <p className="mt-0.5 text-xs text-ink-3">Updated {new Date(m.calculated_at).toLocaleDateString()}</p>
          )}
        </div>
        <button
          onClick={() => { fetch('/api/recharge/sync', { method: 'POST' }).then(() => window.location.reload()) }}
          className="rounded-lg border border-cream-3 px-4 py-2 text-sm font-medium text-ink-2 hover:bg-cream-2 transition"
        >
          Sync Now
        </button>
      </div>

      {!m ? (
        <div className="rounded-2xl border border-cream-3 bg-white p-10 text-center text-sm text-ink-3">
          No data yet — run a sync to populate subscription metrics.
        </div>
      ) : (
        <>
          {/* Section 1: Health KPIs */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard label="Active Subscribers" value={fmt(m.active_subscribers)} accent />
            <KpiCard label="MRR" value={fmtUsd(m.mrr)} sub="Monthly recurring revenue" />
            <KpiCard label="ARR" value={fmtUsd(m.arr)} sub="Annualized" />
            <KpiCard
              label="Churn Rate (30d)"
              value={fmtPct(m.churn_rate_30d)}
              sub={`${fmt(m.churn_rate_30d * m.active_subscribers)} subscribers/mo at risk`}
            />
          </div>

          {/* Section 2: Interval Breakdown */}
          <div className="rounded-2xl border border-cream-3 bg-white p-6 shadow-sm">
            <h2 className="font-display text-base font-semibold text-ink mb-4">Interval Breakdown</h2>

            {/* Stacked bar */}
            <div className="mb-5 flex h-6 w-full overflow-hidden rounded-full bg-cream-2">
              {(['3w', '4w', '6w', 'other'] as const).map((key, i) => {
                const pct = totalIntervalCount > 0 ? ((ib[key]?.count ?? 0) / totalIntervalCount) * 100 : 0
                const colors = ['bg-teal', 'bg-teal/70', 'bg-teal/40', 'bg-cream-3']
                return pct > 0 ? (
                  <div key={key} className={`${colors[i]} h-full transition-all`} style={{ width: `${pct}%` }} title={`${key}: ${pct.toFixed(1)}%`} />
                ) : null
              })}
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(['3w', '4w', '6w', 'other'] as const).map((key) => {
                const bucket = ib[key]
                if (!bucket) return null
                const labels: Record<string, string> = { '3w': '3-Week', '4w': '4-Week', '6w': '6-Week', other: 'Other' }
                const colors = ['border-teal text-teal-deep', 'border-teal/60 text-teal', 'border-teal/30 text-teal/80', 'border-cream-3 text-ink-3']
                const ci = ['3w', '4w', '6w', 'other'].indexOf(key)
                return (
                  <div key={key} className={`rounded-xl border-2 ${colors[ci]} p-4`}>
                    <p className="text-xs font-data font-semibold uppercase tracking-wider">{labels[key]}</p>
                    <p className="mt-1 font-display text-xl font-bold text-ink">{fmt(bucket.count)}</p>
                    <p className="text-xs text-ink-3">{bucket.pct.toFixed(1)}% of total</p>
                    <p className="mt-1 text-xs font-medium text-ink-2">{fmtUsd(bucket.mrr)}/mo MRR</p>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Section 3: Subscriber vs Non-Subscriber LTV */}
          {ltv && (
            <div className="rounded-2xl border border-cream-3 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-base font-semibold text-ink">Subscriber LTV vs One-Time Buyers</h2>
                {ltv.ltv_multiplier && (
                  <span className="rounded-full bg-teal-pale px-3 py-1 text-xs font-semibold text-teal-deep">
                    Subscribers are {ltv.ltv_multiplier}× more valuable
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {[
                  { label: 'Subscribers', data: ltv.subscribers, accent: true },
                  { label: 'One-Time Buyers', data: ltv.non_subscribers, accent: false },
                ].map(({ label, data, accent }) => (
                  <div key={label} className={`rounded-xl p-5 ${accent ? 'bg-teal/5 border border-teal/20' : 'bg-cream border border-cream-3'}`}>
                    <p className="text-xs font-data uppercase tracking-wider text-ink-3">{label}</p>
                    <p className="text-xs text-ink-3 mb-3">{fmt(data.count)} customers</p>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-xs text-ink-2">Avg LTV</span>
                        <span className={`text-sm font-bold ${accent ? 'text-teal-deep' : 'text-ink'}`}>{fmtUsd(data.ltv)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-xs text-ink-2">Avg Orders</span>
                        <span className="text-sm font-semibold text-ink">{data.orders}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-xs text-ink-2">Avg AOV</span>
                        <span className="text-sm font-semibold text-ink">{fmtUsd(data.aov)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 4: Product Breakdown */}
          {products.length > 0 && (
            <div className="rounded-2xl border border-cream-3 bg-white p-6 shadow-sm">
              <h2 className="font-display text-base font-semibold text-ink mb-4">Product Subscription Breakdown</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-cream-2 text-left">
                      <th className="pb-2 pr-4 text-xs font-data font-medium uppercase tracking-wider text-ink-3">Product</th>
                      <th className="pb-2 pr-4 text-xs font-data font-medium uppercase tracking-wider text-ink-3 text-right">Subscribers</th>
                      <th className="pb-2 pr-4 text-xs font-data font-medium uppercase tracking-wider text-ink-3 text-right">MRR</th>
                      <th className="pb-2 pr-4 text-xs font-data font-medium uppercase tracking-wider text-ink-3 text-right">% of Total</th>
                      <th className="pb-2 text-xs font-data font-medium uppercase tracking-wider text-ink-3 text-right">Avg Interval</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cream-2">
                    {products.map((p, i) => (
                      <tr key={i} className="hover:bg-cream/50 transition">
                        <td className="py-2.5 pr-4 font-medium text-ink max-w-[200px] truncate">{p.name}</td>
                        <td className="py-2.5 pr-4 text-right text-ink-2">{fmt(p.active_subscribers)}</td>
                        <td className="py-2.5 pr-4 text-right text-ink-2">{fmtUsd(p.mrr)}</td>
                        <td className="py-2.5 pr-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <div className="h-1.5 rounded-full bg-teal" style={{ width: `${Math.max(p.pct_of_total * 0.5, 2)}px` }} />
                            <span className="text-ink-2">{p.pct_of_total.toFixed(1)}%</span>
                          </div>
                        </td>
                        <td className="py-2.5 text-right text-ink-2">
                          {p.avg_interval ? `${p.avg_interval}w` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Section 5: Churn Analysis */}
          {recentCancellations.length > 0 && (
            <div className="rounded-2xl border border-cream-3 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-base font-semibold text-ink">Recent Cancellations (30 days)</h2>
                <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">{fmt(recentCancellations.length)} cancelled</span>
              </div>
              <div className="space-y-2">
                {recentCancellations.slice(0, 10).map((c, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg bg-cream px-3 py-2 text-xs">
                    <span className="font-medium text-ink truncate max-w-[200px]">{c.customer_email ?? '—'}</span>
                    <span className="text-ink-2 mx-2">{c.product_title ?? '—'}</span>
                    <span className="shrink-0 text-ink-3">{intervalLabel(c.charge_interval_frequency, c.order_interval_unit)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 6: Adhesive Conversion Opportunity */}
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 shrink-0 h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center">
                <svg className="h-4 w-4 text-amber-700" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm-1-8a1 1 0 0 0-1 1v3a1 1 0 0 0 2 0V6a1 1 0 0 0-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="font-display font-semibold text-amber-900">Adhesive Subscription Opportunity</h3>
                <p className="mt-1 text-sm text-amber-800">
                  <strong>{fmt(m.adhesive_nonsubscribers)}</strong> customers buy adhesive regularly but are <strong>not on subscription</strong>.
                  Subscription penetration is currently <strong>{fmtPct(m.adhesive_penetration)}</strong>.
                </p>
                <p className="mt-2 text-sm text-amber-700">
                  Estimated MRR if 20% converted at avg {fmtUsd(m.avg_subscription_value)}/mo:{' '}
                  <strong className="text-amber-900">{fmtUsd(m.adhesive_nonsubscribers * 0.2 * m.avg_subscription_value)}/mo</strong>
                </p>
                <Link
                  href="/dashboard/customers?segment=adhesive_nonsubscriber"
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-700 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-800 transition"
                >
                  See these customers →
                </Link>
              </div>
            </div>
          </div>

          {/* Section 7: AI Insights */}
          <div className="rounded-2xl border border-cream-3 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-display text-base font-semibold text-ink">AI Analysis</h2>
                <p className="mt-0.5 text-xs text-ink-3">Subscription health, retention, and MRR growth opportunities</p>
              </div>
              <button
                onClick={generateInsight}
                disabled={aiLoading}
                className="flex items-center gap-2 rounded-lg bg-charcoal px-4 py-2 text-sm font-semibold text-cream hover:bg-charcoal/80 disabled:opacity-50 transition"
              >
                {aiLoading ? (
                  <><span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-cream/40 border-t-cream" />Analyzing…</>
                ) : (
                  <>Generate Insights</>
                )}
              </button>
            </div>
            {aiInsight ? (
              <div className="rounded-xl bg-cream p-4 text-sm text-ink leading-relaxed whitespace-pre-wrap">{aiInsight}</div>
            ) : (
              <div className="rounded-xl bg-cream p-4 text-sm text-ink-3">
                Click "Generate Insights" to analyze your subscription program health, retention trends, and MRR opportunities.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
