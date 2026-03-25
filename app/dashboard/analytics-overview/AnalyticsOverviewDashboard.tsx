'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePagination, Paginator, exportCSV } from '@/hooks/usePagination'

interface SessionRow { channel: string; sessions: number; conversions: number; revenue: number }
interface MonthlyRow { month: string; sessions: number }
interface KeywordRow { keyword: string; position: number; search_volume: number; traffic_percent: number }
interface GapRow { keyword: string; competitor_domain: string; competitor_position: number; our_position: number; search_volume: number; opportunity_score: number }
interface SemrushMetrics {
  organic_keywords_total: number | null
  organic_traffic_monthly: number | null
  authority_score: number | null
  gained_keywords_30d: number | null
  lost_keywords_30d: number | null
  calculated_at: string | null
}
interface OverviewCache {
  traffic_health_score: number | null
  organic_visibility_score: number | null
  traffic_to_revenue_efficiency: number | null
  paid_vs_organic_balance: number | null
  search_capture_rate: number | null
  top_opportunities: GapRow[] | null
  calculated_at: string | null
}
interface Insight {
  title: string
  description: string
  action: string
  impact: string
  category: string
}

interface Props {
  ga4Connected: boolean
  semrushConnected: boolean
  domain: string | null
  overviewCache: OverviewCache | null
  cachedInsights: Insight[] | null
  insightsCachedAt: string | null
  sessions: SessionRow[]
  monthly: MonthlyRow[]
  ga4Metrics: Record<string, number>
  semrushMetrics: SemrushMetrics | null
  keywords: KeywordRow[]
  keywordGaps: GapRow[]
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

function ScoreRing({ score, label, color }: { score: number; label: string; color: string }) {
  const r = 44
  const circ = 2 * Math.PI * r
  const fill = ((score ?? 0) / 100) * circ

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-28 h-28">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={r} fill="none" stroke="#F0ECE6" strokeWidth="8" />
          <circle
            cx="50" cy="50" r={r} fill="none"
            stroke={color} strokeWidth="8"
            strokeDasharray={`${fill} ${circ}`}
            strokeLinecap="round"
            className="transition-all duration-1000"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-2xl font-bold text-ink">{score ?? '—'}</span>
          <span className="text-[10px] text-ink-3">/100</span>
        </div>
      </div>
      <p className="text-xs font-medium text-ink-2 text-center">{label}</p>
    </div>
  )
}

function MonthlyChart({ monthly }: { monthly: MonthlyRow[] }) {
  if (monthly.length === 0) return <div className="h-24 flex items-center justify-center text-sm text-ink-3">No data yet</div>
  const max = Math.max(...monthly.map((m) => m.sessions), 1)
  const last12 = monthly.slice(-12)

  return (
    <div className="mt-4 flex items-end gap-1 h-24">
      {last12.map((m, i) => {
        const barH = Math.max(4, Math.round((m.sessions / max) * 96))
        const label = m.month ? m.month.slice(0, 7) : ''
        const monthNum = parseInt(label.slice(5), 10)
        const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        return (
          <div key={i} className="flex flex-1 flex-col items-center gap-1 group">
            <div className="relative w-full">
              <div
                className="w-full rounded-t bg-teal/60 group-hover:bg-teal transition-colors"
                style={{ height: barH }}
                title={`${monthNames[monthNum] ?? label}: ${m.sessions.toLocaleString()} sessions`}
              />
            </div>
            <span className="text-[9px] text-ink-3">{monthNames[monthNum] ?? ''}</span>
          </div>
        )
      })}
    </div>
  )
}

function ChannelBar({ channel, sessions, total, conversions }: { channel: string; sessions: number; total: number; conversions: number }) {
  const pct = total > 0 ? (sessions / total) * 100 : 0
  const cvr = sessions > 0 ? (conversions / sessions) * 100 : 0
  const isPaid = channel.toLowerCase().includes('paid')

  return (
    <div className="flex items-center gap-3">
      <div className="w-32 shrink-0 text-xs text-ink-2 truncate">{channel}</div>
      <div className="flex-1 h-3 bg-cream-2 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${isPaid ? 'bg-[#4285F4]/70' : 'bg-teal/70'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="w-20 shrink-0 text-right font-data text-xs text-ink">{sessions.toLocaleString()}</div>
      <div className="w-14 shrink-0 text-right font-data text-xs text-ink-3">{cvr.toFixed(1)}%</div>
    </div>
  )
}

export default function AnalyticsOverviewDashboard({
  ga4Connected,
  semrushConnected,
  domain,
  overviewCache,
  cachedInsights,
  insightsCachedAt,
  sessions,
  monthly,
  ga4Metrics,
  semrushMetrics,
  keywords,
  keywordGaps,
}: Props) {
  const [refreshing, setRefreshing] = useState(false)
  const [refreshMsg, setRefreshMsg] = useState('')
  const [insights, setInsights] = useState<Insight[]>(cachedInsights ?? [])
  const [insightsState, setInsightsState] = useState<'idle' | 'loading' | 'done' | 'error'>(
    cachedInsights && cachedInsights.length > 0 ? 'done' : 'idle'
  )

  const { paged: pagedGaps, page: gapsPage, setPage: setGapsPage, totalPages: gapsTotalPages } = usePagination(keywordGaps, 10)

  const m = (k: string) => ga4Metrics[k] ?? 0
  const totalSessions = sessions.reduce((s, r) => s + r.sessions, 0)
  const totalRevenue = m('ga4_revenue_90d')

  const trafficScore = overviewCache?.traffic_health_score ?? null
  const visibilityScore = overviewCache?.organic_visibility_score ?? null

  const scoreColor = (s: number | null) => {
    if (s === null) return '#94A3B8'
    if (s >= 70) return '#4BBFAD'
    if (s >= 40) return '#F59E0B'
    return '#EF4444'
  }

  async function handleRefresh() {
    setRefreshing(true)
    setRefreshMsg('')
    try {
      const res = await fetch('/api/analytics/overview/refresh', { method: 'POST' })
      const data = await res.json() as { ok?: boolean; error?: string }
      setRefreshMsg(data.error ? `Error: ${data.error}` : 'Refreshed — reload to see updated scores')
    } catch {
      setRefreshMsg('Network error')
    } finally {
      setRefreshing(false)
    }
  }

  async function loadInsights() {
    setInsightsState('loading')
    try {
      const res = await fetch('/api/insights/analytics-overview', { method: 'POST' })
      const data = await res.json() as { insights?: Insight[]; error?: string }
      if (data.error) {
        setInsightsState('error')
      } else {
        setInsights(data.insights ?? [])
        setInsightsState('done')
      }
    } catch {
      setInsightsState('error')
    }
  }

  const hasAnyData = ga4Connected || semrushConnected

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Analytics Overview</h1>
          <p className="text-sm text-ink-3 mt-0.5">
            Unified view combining GA4 traffic + SEMrush organic intelligence
            {domain && <> · <span className="font-medium">{domain}</span></>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${ga4Connected ? 'bg-teal' : 'bg-cream-3'}`} />
            <span className="text-xs text-ink-3">GA4</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${semrushConnected ? 'bg-teal' : 'bg-cream-3'}`} />
            <span className="text-xs text-ink-3">SEMrush</span>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-lg border border-cream-3 bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-cream disabled:opacity-50 transition"
          >
            {refreshing ? <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-cream-3 border-t-teal" /> : (
              <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M14 8A6 6 0 1 1 8 2" strokeLinecap="round"/>
                <path d="M14 2v4h-4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
            Refresh Scores
          </button>
        </div>
      </div>
      {refreshMsg && <p className="text-sm text-ink-2">{refreshMsg}</p>}

      {!hasAnyData && (
        <div className="rounded-2xl border border-cream-3 bg-white p-10 text-center shadow-sm">
          <h2 className="font-display text-lg font-semibold text-ink mb-2">Connect your analytics platforms</h2>
          <p className="text-sm text-ink-3 mb-4">Connect GA4 for traffic data and SEMrush for organic visibility to unlock this overview.</p>
          <Link href="/dashboard/integrations" className="inline-flex items-center rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-dark transition">
            Go to Integrations →
          </Link>
        </div>
      )}

      {hasAnyData && (
        <>
          {/* AI Insights — top of page */}
          <section className="rounded-2xl border border-cream-3 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-display text-base font-semibold text-ink">AI Analytics Intelligence</h2>
                  <span className="inline-flex items-center rounded-full bg-teal-pale px-2 py-0.5 text-[10px] font-medium text-teal-deep">GA4 + SEMrush</span>
                </div>
                <p className="text-xs text-ink-3 mt-0.5">
                  Cross-platform analysis of traffic, rankings, and growth opportunities
                  {insightsCachedAt && insightsState === 'done' && (
                    <> · <span className="text-ink-4">Updated {new Date(insightsCachedAt).toLocaleDateString()}</span></>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {insightsState === 'done' && (
                  <button onClick={loadInsights} className="text-xs text-teal hover:text-teal-dark font-medium transition">
                    Refresh
                  </button>
                )}
                <button
                  onClick={loadInsights}
                  disabled={insightsState === 'loading'}
                  className="inline-flex items-center gap-1.5 rounded-full border border-teal/25 bg-teal/5 px-3 py-1 text-xs font-medium text-teal hover:bg-teal hover:text-white transition disabled:opacity-50"
                >
                  <svg className="h-3 w-3" viewBox="0 0 12 12" fill="currentColor">
                    <path d="M6 1l1.2 3.8H11l-3 2.2 1.2 3.8L6 8.5l-3.2 2.3L4 7 1 4.8h3.8L6 1z" />
                  </svg>
                  {insightsState === 'loading' ? 'Analyzing…' : insightsState === 'done' ? 'Regenerate' : 'Generate Insights'}
                </button>
              </div>
            </div>

            {insightsState === 'loading' && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="rounded-xl border border-cream-3 bg-cream p-4 animate-pulse">
                    <div className="h-3 bg-cream-3 rounded w-1/3 mb-2" />
                    <div className="h-4 bg-cream-3 rounded w-2/3 mb-3" />
                    <div className="h-3 bg-cream-3 rounded w-full mb-1.5" />
                    <div className="h-3 bg-cream-3 rounded w-4/5" />
                  </div>
                ))}
              </div>
            )}

            {insightsState === 'done' && insights.length > 0 && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {insights.map((ins, i) => (
                  <div key={i} className="rounded-xl border border-cream-3 bg-cream p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-display text-sm font-semibold text-ink leading-snug">{ins.title}</h3>
                      <span className="shrink-0 text-[9px] font-data uppercase tracking-wider text-ink-3 bg-cream-2 rounded px-1.5 py-0.5">{ins.category}</span>
                    </div>
                    <p className="text-xs text-ink-2 leading-relaxed mb-3">{ins.description}</p>
                    <div className="flex items-start gap-1.5 border-t border-cream-2 pt-2.5">
                      <svg className="mt-0.5 h-3 w-3 shrink-0 text-teal" viewBox="0 0 12 12" fill="currentColor">
                        <path d="M10.28 2.28L4 8.56 1.72 6.28a1 1 0 0 0-1.44 1.44l3 3a1 1 0 0 0 1.44 0l7-7a1 1 0 0 0-1.44-1.44z"/>
                      </svg>
                      <p className="text-xs text-ink font-medium">{ins.action}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {insightsState === 'idle' && (
              <div className="rounded-xl border border-dashed border-cream-3 bg-cream px-5 py-8 text-center">
                <p className="text-sm text-ink-3 mb-3">Get AI analysis combining your GA4 traffic patterns with SEMrush organic rankings.</p>
                <button onClick={loadInsights} className="rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-dark transition">
                  Generate Insights
                </button>
              </div>
            )}

            {insightsState === 'error' && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
                Failed to generate insights. Check your ANTHROPIC_API_KEY is set.
              </div>
            )}
          </section>

          {/* Health Scores + Key Metrics */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Score rings */}
            <section className="rounded-2xl border border-cream-3 bg-white p-6 shadow-sm col-span-1">
              <h2 className="font-display text-base font-semibold text-ink mb-1">Platform Health</h2>
              <p className="text-xs text-ink-3 mb-5">
                {overviewCache?.calculated_at
                  ? `Updated ${new Date(overviewCache.calculated_at).toLocaleDateString()}`
                  : 'Click "Refresh Scores" to compute'}
              </p>
              <div className="flex items-center justify-around gap-4">
                <ScoreRing
                  score={trafficScore ?? 0}
                  label="Traffic Health"
                  color={scoreColor(trafficScore)}
                />
                <ScoreRing
                  score={visibilityScore ?? 0}
                  label="Organic Visibility"
                  color={scoreColor(visibilityScore)}
                />
              </div>
              {overviewCache && (
                <div className="mt-5 space-y-2 border-t border-cream-2 pt-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-ink-3">Revenue / session</span>
                    <span className="font-data font-medium text-ink">
                      {overviewCache.traffic_to_revenue_efficiency
                        ? `$${Number(overviewCache.traffic_to_revenue_efficiency).toFixed(2)}`
                        : '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-ink-3">Paid traffic share</span>
                    <span className="font-data font-medium text-ink">
                      {overviewCache.paid_vs_organic_balance != null
                        ? `${(Number(overviewCache.paid_vs_organic_balance) * 100).toFixed(0)}%`
                        : '—'}
                    </span>
                  </div>
                </div>
              )}
            </section>

            {/* GA4 KPIs */}
            <section className="rounded-2xl border border-cream-3 bg-white p-6 shadow-sm col-span-1">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-base font-semibold text-ink">Traffic (GA4)</h2>
                <Link href="/dashboard/analytics" className="text-xs text-teal hover:text-teal-dark font-medium transition">Full report →</Link>
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-[10px] font-data uppercase tracking-wider text-ink-3">Sessions (90d)</p>
                  <p className="font-display text-2xl font-semibold text-ink">{totalSessions.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[10px] font-data uppercase tracking-wider text-ink-3">Revenue (90d)</p>
                  <p className="font-display text-xl font-semibold text-ink">{fmt(totalRevenue)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-data uppercase tracking-wider text-ink-3">Conversion Rate</p>
                  <p className="font-display text-xl font-semibold text-ink">{m('ga4_conversion_rate_90d').toFixed(2)}%</p>
                </div>
              </div>
            </section>

            {/* SEMrush KPIs */}
            <section className="rounded-2xl border border-cream-3 bg-white p-6 shadow-sm col-span-1">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-base font-semibold text-ink">Organic (SEMrush)</h2>
                <Link href="/dashboard/semrush" className="text-xs text-teal hover:text-teal-dark font-medium transition">Full report →</Link>
              </div>
              {semrushMetrics ? (
                <div className="space-y-3">
                  <div>
                    <p className="text-[10px] font-data uppercase tracking-wider text-ink-3">Organic Keywords</p>
                    <p className="font-display text-2xl font-semibold text-ink">{(semrushMetrics.organic_keywords_total ?? 0).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-data uppercase tracking-wider text-ink-3">Monthly Organic Traffic</p>
                    <p className="font-display text-xl font-semibold text-ink">{(semrushMetrics.organic_traffic_monthly ?? 0).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-data uppercase tracking-wider text-ink-3">Authority Score</p>
                    <p className="font-display text-xl font-semibold text-ink">{semrushMetrics.authority_score ?? '—'}<span className="text-xs text-ink-3">/100</span></p>
                  </div>
                </div>
              ) : (
                <div className="py-6 text-center text-sm text-ink-3">
                  {semrushConnected ? 'Sync SEMrush to see organic data' : (
                    <Link href="/dashboard/integrations" className="text-teal hover:underline">Connect SEMrush →</Link>
                  )}
                </div>
              )}
            </section>
          </div>

          {/* Monthly Sessions Trend */}
          <section className="rounded-2xl border border-cream-3 bg-white p-6 shadow-sm">
            <h2 className="font-display text-base font-semibold text-ink">Monthly Sessions Trend</h2>
            <p className="text-xs text-ink-3 mt-0.5">Google Analytics 4 — last 12 months</p>
            <MonthlyChart monthly={monthly} />
          </section>

          {/* Channel Breakdown */}
          {sessions.length > 0 && (
            <section className="rounded-2xl border border-cream-3 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-base font-semibold text-ink">Traffic by Channel</h2>
                <div className="flex items-center gap-4 text-[10px] font-data uppercase tracking-wider text-ink-3">
                  <span>Sessions</span>
                  <span>CVR</span>
                </div>
              </div>
              <div className="space-y-2.5">
                {sessions.map((s) => (
                  <ChannelBar key={s.channel} channel={s.channel} sessions={s.sessions} total={totalSessions} conversions={s.conversions} />
                ))}
              </div>
            </section>
          )}

          {/* Top Keyword Opportunities */}
          {keywordGaps.length > 0 && (
            <section className="rounded-2xl border border-cream-3 bg-white shadow-sm overflow-hidden">
              <div className="flex items-center justify-between border-b border-cream-2 px-5 py-3.5">
                <div>
                  <h2 className="font-display text-sm font-semibold text-ink">Top Keyword Opportunities</h2>
                  <p className="text-xs text-ink-3 mt-0.5">Keywords ranked by competitor but not by you — from SEMrush gap analysis</p>
                </div>
                <button
                  onClick={() => exportCSV('keyword-opportunities', keywordGaps.map((g) => ({ keyword: g.keyword, competitor: g.competitor_domain, competitor_position: g.competitor_position, our_position: g.our_position || 'not ranked', search_volume: g.search_volume, opportunity_score: g.opportunity_score })))}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-cream-3 px-2.5 py-1 text-xs text-ink-3 hover:bg-cream transition"
                >
                  <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M6 1v7M3 5l3 3 3-3M1 9v1a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V9" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  CSV
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-cream-2 text-xs font-medium text-ink-3 bg-cream">
                      <th className="px-5 py-2.5 text-left">Keyword</th>
                      <th className="px-4 py-2.5 text-left">Competitor</th>
                      <th className="px-4 py-2.5 text-right">Their Rank</th>
                      <th className="px-4 py-2.5 text-right">Our Rank</th>
                      <th className="px-4 py-2.5 text-right">Volume</th>
                      <th className="px-4 py-2.5 text-right">Opp. Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cream-2">
                    {pagedGaps.map((g, i) => (
                      <tr key={i} className="hover:bg-cream transition-colors">
                        <td className="px-5 py-2.5 font-medium text-ink text-xs">{g.keyword}</td>
                        <td className="px-4 py-2.5 text-xs text-ink-3 truncate max-w-[140px]">{g.competitor_domain}</td>
                        <td className="px-4 py-2.5 text-right">
                          <span className="font-data text-xs font-medium text-teal-deep bg-teal-pale px-1.5 py-0.5 rounded">#{g.competitor_position}</span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-data text-xs text-ink-3">
                          {g.our_position > 0 ? `#${g.our_position}` : 'Not ranked'}
                        </td>
                        <td className="px-4 py-2.5 text-right font-data text-xs">{g.search_volume.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-12 h-1.5 bg-cream-2 rounded-full overflow-hidden">
                              <div className="h-full bg-teal rounded-full" style={{ width: `${Math.min(100, g.opportunity_score)}%` }} />
                            </div>
                            <span className="font-data text-xs text-ink">{g.opportunity_score}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Paginator page={gapsPage} totalPages={gapsTotalPages} setPage={setGapsPage} />
            </section>
          )}

          {/* Top organic keywords from SEMrush */}
          {keywords.length > 0 && (
            <section className="rounded-2xl border border-cream-3 bg-white shadow-sm overflow-hidden">
              <div className="border-b border-cream-2 px-5 py-3.5">
                <h2 className="font-display text-sm font-semibold text-ink">Top Ranking Keywords</h2>
                <p className="text-xs text-ink-3 mt-0.5">Your top organic rankings — by traffic share</p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-cream-2 text-xs font-medium text-ink-3 bg-cream">
                      <th className="px-5 py-2.5 text-left">Keyword</th>
                      <th className="px-4 py-2.5 text-center">Position</th>
                      <th className="px-4 py-2.5 text-right">Volume</th>
                      <th className="px-4 py-2.5 text-right">Traffic %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cream-2">
                    {keywords.slice(0, 15).map((k, i) => (
                      <tr key={i} className="hover:bg-cream transition-colors">
                        <td className="px-5 py-2.5 font-medium text-ink text-xs">{k.keyword}</td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`font-data text-xs font-medium px-1.5 py-0.5 rounded-md ${
                            k.position <= 3 ? 'bg-teal-pale text-teal-deep' :
                            k.position <= 10 ? 'bg-blue-50 text-blue-700' :
                            'bg-cream-2 text-ink-3'
                          }`}>
                            #{k.position}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-data text-xs">{k.search_volume.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-right font-data text-xs">
                          {k.traffic_percent > 0 ? `${k.traffic_percent.toFixed(1)}%` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
