'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Campaign {
  id: string
  name: string
  subject: string | null
  status: string
  send_time: string | null
  recipient_count: number
  open_rate: number | null
  click_rate: number | null
  revenue_attributed: number
  unsubscribe_count: number
  created_at: string | null
}

interface Flow {
  id: string
  name: string
  status: string
  trigger_type: string | null
  recipient_count: number
  open_rate: number | null
  click_rate: number | null
  conversion_rate: number | null
  revenue_attributed: number
  created_at: string | null
}

interface MetricEntry {
  value: number
  metadata: Record<string, unknown>
}

interface Props {
  connected: boolean
  campaigns: Campaign[]
  flows: Flow[]
  metrics: Record<string, MetricEntry>
}

interface Insight {
  type: 'Opportunity' | 'Risk' | 'Win'
  title: string
  description: string
  action: string
}

// ── Formatters ────────────────────────────────────────────────────────────────

function usd(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n)
}

function pct(n: number | null) {
  if (n == null) return '—'
  return `${(n * 100).toFixed(1)}%`
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(d))
}

// ── Metric card ───────────────────────────────────────────────────────────────

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-cream-3 bg-white px-5 py-5 shadow-sm">
      <p className="font-data text-xs uppercase tracking-wider text-ink-3">{label}</p>
      <p className="mt-2 font-display text-3xl font-semibold text-ink">{value}</p>
      {sub && <p className="mt-1 text-xs text-ink-3">{sub}</p>}
    </div>
  )
}

// ── ROI score badge ───────────────────────────────────────────────────────────

function ROIBadge({ roi }: { roi: number }) {
  if (roi > 0.2) return <span className="rounded-full bg-teal-pale px-2 py-0.5 text-xs font-semibold text-teal-deep">Good</span>
  if (roi > 0) return <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">Marginal</span>
  return <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">Negative</span>
}

// ── Campaign detail panel ─────────────────────────────────────────────────────

function CampaignPanel({ campaign, onClose }: { campaign: Campaign; onClose: () => void }) {
  const estCost = campaign.recipient_count * 0.002
  const roi = estCost > 0 ? (campaign.revenue_attributed - estCost) / estCost : 0

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-charcoal/40 backdrop-blur-sm" onClick={onClose} />
      <aside className="relative z-50 w-full max-w-md bg-white shadow-2xl overflow-y-auto animate-slide-in-right">
        <div className="flex items-start justify-between border-b border-cream-2 px-6 py-5">
          <div className="pr-4">
            <h3 className="font-display text-lg font-semibold text-ink leading-snug">{campaign.name}</h3>
            {campaign.subject && <p className="mt-1 text-sm text-ink-3 italic">"{campaign.subject}"</p>}
          </div>
          <button onClick={onClose} className="shrink-0 rounded-lg p-1.5 hover:bg-cream-2 transition text-ink-3">
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 0 1 1.414 0L10 8.586l4.293-4.293a1 1 0 1 1 1.414 1.414L11.414 10l4.293 4.293a1 1 0 0 1-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 0 1-1.414-1.414L8.586 10 4.293 5.707a1 1 0 0 1 0-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Revenue', value: usd(campaign.revenue_attributed) },
              { label: 'Recipients', value: campaign.recipient_count.toLocaleString() },
              { label: 'Open Rate', value: pct(campaign.open_rate) },
              { label: 'Click Rate', value: pct(campaign.click_rate) },
              { label: 'Unsubscribes', value: campaign.unsubscribe_count.toLocaleString() },
              { label: 'Send Date', value: fmtDate(campaign.send_time) },
            ].map((s) => (
              <div key={s.label} className="rounded-xl bg-cream px-4 py-3">
                <p className="font-data text-xs text-ink-3 mb-1">{s.label}</p>
                <p className="font-display text-xl font-semibold text-ink">{s.value}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-cream-3 px-4 py-3 space-y-2">
            <p className="font-data text-xs uppercase tracking-wider text-ink-3">ROI Estimate</p>
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink-2">Est. send cost</span>
              <span className="font-data text-sm text-ink">{usd(estCost)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink-2">Attributed revenue</span>
              <span className="font-data text-sm text-ink">{usd(campaign.revenue_attributed)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-cream-2 pt-2">
              <span className="text-sm font-semibold text-ink">Net ROI</span>
              <span className={`font-data text-sm font-semibold ${roi >= 0 ? 'text-teal-deep' : 'text-red-500'}`}>
                {roi >= 0 ? '+' : ''}{usd(campaign.revenue_attributed - estCost)}
              </span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  )
}

// ── Insight card ──────────────────────────────────────────────────────────────

function InsightCard({ insight }: { insight: Insight }) {
  const colors = {
    Opportunity: { border: 'border-teal', badge: 'bg-teal-pale text-teal-deep' },
    Risk: { border: 'border-red-400', badge: 'bg-red-50 text-red-700' },
    Win: { border: 'border-amber-400', badge: 'bg-amber-50 text-amber-700' },
  }
  const c = colors[insight.type]

  return (
    <div className={`rounded-xl border-l-4 ${c.border} bg-white px-5 py-4 shadow-sm border border-cream-3`}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <h4 className="font-display text-base font-semibold text-ink leading-tight">{insight.title}</h4>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${c.badge}`}>{insight.type}</span>
      </div>
      <p className="text-sm text-ink-2 leading-relaxed mb-3">{insight.description}</p>
      <div className="flex items-start gap-2">
        <svg className="h-4 w-4 text-teal shrink-0 mt-0.5" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm.75 4.25a.75.75 0 0 0-1.5 0v3.5l2 2a.75.75 0 0 0 1.06-1.06L8.75 8.19V5.25z" />
        </svg>
        <p className="text-xs text-ink-3 leading-relaxed">{insight.action}</p>
      </div>
    </div>
  )
}

// ── Not connected state ───────────────────────────────────────────────────────

function NotConnected() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="mb-4 h-14 w-14 rounded-2xl bg-[#FF6200]/10 flex items-center justify-center">
        <span className="text-xl font-bold text-[#FF6200]">K</span>
      </div>
      <h2 className="font-display text-2xl font-semibold text-ink mb-2">Connect Klaviyo</h2>
      <p className="text-sm text-ink-3 max-w-sm leading-relaxed mb-6">
        Connect your Klaviyo account to unlock campaign ROI analysis, flow performance tracking, and AI-powered email insights.
      </p>
      <Link
        href="/dashboard/integrations"
        className="inline-flex items-center rounded-lg bg-[#FF6200] px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 transition"
      >
        Connect in Integrations →
      </Link>
    </div>
  )
}

// ── Main dashboard component ──────────────────────────────────────────────────

export default function KlaviyoDashboard({ connected, campaigns, flows, metrics }: Props) {
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null)
  const [insights, setInsights] = useState<Insight[]>([])
  const [insightsState, setInsightsState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [syncing, setSyncing] = useState(false)

  const noData = campaigns.length === 0 && flows.length === 0

  useEffect(() => {
    if (connected && !noData && insightsState === 'idle') {
      loadInsights()
    }
  }, [connected, noData])

  async function loadInsights() {
    setInsightsState('loading')
    try {
      const res = await fetch('/api/klaviyo/insights')
      const data = await res.json()
      setInsights(data.insights ?? [])
      setInsightsState('done')
    } catch {
      setInsightsState('error')
    }
  }

  async function handleSync() {
    setSyncing(true)
    try {
      await fetch('/api/klaviyo/sync', { method: 'POST' })
      window.location.reload()
    } finally {
      setSyncing(false)
    }
  }

  if (!connected) return <NotConnected />

  // Aggregate stats
  const m = (key: string) => metrics[key]?.value ?? 0
  const totalEmailRevenue = m('email_revenue_total') || (m('total_campaign_revenue') + m('total_flow_revenue'))
  const emailVsTotal = m('email_revenue_vs_total')
  const avgOpenRate = m('avg_campaign_open_rate')
  const avgClickRate = m('avg_campaign_click_rate')
  const estUnsubCost = m('estimated_unsubscribe_cost')

  // Broadcast vs Flow comparison
  const broadcastRevenue = m('total_campaign_revenue')
  const flowRevenue = m('total_flow_revenue')
  const totalCampaignRecip = campaigns.reduce((s, c) => s + c.recipient_count, 0)
  const totalFlowRecip = flows.reduce((s, f) => s + f.recipient_count, 0)
  const broadcastRPR = totalCampaignRecip > 0 ? broadcastRevenue / totalCampaignRecip : 0
  const flowRPR = totalFlowRecip > 0 ? flowRevenue / totalFlowRecip : 0

  return (
    <div className="space-y-6">
      {/* Header actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded bg-[#FF6200] flex items-center justify-center">
            <span className="text-xs font-bold text-white">K</span>
          </div>
          <span className="font-data text-xs text-ink-3">Klaviyo · Email Intelligence</span>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-1.5 rounded-lg border border-cream-3 bg-white px-3 py-1.5 text-xs font-medium text-ink-2 shadow-sm hover:bg-cream disabled:opacity-50 transition"
        >
          {syncing ? (
            <><span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-cream-3 border-t-teal" />Syncing…</>
          ) : (
            <><svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M13.5 2.5A6.5 6.5 0 1 1 7 1M13.5 2.5V6M13.5 2.5H10" strokeLinecap="round" strokeLinejoin="round" /></svg>Sync Klaviyo</>
          )}
        </button>
      </div>

      {/* Empty state if no data yet */}
      {noData && (
        <div className="rounded-2xl border border-cream-3 bg-white px-6 py-12 text-center shadow-sm">
          <p className="text-sm text-ink-3 mb-3">No Klaviyo data synced yet.</p>
          <button onClick={handleSync} className="inline-flex items-center rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-dark transition">
            Run first sync
          </button>
        </div>
      )}

      {!noData && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Total Email Revenue"
              value={usd(totalEmailRevenue)}
              sub="campaigns + flows"
            />
            <MetricCard
              label="Avg Open Rate"
              value={pct(avgOpenRate)}
              sub="across all campaigns"
            />
            <MetricCard
              label="Avg Click Rate"
              value={pct(avgClickRate)}
              sub="across all campaigns"
            />
            <MetricCard
              label="Est. Unsubscribe Cost"
              value={usd(estUnsubCost)}
              sub={`unsubs × avg LTV`}
            />
          </div>

          {/* Campaign ROI table */}
          <section className="rounded-2xl border border-cream-3 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between border-b border-cream-2 px-5 py-3.5">
              <h2 className="font-display text-sm font-semibold text-ink">Campaign ROI</h2>
              <span className="font-data text-xs text-ink-3">{campaigns.length} campaigns · click for details</span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-cream-2 text-xs font-medium text-ink-3">
                    <th className="px-5 py-2.5 text-left">Campaign</th>
                    <th className="px-5 py-2.5 text-left">Date</th>
                    <th className="px-5 py-2.5 text-right">Recipients</th>
                    <th className="px-5 py-2.5 text-right">Open</th>
                    <th className="px-5 py-2.5 text-right">Click</th>
                    <th className="px-5 py-2.5 text-right">Revenue</th>
                    <th className="px-5 py-2.5 text-right">Est. Cost</th>
                    <th className="px-5 py-2.5 text-right">Net ROI</th>
                    <th className="px-5 py-2.5 text-center">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cream-2">
                  {campaigns.map((c) => {
                    const estCost = c.recipient_count * 0.002
                    const netROI = c.revenue_attributed - estCost
                    const roiRatio = estCost > 0 ? netROI / estCost : 0
                    return (
                      <tr
                        key={c.id}
                        className="hover:bg-cream transition-colors cursor-pointer"
                        onClick={() => setSelectedCampaign(c)}
                      >
                        <td className="px-5 py-3 max-w-[180px]">
                          <p className="font-medium text-ink truncate">{c.name}</p>
                          {c.subject && <p className="text-xs text-ink-3 truncate italic">{c.subject}</p>}
                        </td>
                        <td className="px-5 py-3 font-data text-xs text-ink-2 whitespace-nowrap">{fmtDate(c.send_time)}</td>
                        <td className="px-5 py-3 font-data text-xs text-right text-ink-2">{c.recipient_count.toLocaleString()}</td>
                        <td className="px-5 py-3 font-data text-xs text-right text-ink-2">{pct(c.open_rate)}</td>
                        <td className="px-5 py-3 font-data text-xs text-right text-ink-2">{pct(c.click_rate)}</td>
                        <td className="px-5 py-3 font-data text-xs text-right font-medium text-ink">{usd(c.revenue_attributed)}</td>
                        <td className="px-5 py-3 font-data text-xs text-right text-ink-3">{usd(estCost)}</td>
                        <td className={`px-5 py-3 font-data text-xs text-right font-semibold ${netROI >= 0 ? 'text-teal-deep' : 'text-red-500'}`}>
                          {netROI >= 0 ? '+' : ''}{usd(netROI)}
                        </td>
                        <td className="px-5 py-3 text-center">
                          <ROIBadge roi={roiRatio} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Flow performance table */}
          <section className="rounded-2xl border border-cream-3 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between border-b border-cream-2 px-5 py-3.5">
              <h2 className="font-display text-sm font-semibold text-ink">Automated Flows</h2>
              <span className="font-data text-xs text-ink-3">{flows.length} flows</span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-cream-2 text-xs font-medium text-ink-3">
                    <th className="px-5 py-2.5 text-left">Flow Name</th>
                    <th className="px-5 py-2.5 text-left">Trigger</th>
                    <th className="px-5 py-2.5 text-right">Recipients</th>
                    <th className="px-5 py-2.5 text-right">Open Rate</th>
                    <th className="px-5 py-2.5 text-right">Click Rate</th>
                    <th className="px-5 py-2.5 text-right">Conversion</th>
                    <th className="px-5 py-2.5 text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cream-2">
                  {flows.map((f) => {
                    const highConversion = (f.conversion_rate ?? 0) > 0.05
                    return (
                      <tr key={f.id} className={`transition-colors ${highConversion ? 'bg-teal-pale/30 hover:bg-teal-pale/50' : 'hover:bg-cream'}`}>
                        <td className="px-5 py-3 font-medium text-ink">{f.name}</td>
                        <td className="px-5 py-3 text-xs text-ink-3 capitalize">{f.trigger_type?.replace(/_/g, ' ') ?? '—'}</td>
                        <td className="px-5 py-3 font-data text-xs text-right text-ink-2">{f.recipient_count.toLocaleString()}</td>
                        <td className="px-5 py-3 font-data text-xs text-right text-ink-2">{pct(f.open_rate)}</td>
                        <td className="px-5 py-3 font-data text-xs text-right text-ink-2">{pct(f.click_rate)}</td>
                        <td className={`px-5 py-3 font-data text-xs text-right font-semibold ${highConversion ? 'text-teal-deep' : 'text-ink-2'}`}>
                          {pct(f.conversion_rate)}
                        </td>
                        <td className="px-5 py-3 font-data text-xs text-right font-medium text-ink">{usd(f.revenue_attributed)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Broadcast vs Automated comparison */}
          <section className="rounded-2xl border border-cream-3 bg-white p-6 shadow-sm">
            <h2 className="font-display text-base font-semibold text-ink mb-4">Broadcast vs Automated</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {[
                { label: 'Broadcast Campaigns', revenue: broadcastRevenue, rpr: broadcastRPR, count: campaigns.length, color: 'bg-teal' },
                { label: 'Automated Flows', revenue: flowRevenue, rpr: flowRPR, count: flows.length, color: 'bg-charcoal-700' },
              ].map((s) => (
                <div key={s.label} className="rounded-xl bg-cream px-5 py-4">
                  <p className="text-xs font-medium text-ink-2 mb-3">{s.label}</p>
                  <p className="font-display text-2xl font-semibold text-ink mb-1">{usd(s.revenue)}</p>
                  <p className="font-data text-xs text-ink-3 mb-3">{usd(s.rpr)} per recipient · {s.count} total</p>
                  {/* Visual bar */}
                  <div className="h-2 rounded-full bg-cream-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${s.color} transition-all duration-700`}
                      style={{ width: `${Math.min(100, (s.revenue / Math.max(broadcastRevenue, flowRevenue, 1)) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-ink-3 leading-relaxed">
              {flowRPR > broadcastRPR
                ? `Automated flows generate ${((flowRPR / broadcastRPR - 1) * 100).toFixed(0)}× more revenue per recipient than broadcast campaigns — consider investing in additional flow sequences.`
                : broadcastRPR > flowRPR
                ? `Broadcast campaigns outperform flows by revenue per recipient. Your list is highly engaged with promotional sends.`
                : `Comparable performance between broadcast and automated — a balanced email strategy.`}
            </p>
          </section>

          {/* AI Insights */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-base font-semibold text-ink">Key Insights</h2>
              {insightsState === 'done' && (
                <button onClick={loadInsights} className="text-xs text-teal hover:text-teal-dark font-medium transition">
                  Regenerate
                </button>
              )}
            </div>

            {insightsState === 'loading' && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="rounded-xl border border-cream-3 bg-white p-5 shadow-sm">
                    <div className="skeleton h-3 w-1/3 mb-3" />
                    <div className="skeleton h-4 w-2/3 mb-4" />
                    <div className="skeleton h-3 w-full mb-2" />
                    <div className="skeleton h-3 w-4/5" />
                  </div>
                ))}
              </div>
            )}

            {insightsState === 'done' && insights.length > 0 && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {insights.map((insight, i) => (
                  <InsightCard key={i} insight={insight} />
                ))}
              </div>
            )}

            {insightsState === 'idle' && (
              <div className="rounded-xl border border-cream-3 bg-white px-5 py-8 text-center shadow-sm">
                <button onClick={loadInsights} className="rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-dark transition">
                  Generate AI Insights
                </button>
                <p className="mt-2 text-xs text-ink-3">Powered by Claude Haiku</p>
              </div>
            )}

            {insightsState === 'error' && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
                Failed to generate insights. Check your ANTHROPIC_API_KEY is set.
              </div>
            )}
          </section>
        </>
      )}

      {selectedCampaign && (
        <CampaignPanel campaign={selectedCampaign} onClose={() => setSelectedCampaign(null)} />
      )}
    </div>
  )
}
