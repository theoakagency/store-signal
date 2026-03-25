'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePagination, Paginator, exportCSV } from '@/hooks/usePagination'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Keyword {
  keyword: string
  position: number
  previous_position: number
  position_change: number
  search_volume: number
  cpc: number
  url: string | null
  traffic_percent: number
}

interface Competitor {
  domain: string
  common_keywords: number
  organic_keywords: number
  organic_traffic: number
  organic_traffic_cost: number
  competition_level: number
}

interface KeywordGap {
  keyword: string
  competitor_domain: string
  competitor_position: number
  our_position: number | null
  search_volume: number
  opportunity_score: number
}

interface Backlinks {
  total_backlinks: number
  referring_domains: number
  authority_score: number | null
  calculated_at: string
}

interface Metrics {
  organic_keywords_total: number
  organic_traffic_estimate: number
  authority_score: number | null
  top_competitors: Array<{ domain: string; common_keywords: number; organic_traffic: number; competition_level: number }>
  keyword_opportunities: Array<{ keyword: string; position: number; search_volume: number }>
  traffic_trend: Array<{ date: string; organic_traffic: number; organic_keywords: number }>
  lost_keywords_30d: number
  gained_keywords_30d: number
  calculated_at: string
}

interface Props {
  connected: boolean
  domain: string | null
  metrics: Metrics | null
  keywords: Keyword[]
  competitors: Competitor[]
  keywordGaps: KeywordGap[]
  backlinks: Backlinks | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, d = 0) {
  return (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

function fmtK(n: number) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`
  return String(n)
}

type KeywordTab = 'all' | 'improved' | 'declined' | 'new'

// ── Sub-components ─────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, badge }: { label: string; value: string; sub?: string; badge?: string }) {
  return (
    <div className="rounded-2xl border border-cream-3 bg-white p-5 shadow-sm">
      {badge && (
        <span className="inline-flex items-center rounded-full bg-[#FF642D]/10 px-2 py-0.5 text-[10px] font-medium text-[#FF642D] mb-2">
          {badge}
        </span>
      )}
      <p className="text-xs font-data uppercase tracking-widest text-ink-3">{label}</p>
      <p className="mt-1.5 font-display text-2xl font-bold text-ink">{value}</p>
      {sub && <p className="mt-1 text-xs text-ink-3">{sub}</p>}
    </div>
  )
}

function PositionChange({ change }: { change: number }) {
  if (change === 0) return <span className="text-ink-3 text-xs">—</span>
  // Negative positionChange means position number went down = IMPROVED
  const improved = change < 0
  const cls = improved ? 'text-teal-deep' : 'text-red-500'
  const arrow = improved ? '▲' : '▼'
  return (
    <span className={`text-xs font-medium ${cls}`}>
      {arrow} {Math.abs(change)}
    </span>
  )
}

function AuthorityRing({ score }: { score: number | null }) {
  const s = score ?? 0
  const radius = 36
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference - (s / 100) * circumference
  const color = s >= 61 ? '#0D9B8A' : s >= 31 ? '#F59E0B' : '#EF4444'
  const label = s >= 61 ? 'High' : s >= 31 ? 'Medium' : 'Low'

  return (
    <div className="flex flex-col items-center">
      <div className="relative h-24 w-24">
        <svg className="h-24 w-24 -rotate-90" viewBox="0 0 96 96">
          <circle cx="48" cy="48" r={radius} fill="none" stroke="#f3f1ec" strokeWidth="8" />
          <circle
            cx="48" cy="48" r={radius} fill="none"
            stroke={color} strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-2xl font-bold text-ink">{s > 0 ? s : '—'}</span>
          <span className="text-[10px] text-ink-3">/ 100</span>
        </div>
      </div>
      <span className="mt-1 text-xs font-medium" style={{ color }}>{label} Authority</span>
    </div>
  )
}

function TrafficChart({ trend }: { trend: Array<{ date: string; organic_traffic: number }> }) {
  if (trend.length === 0) {
    return <div className="flex h-32 items-center justify-center text-sm text-ink-3">No trend data yet</div>
  }

  const max = Math.max(...trend.map((m) => m.organic_traffic), 1)
  const height = 80

  return (
    <div className="flex items-end gap-1 h-20">
      {trend.map((month, i) => {
        const barH = Math.max(4, Math.round((month.organic_traffic / max) * height))
        const label = month.date ? month.date.slice(0, 7) : ''
        const shortLabel = label.slice(5) // MM
        const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        const monthNum = parseInt(shortLabel, 10)
        const monthName = monthNames[monthNum] ?? shortLabel
        return (
          <div key={i} className="flex flex-1 flex-col items-center gap-1 group">
            <div className="relative w-full">
              <div
                className="w-full rounded-t bg-[#FF642D]/70 group-hover:bg-[#FF642D] transition-colors"
                style={{ height: barH }}
                title={`${monthName}: ${fmtK(month.organic_traffic)} traffic`}
              />
            </div>
            <span className="text-[9px] text-ink-3">{monthName}</span>
          </div>
        )
      })}
    </div>
  )
}

function NotConnected({ domain }: { domain: string | null }) {
  return (
    <div className="rounded-2xl border border-cream-3 bg-white p-10 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#FF642D]/10">
        <svg className="h-7 w-7 text-[#FF642D]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M11 8v3M11 14h.01" strokeLinecap="round" />
        </svg>
      </div>
      <h3 className="font-display text-base font-semibold text-ink">SEMrush not connected</h3>
      <p className="mt-1.5 text-sm text-ink-3 max-w-sm mx-auto">
        Connect SEMrush to track keyword rankings, competitor gaps, and organic traffic trends.
      </p>
      <Link
        href="/dashboard/integrations"
        className="mt-5 inline-flex items-center rounded-xl bg-[#FF642D] px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 transition"
      >
        Connect SEMrush →
      </Link>
    </div>
  )
}

function NoData() {
  return (
    <div className="rounded-2xl border border-cream-3 bg-white p-10 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-cream-2">
        <svg className="h-7 w-7 text-ink-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h3 className="font-display text-base font-semibold text-ink">No data yet</h3>
      <p className="mt-1.5 text-sm text-ink-3">Click &quot;Sync Now&quot; to fetch your first SEMrush snapshot.</p>
    </div>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function SemrushDashboard({ connected, domain, metrics, keywords, competitors, keywordGaps, backlinks }: Props) {
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [kwTab, setKwTab] = useState<KeywordTab>('all')
  const { paged: pagedKeywords, page: kwPage, setPage: setKwPage, reset: resetKwPage, totalPages: kwTotalPages } = usePagination(
    keywords.filter((k) => {
      if (kwTab === 'improved') return k.position_change < -1
      if (kwTab === 'declined') return k.position_change > 1
      if (kwTab === 'new') return k.previous_position === 0 && k.position > 0
      return true
    }),
    25
  )
  const [generating, setGenerating] = useState(false)
  const [aiInsight, setAiInsight] = useState<string | null>(null)

  if (!connected) return <NotConnected domain={domain} />
  if (!metrics && keywords.length === 0) return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">SEO Intelligence</h1>
          {domain && <p className="text-sm text-ink-3 mt-0.5">{domain}</p>}
        </div>
        <SyncButton syncing={syncing} error={syncError} onSync={handleSync} />
      </div>
      <NoData />
    </div>
  )

  async function handleSync() {
    setSyncing(true)
    setSyncError(null)
    try {
      const res = await fetch('/api/semrush/sync', { method: 'POST' })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (data.error) { setSyncError(data.error); setSyncing(false); return }
      window.location.reload()
    } catch { setSyncError('Network error'); setSyncing(false) }
  }

  async function handleGenerateInsights() {
    setGenerating(true)
    setAiInsight(null)
    try {
      const res = await fetch('/api/insights/seo', { method: 'POST' })
      const data = await res.json() as { insight?: string; error?: string }
      if (data.error) { setAiInsight(`Error: ${data.error}`); return }
      setAiInsight(data.insight ?? '')
    } catch { setAiInsight('Error generating insights') }
    finally { setGenerating(false) }
  }

  // Lost rankings = keywords that dropped significantly
  const lostRankings = keywords
    .filter((k) => k.position_change > 5)
    .sort((a, b) => b.search_volume - a.search_volume)

  const trend = metrics?.traffic_trend ?? []
  const authorityScore = metrics?.authority_score ?? backlinks?.authority_score ?? null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">SEO Intelligence</h1>
          {domain && <p className="text-sm text-ink-3 mt-0.5">Tracking: {domain}</p>}
        </div>
        <SyncButton syncing={syncing} error={syncError} onSync={handleSync} />
      </div>

      {syncError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Sync error: {syncError}
        </div>
      )}

      {/* AI SEO Analysis — top of page */}
      <section className="rounded-2xl border border-cream-3 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display text-base font-semibold text-ink">AI SEO Analysis</h2>
            <p className="text-xs text-ink-3 mt-0.5">Analyzes your rankings, competitor gaps, and lost keywords</p>
          </div>
          <button
            onClick={handleGenerateInsights}
            disabled={generating}
            className="flex items-center gap-2 rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-cream hover:bg-charcoal disabled:opacity-50 transition"
          >
            {generating ? (
              <>
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-cream/30 border-t-cream" />
                Analyzing…
              </>
            ) : (
              <>
                <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 1l1.5 3.5L13 6l-2.5 2.5.5 3.5L8 10.5 5 12l.5-3.5L3 6l3.5-.5L8 1z" />
                </svg>
                Generate Insights
              </>
            )}
          </button>
        </div>

        {aiInsight ? (
          <div className="rounded-xl bg-ink/5 border border-ink/10 px-5 py-4 text-sm text-ink leading-relaxed whitespace-pre-wrap">
            {aiInsight}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-cream-3 bg-cream px-5 py-6 text-center">
            <p className="text-sm text-ink-3">
              Click &quot;Generate Insights&quot; to get AI analysis of:
            </p>
            <ul className="mt-2 text-xs text-ink-3 space-y-1">
              <li>Why organic traffic is trending the way it is</li>
              <li>Which lost rankings need immediate attention</li>
              <li>Top keyword gap opportunities vs competitors</li>
              <li>Top 3 SEO actions for the next 30 days</li>
            </ul>
          </div>
        )}
      </section>

      {/* Domain Health Cards */}
      <section>
        <h2 className="font-display text-sm font-semibold text-ink mb-3">Domain Health</h2>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <div className="rounded-2xl border border-cream-3 bg-white p-5 shadow-sm flex flex-col items-center justify-center">
            <p className="text-xs font-data uppercase tracking-widest text-ink-3 mb-3">Authority Score</p>
            <AuthorityRing score={authorityScore} />
          </div>
          <KpiCard
            label="Organic Keywords"
            value={fmt(metrics?.organic_keywords_total)}
            sub={metrics ? `+${metrics.gained_keywords_30d} gained · -${metrics.lost_keywords_30d} lost` : undefined}
            badge="SEMrush"
          />
          <KpiCard
            label="Est. Monthly Traffic"
            value={fmtK(metrics?.organic_traffic_estimate ?? 0)}
            sub="estimated organic visits"
            badge="SEMrush"
          />
          <KpiCard
            label="Referring Domains"
            value={fmt(backlinks?.referring_domains)}
            sub={backlinks ? `${fmt(backlinks.total_backlinks)} total backlinks` : 'sync to see data'}
          />
        </div>
      </section>

      {/* Traffic Trend Chart */}
      <section className="rounded-2xl border border-cream-3 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-base font-semibold text-ink">Traffic Trend</h2>
          <span className="text-xs text-ink-3">12-month organic traffic estimate</span>
        </div>
        <TrafficChart trend={trend} />
      </section>

      {/* Top Organic Keywords Table */}
      <section className="rounded-2xl border border-cream-3 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-cream-2 px-5 py-3.5 flex-wrap gap-2">
          <h2 className="font-display text-base font-semibold text-ink">Top Organic Keywords</h2>
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {(['all', 'improved', 'declined', 'new'] as KeywordTab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => { setKwTab(tab); resetKwPage() }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                    kwTab === tab
                      ? 'bg-ink text-cream'
                      : 'text-ink-3 hover:bg-cream-2'
                  }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
            {keywords.length > 0 && (
              <button
                onClick={() => exportCSV('semrush-keywords', keywords.map((k) => ({ keyword: k.keyword, position: k.position, position_change: k.position_change, search_volume: k.search_volume, cpc: k.cpc, traffic_percent: k.traffic_percent, url: k.url ?? '' })))}
                className="inline-flex items-center gap-1.5 rounded-lg border border-cream-3 px-2.5 py-1 text-xs text-ink-3 hover:bg-cream transition"
              >
                <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M6 1v7M3 5l3 3 3-3M1 9v1a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V9" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                CSV
              </button>
            )}
          </div>
        </div>
        {pagedKeywords.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-ink-3">No keywords in this category</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-cream-2 text-xs font-medium text-ink-3">
                  <th className="px-5 py-2.5 text-left">Keyword</th>
                  <th className="px-4 py-2.5 text-center">Pos</th>
                  <th className="px-4 py-2.5 text-center">Change</th>
                  <th className="px-4 py-2.5 text-right">Volume</th>
                  <th className="px-4 py-2.5 text-right hidden sm:table-cell">CPC</th>
                  <th className="px-4 py-2.5 text-right">Traffic %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-2">
                {pagedKeywords.map((k, i) => (
                  <tr key={i} className="hover:bg-cream transition-colors">
                    <td className="px-5 py-2.5">
                      <span className="font-medium text-ink text-sm">{k.keyword}</span>
                      {k.url && (
                        <p className="text-[10px] text-ink-3 truncate max-w-[200px]" title={k.url}>
                          {k.url.replace(/^https?:\/\/[^/]+/, '')}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`font-data text-xs font-medium px-1.5 py-0.5 rounded-md ${
                        k.position <= 3 ? 'bg-teal-pale text-teal-deep' :
                        k.position <= 10 ? 'bg-blue-50 text-blue-700' :
                        'bg-cream-2 text-ink-3'
                      }`}>
                        #{k.position}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <PositionChange change={k.position_change} />
                    </td>
                    <td className="px-4 py-2.5 text-right font-data text-xs text-ink">{fmtK(k.search_volume)}</td>
                    <td className="px-4 py-2.5 text-right font-data text-xs text-ink-3 hidden sm:table-cell">
                      {k.cpc > 0 ? `$${k.cpc.toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-data text-xs text-ink">
                      {k.traffic_percent > 0 ? `${k.traffic_percent.toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Paginator page={kwPage} totalPages={kwTotalPages} setPage={setKwPage} />
      </section>

      {/* Competitor Analysis + Keyword Gap (side by side on large screens) */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Competitor Cards */}
        <section>
          <h2 className="font-display text-base font-semibold text-ink mb-3">Top Competitors</h2>
          {competitors.length === 0 ? (
            <div className="rounded-2xl border border-cream-3 bg-white p-6 text-center text-sm text-ink-3">
              Sync to see competitors
            </div>
          ) : (
            <div className="space-y-3">
              {competitors.map((comp, i) => (
                <div key={i} className="rounded-2xl border border-cream-3 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-ink text-sm">{comp.domain}</p>
                      <p className="text-xs text-ink-3 mt-0.5">
                        {fmt(comp.common_keywords)} common keywords · {fmtK(comp.organic_traffic)} traffic
                      </p>
                    </div>
                    <div className="shrink-0">
                      <CompetitionBar level={comp.competition_level} />
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-cream px-3 py-2">
                      <p className="text-[10px] text-ink-3 uppercase tracking-wider">Their Keywords</p>
                      <p className="text-sm font-semibold text-ink">{fmtK(comp.organic_keywords)}</p>
                    </div>
                    <div className="rounded-lg bg-cream px-3 py-2">
                      <p className="text-[10px] text-ink-3 uppercase tracking-wider">Common Keywords</p>
                      <p className="text-sm font-semibold text-ink">{fmtK(comp.common_keywords)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Keyword Gap Table */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-base font-semibold text-ink">Keyword Gap</h2>
            <span className="text-xs text-ink-3">Keywords competitors rank for that you don't</span>
          </div>
          {keywordGaps.length === 0 ? (
            <div className="rounded-2xl border border-cream-3 bg-white p-6 text-center text-sm text-ink-3">
              Sync to see keyword gaps
            </div>
          ) : (
            <div className="rounded-2xl border border-cream-3 bg-white shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-cream-2 text-xs font-medium text-ink-3">
                      <th className="px-4 py-2.5 text-left">Keyword</th>
                      <th className="px-3 py-2.5 text-right">Vol</th>
                      <th className="px-3 py-2.5 text-center">Their Pos</th>
                      <th className="px-3 py-2.5 text-center">Our Pos</th>
                      <th className="px-3 py-2.5 text-center">Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cream-2">
                    {keywordGaps.slice(0, 20).map((gap, i) => (
                      <tr key={i} className="hover:bg-cream transition-colors">
                        <td className="px-4 py-2">
                          <p className="text-xs font-medium text-ink">{gap.keyword}</p>
                          <p className="text-[10px] text-ink-3">{gap.competitor_domain}</p>
                        </td>
                        <td className="px-3 py-2 text-right font-data text-xs text-ink">{fmtK(gap.search_volume)}</td>
                        <td className="px-3 py-2 text-center">
                          <span className="font-data text-xs text-teal-deep font-medium">#{gap.competitor_position}</span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className="font-data text-xs text-ink-3">
                            {gap.our_position ? `#${gap.our_position}` : 'Not ranking'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <OpportunityBadge score={gap.opportunity_score} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Lost Rankings */}
      {lostRankings.length > 0 && (
        <section className="rounded-2xl border border-red-100 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between border-b border-red-100 px-5 py-3.5 bg-red-50/50">
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4 text-red-500" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 10L4 6h8l-4 4z" />
              </svg>
              <h2 className="font-display text-sm font-semibold text-red-800">Lost Rankings (30d)</h2>
            </div>
            <span className="text-xs text-red-600">{lostRankings.length} keywords dropped significantly</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-cream-2 text-xs font-medium text-ink-3">
                  <th className="px-5 py-2.5 text-left">Keyword</th>
                  <th className="px-4 py-2.5 text-center">Was</th>
                  <th className="px-4 py-2.5 text-center">Now</th>
                  <th className="px-4 py-2.5 text-center">Drop</th>
                  <th className="px-4 py-2.5 text-right">Volume</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-2">
                {lostRankings.slice(0, 10).map((k, i) => (
                  <tr key={i} className="hover:bg-red-50/30 transition-colors">
                    <td className="px-5 py-2.5 text-sm font-medium text-ink">{k.keyword}</td>
                    <td className="px-4 py-2.5 text-center font-data text-xs text-ink">
                      #{k.previous_position > 0 ? k.previous_position : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-center font-data text-xs text-ink">#{k.position}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className="text-xs font-medium text-red-500">▼ {k.position_change}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-data text-xs text-ink-3">{fmtK(k.search_volume)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Backlink Overview */}
      <section className="rounded-2xl border border-cream-3 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-base font-semibold text-ink">Backlink Overview</h2>
          <span className="text-xs text-ink-3 bg-cream-2 rounded-full px-2.5 py-1">
            {backlinks?.calculated_at
              ? `Updated ${new Date(backlinks.calculated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
              : 'Not synced'}
          </span>
        </div>
        {!backlinks ? (
          <p className="text-sm text-ink-3">Sync to see backlink data.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-cream px-4 py-3">
              <p className="text-[10px] font-data uppercase tracking-wider text-ink-3">Total Backlinks</p>
              <p className="mt-1 font-display text-xl font-semibold text-ink">{fmtK(backlinks.total_backlinks)}</p>
            </div>
            <div className="rounded-xl bg-cream px-4 py-3">
              <p className="text-[10px] font-data uppercase tracking-wider text-ink-3">Referring Domains</p>
              <p className="mt-1 font-display text-xl font-semibold text-ink">{fmtK(backlinks.referring_domains)}</p>
            </div>
            <div className="rounded-xl bg-cream px-4 py-3">
              <p className="text-[10px] font-data uppercase tracking-wider text-ink-3">Authority Score</p>
              <p className="mt-1 font-display text-xl font-semibold text-ink">
                {backlinks.authority_score ?? '—'}
              </p>
              {backlinks.authority_score && (
                <p className="text-[10px] text-ink-3 mt-0.5">
                  {backlinks.authority_score >= 61 ? 'High' : backlinks.authority_score >= 31 ? 'Medium' : 'Low'} authority
                </p>
              )}
            </div>
          </div>
        )}
        <p className="mt-3 text-xs text-ink-3">
          Need deeper backlink analysis?{' '}
          <span className="text-ink">Connect Ahrefs for detailed link-by-link breakdown.</span>
        </p>
      </section>

    </div>
  )
}

// ── Small components ──────────────────────────────────────────────────────────

function SyncButton({ syncing, error, onSync }: { syncing: boolean; error: string | null; onSync: () => void }) {
  return (
    <button
      onClick={onSync}
      disabled={syncing}
      className="flex items-center gap-2 rounded-xl border border-cream-3 bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-cream disabled:opacity-50 transition shadow-sm"
    >
      {syncing ? (
        <>
          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-cream-3 border-t-ink" />
          Syncing…
        </>
      ) : (
        <>
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M13.5 2.5A6.5 6.5 0 1 1 7 1M13.5 2.5V6M13.5 2.5H10" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Sync Now
        </>
      )}
    </button>
  )
}

function CompetitionBar({ level }: { level: number }) {
  const pct = Math.round(level * 100)
  const color = pct >= 70 ? '#EF4444' : pct >= 40 ? '#F59E0B' : '#0D9B8A'
  return (
    <div className="flex flex-col items-end gap-1">
      <span className="text-[10px] text-ink-3">{pct}% overlap</span>
      <div className="h-1.5 w-16 rounded-full bg-cream-2 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

function OpportunityBadge({ score }: { score: number }) {
  const cls =
    score >= 70 ? 'bg-teal-pale text-teal-deep' :
    score >= 40 ? 'bg-yellow-50 text-yellow-700' :
    'bg-cream-2 text-ink-3'
  return (
    <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>
      {score}
    </span>
  )
}
