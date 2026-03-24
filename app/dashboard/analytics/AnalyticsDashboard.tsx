'use client'

import { useState } from 'react'
import Link from 'next/link'

interface SessionRow { channel: string; sessions: number; conversions: number; revenue: number }
interface PageRow { page_path: string; sessions: number; conversions: number; avg_time_seconds: number | null }
interface MonthlyRow { month: string; sessions: number }
interface CampaignRow { campaign_name: string; source: string | null; sessions: number; conversions: number; revenue: number }
interface AnalyticsInsight { title: string; description: string; metric: string; action: string; priority: 'Low' | 'Medium' | 'High' }

interface Props {
  connected: boolean
  propertyId: string | null
  sessions: SessionRow[]
  pages: PageRow[]
  monthly: MonthlyRow[]
  adCampaigns: CampaignRow[]
  metrics: Record<string, number>
}

const CHANNEL_COLORS: Record<string, string> = {
  'Organic Search':   '#4BBFAD',
  'Paid Search':      '#4285F4',
  'Email':            '#F97316',
  'Organic Social':   '#A855F7',
  'Paid Social':      '#1877F2',
  'Direct':           '#64748B',
  'Referral':         '#10B981',
  'Organic Video':    '#EF4444',
  'Unassigned':       '#94A3B8',
}

function fmt(n: number, currency = true) {
  if (currency) return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(n)
}

function fmtTime(seconds: number) {
  if (seconds < 60) return `${Math.round(seconds)}s`
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-cream-3 bg-white px-5 py-5 shadow-sm">
      <p className="font-data text-xs uppercase tracking-wider text-ink-3">{label}</p>
      <p className="mt-2 font-display text-3xl font-semibold text-ink">{value}</p>
      {sub && <p className="mt-1 text-xs text-ink-3">{sub}</p>}
    </div>
  )
}

function ConnectPrompt() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="mb-4 h-12 w-12 rounded-xl bg-[#E37400] flex items-center justify-center">
        <svg className="h-7 w-7 text-white" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12.545 10.239v3.821h5.445c-.712 2.315-2.647 3.972-5.445 3.972a6.033 6.033 0 1 1 0-12.064 5.976 5.976 0 0 1 4.111 1.606l2.879-2.878A9.969 9.969 0 0 0 12.545 2C7.021 2 2.543 6.477 2.543 12s4.478 10 10.002 10c8.396 0 10.249-7.85 9.426-11.748l-9.426-.013z"/>
        </svg>
      </div>
      <h2 className="font-display text-lg font-semibold text-ink">Connect Google Analytics 4</h2>
      <p className="mt-2 max-w-sm text-sm text-ink-3">
        Link your GA4 property to track sessions by channel, landing page performance, monthly trends, and ecommerce conversion rates.
      </p>
      <Link href="/dashboard/integrations" className="mt-5 inline-flex items-center rounded-lg bg-[#E37400] px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 transition">
        Connect in Integrations →
      </Link>
    </div>
  )
}

function ChannelBars({ sessions }: { sessions: SessionRow[] }) {
  const total = sessions.reduce((s, r) => s + r.sessions, 0)
  if (total === 0) return <p className="text-sm text-ink-3 mt-4">No session data — run a sync first.</p>

  return (
    <div className="mt-4 space-y-2.5">
      {sessions.map((row) => {
        const pct = total > 0 ? (row.sessions / total) * 100 : 0
        const color = CHANNEL_COLORS[row.channel] ?? '#94A3B8'
        const cvr = row.sessions > 0 ? ((row.conversions / row.sessions) * 100).toFixed(1) : '0.0'
        return (
          <div key={row.channel} className="flex items-center gap-3">
            <div className="w-32 shrink-0 text-xs text-ink-2 truncate">{row.channel}</div>
            <div className="flex-1 h-4 bg-cream-2 rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
            </div>
            <div className="w-16 shrink-0 text-right font-data text-xs text-ink">{row.sessions.toLocaleString()}</div>
            <div className="w-16 shrink-0 text-right font-data text-xs text-ink-3">{cvr}% cvr</div>
          </div>
        )
      })}
    </div>
  )
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function MonthlyChart({ monthly }: { monthly: MonthlyRow[] }) {
  if (monthly.length === 0) return <p className="text-sm text-ink-3 mt-4">No monthly data yet.</p>

  const max = Math.max(...monthly.map((m) => m.sessions), 1)

  return (
    <div className="mt-4">
      {/* Bar area — each column is h-full so bar % is relative to the 96px container */}
      <div className="flex items-end gap-1 h-24">
        {monthly.map((m) => {
          const pct = Math.max((m.sessions / max) * 100, 2)
          return (
            <div key={m.month} className="flex-1 h-full flex items-end group relative">
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block text-[10px] font-data bg-charcoal text-cream px-1.5 py-0.5 rounded whitespace-nowrap z-10">
                {m.sessions.toLocaleString()}
              </div>
              <div
                className="w-full rounded-t-sm bg-teal/70 hover:bg-teal transition-colors"
                style={{ height: `${pct}%` }}
              />
            </div>
          )
        })}
      </div>
      {/* Label row — separate from bars so bar heights work correctly */}
      <div className="flex gap-1 mt-1.5">
        {monthly.map((m) => {
          const [year, mon] = m.month.split('-')
          const label = `${MONTH_LABELS[parseInt(mon, 10) - 1]} '${year.slice(2)}`
          return (
            <div key={m.month} className="flex-1 text-center overflow-hidden">
              <span className="text-[8px] text-ink-3 leading-none">{label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ChannelEfficiency({ sessions }: { sessions: SessionRow[] }) {
  const sorted = sessions
    .filter((r) => r.sessions >= 10)
    .map((r) => ({ ...r, cvr: r.sessions > 0 ? (r.conversions / r.sessions) * 100 : 0 }))
    .sort((a, b) => b.cvr - a.cvr)

  if (sorted.length === 0) return null

  function cvrBg(cvr: number) {
    if (cvr >= 3) return 'bg-teal-pale/40'
    if (cvr >= 1) return 'bg-amber-50'
    return 'bg-red-50'
  }
  function cvrBadge(cvr: number) {
    if (cvr >= 3) return 'bg-teal-pale text-teal-deep'
    if (cvr >= 1) return 'bg-amber-50 text-amber-700 border border-amber-200'
    return 'bg-red-50 text-red-600 border border-red-200'
  }

  const paidSocial = sorted.find((r) => r.channel === 'Paid Social')
  const paidSearch = sorted.find((r) => r.channel === 'Paid Search')
  const showGap = paidSocial && paidSocial.cvr < 1

  return (
    <section className="rounded-2xl border border-cream-3 bg-white p-6 shadow-sm">
      <h2 className="font-display text-base font-semibold text-ink">Channel Efficiency</h2>
      <p className="text-xs text-ink-3 mt-0.5">Conversion rate ranked — green ≥3%, amber 1–3%, red &lt;1%</p>

      <div className="mt-4 space-y-2">
        {sorted.map((row) => {
          const isPaidSocial = row.channel === 'Paid Social'
          return (
            <div
              key={row.channel}
              className={`flex items-center gap-4 rounded-xl px-4 py-3 ${cvrBg(row.cvr)} ${isPaidSocial && row.cvr < 1 ? 'ring-1 ring-red-300' : ''}`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-ink">{row.channel}</span>
                  {isPaidSocial && row.cvr < 1 && (
                    <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">
                      Low CVR ⚠
                    </span>
                  )}
                </div>
                <p className="text-xs text-ink-3 mt-0.5">
                  {row.sessions.toLocaleString()} sessions · {row.conversions} conversions
                </p>
              </div>
              <div className="text-right shrink-0">
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-semibold ${cvrBadge(row.cvr)}`}>
                  {row.cvr.toFixed(1)}%
                </span>
                <p className="text-[10px] text-ink-3 mt-0.5">CVR</p>
              </div>
            </div>
          )
        })}
      </div>

      {showGap && (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <svg className="mt-0.5 h-4 w-4 shrink-0 text-red-500" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 5zm0 7a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/>
          </svg>
          <div>
            <p className="text-sm font-medium text-red-800">Paid Social CVR is significantly below other paid channels</p>
            <p className="text-xs text-red-600 mt-0.5">
              {paidSearch
                ? `Paid Search converts at ${paidSearch.cvr.toFixed(1)}% vs Paid Social at ${paidSocial.cvr.toFixed(1)}% — a ${(paidSearch.cvr / Math.max(paidSocial.cvr, 0.01)).toFixed(0)}× gap. Consider shifting budget toward Paid Search or auditing Paid Social landing pages and audience targeting.`
                : 'Consider auditing Paid Social landing pages and audience targeting to improve conversion quality.'}
            </p>
          </div>
        </div>
      )}
    </section>
  )
}

function AnalyticsInsights() {
  const [insights, setInsights] = useState<AnalyticsInsight[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [generated, setGenerated] = useState(false)

  async function generate() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/analytics/insights', { method: 'POST' })
      const data = await res.json() as { insights?: AnalyticsInsight[]; error?: string }
      if (data.error) {
        setError(data.error)
      } else {
        setInsights(data.insights ?? [])
        setGenerated(true)
      }
    } catch {
      setError('Network error — try again')
    } finally {
      setLoading(false)
    }
  }

  function priorityStyle(p: string) {
    if (p === 'High') return 'bg-red-50 text-red-700 border border-red-200'
    if (p === 'Medium') return 'bg-amber-50 text-amber-700 border border-amber-200'
    return 'bg-cream-2 text-ink-3 border border-cream-3'
  }

  return (
    <section className="rounded-2xl border border-cream-3 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-display text-base font-semibold text-ink">AI Analytics Insights</h2>
          <p className="text-xs text-ink-3 mt-0.5">Cross-channel analysis powered by Claude</p>
        </div>
        <button
          onClick={generate}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg bg-charcoal px-4 py-2 text-sm font-semibold text-cream hover:bg-charcoal/80 disabled:opacity-50 transition"
        >
          {loading ? (
            <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-cream/30 border-t-cream" />
          ) : (
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 1a1 1 0 0 1 .894.553l1.618 3.279 3.617.526a1 1 0 0 1 .554 1.706L12.06 9.54l.618 3.604a1 1 0 0 1-1.451 1.054L8 12.422l-3.227 1.776A1 1 0 0 1 3.322 13.144l.618-3.604L1.317 7.064A1 1 0 0 1 1.871 5.358l3.617-.526L7.106 1.553A1 1 0 0 1 8 1z"/>
            </svg>
          )}
          {loading ? 'Analyzing…' : generated ? 'Regenerate' : 'Generate Insights'}
        </button>
      </div>

      {!generated && !loading && (
        <p className="mt-4 text-sm text-ink-3">
          Analyzes channel CVR gaps, session trends, landing page conversion patterns, and cross-platform budget allocation opportunities.
        </p>
      )}

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {insights.length > 0 && (
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {insights.map((ins, i) => (
            <div key={i} className="rounded-xl border border-cream-3 bg-cream p-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <h3 className="font-display text-sm font-semibold text-ink leading-snug">{ins.title}</h3>
                <span className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${priorityStyle(ins.priority)}`}>
                  {ins.priority}
                </span>
              </div>
              <p className="font-data text-[10px] uppercase tracking-wider text-ink-3 mb-1.5">{ins.metric}</p>
              <p className="text-xs text-ink-2 leading-relaxed mb-3">{ins.description}</p>
              <div className="flex items-start gap-1.5 border-t border-cream-2 pt-3">
                <svg className="mt-0.5 h-3 w-3 shrink-0 text-teal" viewBox="0 0 12 12" fill="currentColor">
                  <path d="M10.28 2.28L4 8.56 1.72 6.28a1 1 0 0 0-1.44 1.44l3 3a1 1 0 0 0 1.44 0l7-7a1 1 0 0 0-1.44-1.44z"/>
                </svg>
                <p className="text-xs text-ink font-medium">{ins.action}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export default function AnalyticsDashboard({
  connected,
  propertyId,
  sessions,
  pages,
  monthly,
  adCampaigns,
  metrics,
}: Props) {
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  if (!connected) return <ConnectPrompt />

  const m = (k: string) => metrics[k] ?? 0

  const totalSessions = sessions.reduce((s, r) => s + r.sessions, 0)
  const topChannel = sessions[0]?.channel ?? '—'

  const last2 = monthly.slice(-2)
  const momPct = last2.length === 2 && last2[0].sessions > 0
    ? ((last2[1].sessions - last2[0].sessions) / last2[0].sessions) * 100
    : null

  async function handleSync() {
    setSyncing(true)
    setSyncMsg('')
    try {
      const res = await fetch('/api/analytics/sync', { method: 'POST' })
      const data = await res.json() as { channels?: number; error?: string }
      setSyncMsg(data.error ? `Error: ${data.error}` : `Synced — ${data.channels ?? 0} channels updated`)
      if (!data.error) window.location.reload()
    } catch {
      setSyncMsg('Network error — try again')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Analytics</h1>
          <p className="text-sm text-ink-3 mt-0.5">
            Google Analytics 4 · Property {propertyId} · Last 90 days
          </p>
        </div>
        <button onClick={handleSync} disabled={syncing} className="inline-flex items-center gap-2 rounded-lg border border-cream-3 bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-cream disabled:opacity-50 transition">
          {syncing ? <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-cream-3 border-t-teal" /> : (
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M14 8A6 6 0 1 1 8 2" strokeLinecap="round"/>
              <path d="M14 2v4h-4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
          {syncing ? 'Syncing…' : 'Sync Now'}
        </button>
      </div>
      {syncMsg && <p className="text-sm text-ink-2">{syncMsg}</p>}

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <MetricCard
          label="Sessions (90d)"
          value={totalSessions.toLocaleString()}
          sub={momPct != null ? `${momPct >= 0 ? '+' : ''}${momPct.toFixed(1)}% vs prior month` : undefined}
        />
        <MetricCard
          label="Transactions"
          value={m('ga4_transactions_90d').toLocaleString()}
          sub="ecommerce purchases"
        />
        <MetricCard
          label="Revenue (GA4)"
          value={fmt(m('ga4_revenue_90d'))}
          sub="purchase revenue"
        />
        <MetricCard
          label="Conversion Rate"
          value={`${m('ga4_conversion_rate_90d').toFixed(2)}%`}
          sub="sessions → purchase"
        />
        <MetricCard
          label="Avg Order Value"
          value={m('ga4_aov_90d') > 0 ? fmt(m('ga4_aov_90d')) : '—'}
          sub="from GA4"
        />
      </div>

      {/* Channel breakdown + Monthly trend */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-cream-3 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-semibold text-ink">Sessions by Channel</h2>
              <p className="text-xs text-ink-3 mt-0.5">Top channel: <strong>{topChannel}</strong></p>
            </div>
            <span className="font-data text-xs text-ink-3">{totalSessions.toLocaleString()} total</span>
          </div>
          <ChannelBars sessions={sessions} />
        </section>

        <section className="rounded-2xl border border-cream-3 bg-white p-6 shadow-sm">
          <h2 className="font-display text-base font-semibold text-ink">Monthly Sessions Trend</h2>
          <p className="text-xs text-ink-3 mt-0.5">Last 12 months</p>
          <MonthlyChart monthly={monthly} />
        </section>
      </div>

      {/* Channel Efficiency */}
      <ChannelEfficiency sessions={sessions} />

      {/* AI Insights */}
      <AnalyticsInsights />

      {/* Top landing pages */}
      <section className="rounded-2xl border border-cream-3 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-cream-2 px-5 py-3.5">
          <h2 className="font-display text-sm font-semibold text-ink">Top Landing Pages</h2>
          <p className="text-xs text-ink-3 mt-0.5">Last 90 days — by sessions</p>
        </div>
        {pages.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-ink-3">No page data — run a sync first.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-cream-2 text-xs font-medium text-ink-3 bg-cream">
                  <th className="px-5 py-2.5 text-left">Page</th>
                  <th className="px-4 py-2.5 text-right">Sessions</th>
                  <th className="px-4 py-2.5 text-right">Conversions</th>
                  <th className="px-4 py-2.5 text-right">CVR</th>
                  <th className="px-4 py-2.5 text-right">Avg Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-2">
                {pages.map((p) => {
                  const cvr = p.sessions > 0 ? ((p.conversions / p.sessions) * 100).toFixed(1) : '0.0'
                  return (
                    <tr key={p.page_path} className="hover:bg-cream transition-colors">
                      <td className="px-5 py-2.5 max-w-xs">
                        <p className="text-xs font-medium text-ink truncate" title={p.page_path}>{p.page_path}</p>
                      </td>
                      <td className="px-4 py-2.5 text-right font-data text-xs">{p.sessions.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right font-data text-xs">{p.conversions}</td>
                      <td className="px-4 py-2.5 text-right font-data text-xs">
                        <span className={p.conversions > 0 ? 'text-teal-deep font-medium' : 'text-ink-3'}>{cvr}%</span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-data text-xs text-ink-3">
                        {p.avg_time_seconds ? fmtTime(p.avg_time_seconds) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Google Ads campaigns from GA4 */}
      {adCampaigns.length > 0 && (
        <section className="rounded-2xl border border-cream-3 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-cream-2 px-5 py-3.5 flex items-center justify-between">
            <div>
              <h2 className="font-display text-sm font-semibold text-ink">Google Ads Campaigns</h2>
              <p className="text-xs text-ink-3 mt-0.5">Sourced from GA4 — sessions and revenue attributed in Analytics</p>
            </div>
            <Link href="/dashboard/google-ads" className="text-xs text-teal hover:text-teal-dark font-medium transition">
              Full report →
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-cream-2 text-xs font-medium text-ink-3 bg-cream">
                  <th className="px-5 py-2.5 text-left">Campaign</th>
                  <th className="px-4 py-2.5 text-right">Sessions</th>
                  <th className="px-4 py-2.5 text-right">Conversions</th>
                  <th className="px-4 py-2.5 text-right">Revenue</th>
                  <th className="px-4 py-2.5 text-right">Rev / Conversion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-2">
                {adCampaigns.map((c) => (
                  <tr key={c.campaign_name} className="hover:bg-cream transition-colors">
                    <td className="px-5 py-2.5 max-w-xs">
                      <p className="text-xs font-medium text-ink truncate" title={c.campaign_name}>{c.campaign_name}</p>
                    </td>
                    <td className="px-4 py-2.5 text-right font-data text-xs">{c.sessions.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right font-data text-xs">{c.conversions}</td>
                    <td className="px-4 py-2.5 text-right font-data text-xs">{fmt(c.revenue)}</td>
                    <td className="px-4 py-2.5 text-right font-data text-xs">
                      {c.conversions > 0 ? fmt(c.revenue / c.conversions) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
