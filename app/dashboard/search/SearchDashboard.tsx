'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface Keyword {
  query: string
  clicks: number
  impressions: number
  ctr: number | null
  position: number | null
}

interface Page {
  page: string
  clicks: number
  impressions: number
  ctr: number | null
  position: number | null
  clicks_prior: number
}

interface MonthlyClick {
  month: string
  clicks: number
  impressions: number
}

interface Props {
  connected: boolean
  propertyUrl: string | null
  keywords: Keyword[]
  pages: Page[]
  monthlyClicks: MonthlyClick[]
}

function pct(v: number | null) {
  if (v == null) return '—'
  return `${(v * 100).toFixed(1)}%`
}

function pos(v: number | null) {
  if (v == null) return '—'
  return v.toFixed(1)
}

// ── SVG line chart for monthly clicks ────────────────────────────────────────

function MonthlyChart({ data }: { data: MonthlyClick[] }) {
  if (data.length < 2) return <p className="text-xs text-ink-3 py-4 text-center">Not enough data yet</p>

  const W = 600
  const H = 120
  const pad = { top: 10, right: 16, bottom: 28, left: 48 }
  const chartW = W - pad.left - pad.right
  const chartH = H - pad.top - pad.bottom

  const maxClicks = Math.max(...data.map(d => d.clicks), 1)
  const points = data.map((d, i) => ({
    x: pad.left + (i / (data.length - 1)) * chartW,
    y: pad.top + (1 - d.clicks / maxClicks) * chartH,
    month: d.month,
    clicks: d.clicks,
  }))

  const polyline = points.map(p => `${p.x},${p.y}`).join(' ')
  const area = [
    `M${points[0].x},${pad.top + chartH}`,
    ...points.map(p => `L${p.x},${p.y}`),
    `L${points[points.length - 1].x},${pad.top + chartH}`,
    'Z',
  ].join(' ')

  // Y-axis labels
  const yTicks = [0, 0.5, 1].map(t => ({
    y: pad.top + (1 - t) * chartH,
    label: Math.round(maxClicks * t).toLocaleString(),
  }))

  // X-axis: show every other month
  const xLabels = points.filter((_, i) => i % Math.ceil(points.length / 6) === 0 || i === points.length - 1)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 140 }}>
      <defs>
        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4BBFAD" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#4BBFAD" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Grid lines */}
      {yTicks.map((t, i) => (
        <g key={i}>
          <line x1={pad.left} y1={t.y} x2={W - pad.right} y2={t.y} stroke="#E8E5DF" strokeWidth="1" />
          <text x={pad.left - 6} y={t.y + 4} textAnchor="end" fontSize="9" fill="#9B9590">{t.label}</text>
        </g>
      ))}

      {/* Area fill */}
      <path d={area} fill="url(#chartGrad)" />

      {/* Line */}
      <polyline points={polyline} fill="none" stroke="#4BBFAD" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

      {/* Data points */}
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3" fill="#4BBFAD" stroke="white" strokeWidth="1.5" />
      ))}

      {/* X-axis labels */}
      {xLabels.map((p, i) => (
        <text key={i} x={p.x} y={H - 6} textAnchor="middle" fontSize="9" fill="#9B9590">
          {new Date(p.month + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}
        </text>
      ))}
    </svg>
  )
}

// ── Not connected empty state ─────────────────────────────────────────────────

function NotConnected() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="mb-4 h-12 w-12 rounded-2xl bg-cream-2 flex items-center justify-center">
        <svg className="h-6 w-6 text-ink-3" viewBox="0 0 24 24" fill="currentColor">
          <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
        </svg>
      </div>
      <h3 className="font-display text-lg font-semibold text-ink mb-2">Connect Google Search Console</h3>
      <p className="text-sm text-ink-3 max-w-sm mb-6">
        See which keywords drive traffic, track click trends, and find pages losing ground in search.
      </p>
      <Link
        href="/dashboard/integrations"
        className="inline-flex items-center rounded-xl bg-teal px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-dark transition"
      >
        Set up integration →
      </Link>
    </div>
  )
}

// ── Main dashboard ────────────────────────────────────────────────────────────

export default function SearchDashboard({ connected, propertyUrl, keywords, pages, monthlyClicks }: Props) {
  const router = useRouter()
  const [syncing, setSyncing] = useState(false)
  const [activeTab, setActiveTab] = useState<'keywords' | 'pages'>('keywords')

  if (!connected) return <NotConnected />

  // KPI calculations
  const total90d = monthlyClicks.slice(-3).reduce((s, m) => s + m.clicks, 0)
  const prior90d = monthlyClicks.slice(-6, -3).reduce((s, m) => s + m.clicks, 0)
  const clickDelta = prior90d > 0 ? ((total90d - prior90d) / prior90d) * 100 : 0
  const totalImpressions = monthlyClicks.slice(-3).reduce((s, m) => s + m.impressions, 0)
  const avgCTR = keywords.length > 0
    ? keywords.reduce((s, k) => s + (k.ctr ?? 0), 0) / keywords.filter(k => k.ctr != null).length
    : 0
  const avgPosition = keywords.filter(k => k.position != null).length > 0
    ? keywords.reduce((s, k) => s + (k.position ?? 0), 0) / keywords.filter(k => k.position != null).length
    : 0

  // Pages losing most traffic
  const losingPages = [...pages]
    .filter(p => p.clicks_prior > p.clicks && p.clicks_prior > 10)
    .sort((a, b) => (b.clicks_prior - b.clicks) - (a.clicks_prior - a.clicks))
    .slice(0, 10)

  async function handleSync() {
    setSyncing(true)
    await fetch('/api/gsc/sync', { method: 'POST' })
    router.refresh()
    setSyncing(false)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-[#4285F4]/10 flex items-center justify-center">
            <svg className="h-4 w-4 text-[#4285F4]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
            </svg>
          </div>
          <span className="font-display text-base font-semibold text-ink">Search Console</span>
          {propertyUrl && <span className="font-data text-xs text-ink-3 truncate max-w-[200px]">{propertyUrl}</span>}
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-1.5 rounded-xl border border-cream-3 bg-white px-3 py-1.5 text-xs font-medium text-ink-2 hover:bg-cream transition disabled:opacity-50"
        >
          <svg className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4 2a1 1 0 0 1 1 1v2.101a7.002 7.002 0 0 1 11.601 2.566 1 1 0 1 1-1.885.666A5.002 5.002 0 0 0 5.999 7H9a1 1 0 0 1 0 2H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zm.008 9.057a1 1 0 0 1 1.276.61A5.002 5.002 0 0 0 14.001 13H11a1 1 0 1 1 0-2h5a1 1 0 0 1 1 1v5a1 1 0 1 1-2 0v-2.101a7.002 7.002 0 0 1-11.601-2.566 1 1 0 0 1 .61-1.276z" clipRule="evenodd" />
          </svg>
          {syncing ? 'Syncing…' : 'Sync'}
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          {
            label: 'Clicks (90 days)',
            value: total90d.toLocaleString(),
            sub: prior90d > 0
              ? `${clickDelta >= 0 ? '+' : ''}${clickDelta.toFixed(1)}% vs prior 90d`
              : 'vs prior period',
            positive: clickDelta >= 0,
          },
          { label: 'Impressions (90d)', value: totalImpressions.toLocaleString(), sub: 'search appearances' },
          { label: 'Avg CTR', value: pct(avgCTR || null), sub: 'across top keywords' },
          {
            label: 'Avg Position',
            value: avgPosition > 0 ? avgPosition.toFixed(1) : '—',
            sub: 'top keywords',
            positive: avgPosition > 0 && avgPosition <= 10,
          },
        ].map((card) => (
          <div key={card.label} className="rounded-2xl border border-cream-3 bg-white px-5 py-4 shadow-sm">
            <p className="font-data text-xs uppercase tracking-wider text-ink-3">{card.label}</p>
            <p className="mt-1 font-display text-2xl font-semibold text-ink">{card.value}</p>
            <p className={`mt-0.5 font-data text-xs ${card.positive === false ? 'text-red-500' : card.positive ? 'text-teal-deep' : 'text-ink-3'}`}>
              {card.sub}
            </p>
          </div>
        ))}
      </div>

      {/* Monthly click trend */}
      <section className="rounded-2xl border border-cream-3 bg-white p-5 shadow-sm">
        <h2 className="font-display text-sm font-semibold text-ink mb-3">Monthly Clicks (12 months)</h2>
        <MonthlyChart data={monthlyClicks} />
      </section>

      {/* Keywords / Pages tabs */}
      <section className="rounded-2xl border border-cream-3 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center gap-1 border-b border-cream-2 px-4 pt-3">
          {(['keywords', 'pages'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === tab
                  ? 'bg-white border border-b-white border-cream-2 -mb-px text-ink'
                  : 'text-ink-3 hover:text-ink-2'
              }`}
            >
              {tab === 'keywords' ? `Keywords (${keywords.length})` : `Pages (${pages.length})`}
            </button>
          ))}
        </div>

        {/* Keywords tab */}
        {activeTab === 'keywords' && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-cream-2 text-xs font-medium text-ink-3">
                  <th className="px-5 py-2.5 text-left">Query</th>
                  <th className="px-5 py-2.5 text-right">Clicks</th>
                  <th className="px-5 py-2.5 text-right">Impressions</th>
                  <th className="px-5 py-2.5 text-right">CTR</th>
                  <th className="px-5 py-2.5 text-right">Position</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-2">
                {keywords.map((k) => (
                  <tr key={k.query} className="hover:bg-cream transition-colors">
                    <td className="px-5 py-3 font-medium text-ink max-w-[300px]">
                      <span className="truncate block">{k.query}</span>
                    </td>
                    <td className="px-5 py-3 font-data text-xs text-right font-medium text-ink">{k.clicks.toLocaleString()}</td>
                    <td className="px-5 py-3 font-data text-xs text-right text-ink-2">{k.impressions.toLocaleString()}</td>
                    <td className="px-5 py-3 font-data text-xs text-right text-ink-2">{pct(k.ctr)}</td>
                    <td className="px-5 py-3 font-data text-xs text-right">
                      <span className={`font-semibold ${(k.position ?? 99) <= 10 ? 'text-teal-deep' : (k.position ?? 99) <= 20 ? 'text-amber-600' : 'text-ink-3'}`}>
                        {pos(k.position)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pages tab */}
        {activeTab === 'pages' && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-cream-2 text-xs font-medium text-ink-3">
                  <th className="px-5 py-2.5 text-left">Page</th>
                  <th className="px-5 py-2.5 text-right">Clicks (90d)</th>
                  <th className="px-5 py-2.5 text-right">Impressions</th>
                  <th className="px-5 py-2.5 text-right">CTR</th>
                  <th className="px-5 py-2.5 text-right">Position</th>
                  <th className="px-5 py-2.5 text-right">vs Prior 90d</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-2">
                {pages.map((p) => {
                  const delta = p.clicks - p.clicks_prior
                  const isLosing = delta < 0 && p.clicks_prior > 10
                  return (
                    <tr key={p.page} className={`transition-colors ${isLosing ? 'bg-red-50/50 hover:bg-red-50' : 'hover:bg-cream'}`}>
                      <td className="px-5 py-3 font-medium text-ink max-w-[300px]">
                        <a href={p.page} target="_blank" rel="noopener noreferrer" className="truncate block hover:text-teal-deep transition" title={p.page}>
                          {p.page.replace(/^https?:\/\/[^/]+/, '') || '/'}
                        </a>
                      </td>
                      <td className="px-5 py-3 font-data text-xs text-right font-medium text-ink">{p.clicks.toLocaleString()}</td>
                      <td className="px-5 py-3 font-data text-xs text-right text-ink-2">{p.impressions.toLocaleString()}</td>
                      <td className="px-5 py-3 font-data text-xs text-right text-ink-2">{pct(p.ctr)}</td>
                      <td className="px-5 py-3 font-data text-xs text-right">
                        <span className={`font-semibold ${(p.position ?? 99) <= 10 ? 'text-teal-deep' : 'text-ink-3'}`}>
                          {pos(p.position)}
                        </span>
                      </td>
                      <td className="px-5 py-3 font-data text-xs text-right">
                        {p.clicks_prior > 0 ? (
                          <span className={`font-semibold ${delta >= 0 ? 'text-teal-deep' : 'text-red-500'}`}>
                            {delta >= 0 ? '+' : ''}{delta.toLocaleString()}
                          </span>
                        ) : <span className="text-ink-3">—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Pages losing traffic */}
      {losingPages.length > 0 && (
        <section className="rounded-2xl border border-red-200 bg-red-50/50 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <svg className="h-4 w-4 text-red-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm-1-8a1 1 0 0 0-1 1v3a1 1 0 0 0 2 0V6a1 1 0 0 0-1-1z" clipRule="evenodd" />
            </svg>
            <h2 className="font-display text-sm font-semibold text-red-700">Pages Losing Traffic</h2>
            <span className="font-data text-xs text-red-500">{losingPages.length} pages down vs prior 90 days</span>
          </div>
          <div className="space-y-2">
            {losingPages.map((p) => {
              const drop = p.clicks_prior - p.clicks
              const dropPct = ((drop / p.clicks_prior) * 100).toFixed(0)
              return (
                <div key={p.page} className="flex items-center justify-between rounded-xl bg-white border border-red-100 px-4 py-3">
                  <a href={p.page} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-ink hover:text-red-600 transition truncate max-w-[400px]" title={p.page}>
                    {p.page.replace(/^https?:\/\/[^/]+/, '') || '/'}
                  </a>
                  <div className="flex items-center gap-4 shrink-0 ml-4">
                    <span className="font-data text-xs text-ink-3">{p.clicks_prior.toLocaleString()} → {p.clicks.toLocaleString()}</span>
                    <span className="font-data text-sm font-semibold text-red-500">−{dropPct}%</span>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
