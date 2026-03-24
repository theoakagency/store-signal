'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// ── Types ─────────────────────────────────────────────────────────────────────

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

export interface GscInsight {
  category: 'Quick Win' | 'CTR Opportunity' | 'Traffic Loss' | 'Content Gap' | 'Technical'
  title: string
  description: string
  action: string
  impact: 'Low' | 'Medium' | 'High'
}

interface Props {
  connected: boolean
  propertyUrl: string | null
  keywords: Keyword[]
  pages: Page[]
  monthlyClicks: MonthlyClick[]
  cachedInsights: GscInsight[] | null
  insightsCalculatedAt: string | null
}

// ── Formatters ────────────────────────────────────────────────────────────────

function pct(v: number | null) {
  if (v == null) return '—'
  return `${(v * 100).toFixed(1)}%`
}

function pos(v: number | null) {
  if (v == null) return '—'
  return v.toFixed(1)
}

function relUrl(url: string) {
  return url.replace(/^https?:\/\/[^/]+/, '') || '/'
}

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

// ── Health score ──────────────────────────────────────────────────────────────

function calculateHealthScore(keywords: Keyword[], monthlyClicks: MonthlyClick[]) {
  const total90d = monthlyClicks.slice(-3).reduce((s, m) => s + m.clicks, 0)
  const prior90d = monthlyClicks.slice(-6, -3).reduce((s, m) => s + m.clicks, 0)
  const clickDelta = prior90d > 0 ? (total90d - prior90d) / prior90d : 0
  // 30 pts: +30 at ≥20% growth, +0 at ≤-50% decline
  const clickScore = Math.round(Math.max(0, Math.min(30, 15 + clickDelta * 50)))

  const kwWithCtr = keywords.filter((k) => k.ctr != null)
  const avgCTR = kwWithCtr.length > 0
    ? kwWithCtr.reduce((s, k) => s + (k.ctr ?? 0), 0) / kwWithCtr.length : 0
  // 25 pts: benchmark 3% CTR for ecommerce
  const ctrScore = Math.round(Math.min(25, (avgCTR / 0.03) * 25))

  const kwWithPos = keywords.filter((k) => k.position != null)
  const top10Count = kwWithPos.filter((k) => (k.position ?? 99) <= 10).length
  // 25 pts: % of keywords in top 10
  const posScore = kwWithPos.length > 0 ? Math.round((top10Count / kwWithPos.length) * 25) : 0

  const quickWinCount = kwWithPos.filter((k) => {
    const p = k.position ?? 99
    return p >= 4 && p <= 10
  }).length
  // 20 pts: up to 5 quick wins = full 20 pts
  const quickWinScore = Math.min(20, quickWinCount * 4)

  const total = Math.min(100, clickScore + ctrScore + posScore + quickWinScore)
  const color = total >= 70 ? '#4BBFAD' : total >= 40 ? '#F59E0B' : '#EF4444'
  const label =
    clickDelta < -0.2 ? 'Traffic declining — focus on quick wins' :
    total >= 70 ? 'Strong organic presence' :
    avgCTR < 0.02 ? 'Good visibility, CTR needs improvement' :
    top10Count / Math.max(kwWithPos.length, 1) < 0.3 ? 'Rankings need strengthening' :
    'Moderate health — opportunities available'

  return {
    total, color, label, clickDelta, avgCTR, quickWinCount,
    components: [
      { label: 'Click Trend', score: clickScore, max: 30 },
      { label: 'CTR Health', score: ctrScore, max: 25 },
      { label: 'Position Health', score: posScore, max: 25 },
      { label: 'Quick Win Potential', score: quickWinScore, max: 20 },
    ],
  }
}

// ── Potential click gain estimator ────────────────────────────────────────────

function estimatePotentialGain(kw: Keyword): number {
  if (kw.position == null || kw.position < 4 || kw.position > 10) return 0
  // Target: position 3 (~11% CTR)
  const targetCTR = 0.11
  const currentCTR = kw.ctr ?? 0
  return Math.max(0, Math.round((targetCTR - currentCTR) * kw.impressions))
}

// ── SVG ring ──────────────────────────────────────────────────────────────────

function HealthScoreRing({ score, color }: { score: number; color: string }) {
  const r = 40; const cx = 56; const cy = 56; const stroke = 9
  const circumference = 2 * Math.PI * r
  const progress = (score / 100) * circumference
  return (
    <svg width={112} height={112} viewBox="0 0 112 112" className="shrink-0">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#E8E5DF" strokeWidth={stroke} />
      <circle
        cx={cx} cy={cy} r={r} fill="none"
        stroke={color} strokeWidth={stroke}
        strokeDasharray={`${progress} ${circumference}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      <text x={cx} y={cy - 2} textAnchor="middle" fontSize="22" fontWeight="700" fill={color}>{score}</text>
      <text x={cx} y={cy + 14} textAnchor="middle" fontSize="9" fill="#9B9590">/ 100</text>
    </svg>
  )
}

// ── Monthly chart (unchanged) ─────────────────────────────────────────────────

function MonthlyChart({ data }: { data: MonthlyClick[] }) {
  if (data.length < 2) return <p className="text-xs text-ink-3 py-4 text-center">Not enough data yet</p>
  const W = 600; const H = 120
  const pad = { top: 10, right: 16, bottom: 28, left: 48 }
  const chartW = W - pad.left - pad.right
  const chartH = H - pad.top - pad.bottom
  const maxClicks = Math.max(...data.map((d) => d.clicks), 1)
  const points = data.map((d, i) => ({
    x: pad.left + (i / (data.length - 1)) * chartW,
    y: pad.top + (1 - d.clicks / maxClicks) * chartH,
    month: d.month,
    clicks: d.clicks,
  }))
  const polyline = points.map((p) => `${p.x},${p.y}`).join(' ')
  const area = [
    `M${points[0].x},${pad.top + chartH}`,
    ...points.map((p) => `L${p.x},${p.y}`),
    `L${points[points.length - 1].x},${pad.top + chartH}`, 'Z',
  ].join(' ')
  const yTicks = [0, 0.5, 1].map((t) => ({
    y: pad.top + (1 - t) * chartH,
    label: Math.round(maxClicks * t).toLocaleString(),
  }))
  const xLabels = points.filter((_, i) => i % Math.ceil(points.length / 6) === 0 || i === points.length - 1)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 140 }}>
      <defs>
        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4BBFAD" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#4BBFAD" stopOpacity="0" />
        </linearGradient>
      </defs>
      {yTicks.map((t, i) => (
        <g key={i}>
          <line x1={pad.left} y1={t.y} x2={W - pad.right} y2={t.y} stroke="#E8E5DF" strokeWidth="1" />
          <text x={pad.left - 6} y={t.y + 4} textAnchor="end" fontSize="9" fill="#9B9590">{t.label}</text>
        </g>
      ))}
      <path d={area} fill="url(#chartGrad)" />
      <polyline points={polyline} fill="none" stroke="#4BBFAD" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="3" fill="#4BBFAD" stroke="white" strokeWidth="1.5" />)}
      {xLabels.map((p, i) => (
        <text key={i} x={p.x} y={H - 6} textAnchor="middle" fontSize="9" fill="#9B9590">
          {new Date(p.month + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}
        </text>
      ))}
    </svg>
  )
}

// ── Insight card ──────────────────────────────────────────────────────────────

const INSIGHT_COLORS: Record<GscInsight['category'], { border: string; badge: string; dot: string }> = {
  'Quick Win':        { border: 'border-teal',     badge: 'bg-teal-pale text-teal-deep',    dot: 'bg-teal' },
  'CTR Opportunity':  { border: 'border-sky-400',   badge: 'bg-sky-50 text-sky-700',         dot: 'bg-sky-400' },
  'Traffic Loss':     { border: 'border-red-400',   badge: 'bg-red-50 text-red-700',         dot: 'bg-red-400' },
  'Content Gap':      { border: 'border-amber-400', badge: 'bg-amber-50 text-amber-700',     dot: 'bg-amber-400' },
  'Technical':        { border: 'border-slate-400', badge: 'bg-slate-100 text-slate-600',    dot: 'bg-slate-400' },
}

const IMPACT_COLORS: Record<GscInsight['impact'], string> = {
  High:   'bg-red-50 text-red-600',
  Medium: 'bg-amber-50 text-amber-700',
  Low:    'bg-slate-100 text-slate-500',
}

function InsightCard({ insight }: { insight: GscInsight }) {
  const c = INSIGHT_COLORS[insight.category] ?? INSIGHT_COLORS['Technical']
  return (
    <div className={`rounded-xl border-l-4 ${c.border} bg-white border border-cream-3 px-5 py-4 shadow-sm`}>
      <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${c.badge}`}>{insight.category}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${IMPACT_COLORS[insight.impact]}`}>
            {insight.impact} impact
          </span>
        </div>
      </div>
      <h4 className="font-display text-sm font-semibold text-ink leading-snug mb-1.5">{insight.title}</h4>
      <p className="text-xs text-ink-2 leading-relaxed mb-2">{insight.description}</p>
      <div className="flex items-start gap-1.5">
        <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${c.dot}`} />
        <p className="text-xs font-medium text-ink-2 leading-relaxed">{insight.action}</p>
      </div>
    </div>
  )
}

// ── Not connected ─────────────────────────────────────────────────────────────

function NotConnected() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="mb-4 h-12 w-12 rounded-2xl bg-cream-2 flex items-center justify-center">
        <svg className="h-6 w-6 text-ink-3" viewBox="0 0 24 24" fill="currentColor">
          <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
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

export default function SearchDashboard({
  connected, propertyUrl, keywords, pages, monthlyClicks,
  cachedInsights, insightsCalculatedAt,
}: Props) {
  const router = useRouter()
  const [syncing, setSyncing] = useState(false)
  const [activeTab, setActiveTab] = useState<'keywords' | 'opportunities' | 'pages'>('keywords')
  const [insights, setInsights] = useState<GscInsight[]>(cachedInsights ?? [])
  const [insightsState, setInsightsState] = useState<'idle' | 'loading' | 'done' | 'error'>(
    cachedInsights && cachedInsights.length > 0 ? 'done' : 'idle'
  )
  const [insightsTs, setInsightsTs] = useState<string | null>(insightsCalculatedAt)
  const [diagnosing, setDiagnosing] = useState<Record<string, 'idle' | 'loading' | 'done' | 'error'>>({})
  const [diagnoses, setDiagnoses] = useState<Record<string, { diagnosis: string; action: string }>>({})

  if (!connected) return <NotConnected />

  // ── Computed values ────────────────────────────────────────────────────────
  const total90d = monthlyClicks.slice(-3).reduce((s, m) => s + m.clicks, 0)
  const prior90d = monthlyClicks.slice(-6, -3).reduce((s, m) => s + m.clicks, 0)
  const clickDelta = prior90d > 0 ? ((total90d - prior90d) / prior90d) * 100 : 0
  const totalImpressions = monthlyClicks.slice(-3).reduce((s, m) => s + m.impressions, 0)

  const kwWithCtr = keywords.filter((k) => k.ctr != null)
  const avgCTR = kwWithCtr.length > 0
    ? kwWithCtr.reduce((s, k) => s + (k.ctr ?? 0), 0) / kwWithCtr.length : 0
  const kwWithPos = keywords.filter((k) => k.position != null)
  const avgPosition = kwWithPos.length > 0
    ? kwWithPos.reduce((s, k) => s + (k.position ?? 0), 0) / kwWithPos.length : 0

  // Opportunity lists
  const quickWinKeywords = kwWithPos
    .filter((k) => { const p = k.position ?? 99; return p >= 4 && p <= 10 })
    .sort((a, b) => b.impressions - a.impressions)
  const lowCtrKeywords = keywords
    .filter((k) => k.impressions > 100 && (k.ctr ?? 1) < 0.02)
    .sort((a, b) => b.impressions - a.impressions)

  // Pages losing traffic
  const losingPages = [...pages]
    .filter((p) => p.clicks_prior > p.clicks && p.clicks_prior > 10)
    .sort((a, b) => (b.clicks_prior - b.clicks) - (a.clicks_prior - a.clicks))

  // Branded vs non-branded
  const BRANDED = ['lashbox', 'lash box', 'lbla', 'lash box la']
  const brandedKws = keywords.filter((k) => BRANDED.some((t) => k.query.toLowerCase().includes(t)))
  const brandedClicks = brandedKws.reduce((s, k) => s + k.clicks, 0)
  const allClicks = keywords.reduce((s, k) => s + k.clicks, 0)
  const nonBrandedClicks = allClicks - brandedClicks
  const brandedPct = allClicks > 0 ? brandedClicks / allClicks : 0

  // Health score
  const health = calculateHealthScore(keywords, monthlyClicks)

  // ── Actions ────────────────────────────────────────────────────────────────
  async function handleSync() {
    setSyncing(true)
    await fetch('/api/gsc/sync', { method: 'POST' })
    router.refresh()
    setSyncing(false)
  }

  async function loadInsights() {
    setInsightsState('loading')
    try {
      const res = await fetch('/api/gsc/insights', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setInsights(data.insights ?? [])
      setInsightsTs(data.calculated_at ?? null)
      setInsightsState('done')
    } catch {
      setInsightsState('error')
    }
  }

  async function diagnose(pageUrl: string) {
    setDiagnosing((prev) => ({ ...prev, [pageUrl]: 'loading' }))
    try {
      const res = await fetch('/api/gsc/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page: pageUrl }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setDiagnoses((prev) => ({ ...prev, [pageUrl]: data }))
      setDiagnosing((prev) => ({ ...prev, [pageUrl]: 'done' }))
    } catch {
      setDiagnosing((prev) => ({ ...prev, [pageUrl]: 'error' }))
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── SECTION 4: Search Health Score ─────────────────────────────── */}
      <section className="rounded-2xl border border-cream-3 bg-white shadow-sm overflow-hidden">
        <div className="flex flex-col sm:flex-row items-start gap-5 p-5">
          <HealthScoreRing score={health.total} color={health.color} />
          <div className="flex-1 min-w-0">
            <p className="font-data text-xs uppercase tracking-wider text-ink-3 mb-0.5">Search Health Score</p>
            <h2 className="font-display text-xl font-semibold text-ink mb-1">{health.label}</h2>
            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
              {health.components.map((c) => (
                <div key={c.label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-data text-xs text-ink-3">{c.label}</span>
                    <span className="font-data text-xs font-semibold text-ink">{c.score}/{c.max}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-cream-2 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${(c.score / c.max) * 100}%`,
                        backgroundColor: health.color,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-[#4285F4]/10 flex items-center justify-center">
            <svg className="h-4 w-4 text-[#4285F4]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
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

      {/* ── KPI cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          {
            label: 'Clicks (90 days)',
            value: total90d.toLocaleString(),
            sub: prior90d > 0 ? `${clickDelta >= 0 ? '+' : ''}${clickDelta.toFixed(1)}% vs prior 90d` : 'vs prior period',
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

      {/* ── Monthly chart ───────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-cream-3 bg-white p-5 shadow-sm">
        <h2 className="font-display text-sm font-semibold text-ink mb-3">Monthly Clicks (12 months)</h2>
        <MonthlyChart data={monthlyClicks} />
      </section>

      {/* ── SECTION 1: AI Insights Panel ────────────────────────────────── */}
      <section className="rounded-2xl border border-cream-3 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-cream-2">
          <div>
            <h2 className="font-display text-base font-semibold text-ink">Search Intelligence</h2>
            {insightsTs && insightsState === 'done' && (
              <p className="font-data text-xs text-ink-3 mt-0.5">Last analyzed {timeAgo(insightsTs)}</p>
            )}
          </div>
          {insightsState === 'done' && (
            <button
              onClick={loadInsights}
              className="text-xs font-medium text-teal hover:text-teal-dark transition"
            >
              Refresh Analysis
            </button>
          )}
        </div>

        <div className="p-5">
          {insightsState === 'idle' && (
            <button
              onClick={loadInsights}
              className="w-full rounded-xl border border-dashed border-cream-3 bg-cream px-5 py-6 text-center hover:bg-cream-2 transition"
            >
              <p className="font-semibold text-sm text-teal-deep mb-1">Generate AI Search Analysis →</p>
              <p className="text-xs text-ink-3">Claude analyzes your keyword data and identifies quick wins, CTR opportunities, and traffic loss patterns</p>
            </button>
          )}

          {insightsState === 'loading' && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="rounded-xl border border-cream-3 bg-white p-4 shadow-sm space-y-2">
                  <div className="flex gap-2">
                    <div className="skeleton h-5 w-20 rounded-full" />
                    <div className="skeleton h-5 w-14 rounded-full" />
                  </div>
                  <div className="skeleton h-4 w-3/4" />
                  <div className="skeleton h-3 w-full" />
                  <div className="skeleton h-3 w-5/6" />
                  <div className="skeleton h-3 w-2/3" />
                </div>
              ))}
            </div>
          )}

          {insightsState === 'done' && insights.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {insights.map((ins, i) => <InsightCard key={i} insight={ins} />)}
            </div>
          )}

          {insightsState === 'error' && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 flex items-start gap-3">
              <svg className="h-4 w-4 text-red-500 mt-0.5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM8.28 7.22a.75.75 0 0 0-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 1 0 1.06 1.06L10 11.06l1.72 1.72a.75.75 0 1 0 1.06-1.06L11.06 10l1.72-1.72a.75.75 0 0 0-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
              </svg>
              <div>
                <p className="text-sm font-medium text-red-700">Analysis failed</p>
                <p className="text-xs text-red-600 mt-0.5">Check your ANTHROPIC_API_KEY is set.</p>
                <button onClick={loadInsights} className="mt-2 text-xs font-medium text-red-700 underline">Try again</button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── SECTION 2+3: Keyword / Opportunity / Pages tabs ─────────────── */}
      <section className="rounded-2xl border border-cream-3 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center gap-1 border-b border-cream-2 px-4 pt-3 overflow-x-auto">
          {(['keywords', 'opportunities', 'pages'] as const).map((tab) => {
            const labels = {
              keywords: `Keywords (${keywords.length})`,
              opportunities: `Opportunities (${quickWinKeywords.length + lowCtrKeywords.length})`,
              pages: `Pages (${pages.length})`,
            }
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${
                  activeTab === tab
                    ? 'bg-white border border-b-white border-cream-2 -mb-px text-ink'
                    : 'text-ink-3 hover:text-ink-2'
                }`}
              >
                {labels[tab]}
              </button>
            )
          })}
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

        {/* Opportunities tab */}
        {activeTab === 'opportunities' && (
          <div>
            {/* Position 4-10 — Quick Wins */}
            <div className="border-b border-cream-2">
              <div className="flex items-center gap-2 px-5 py-3 bg-teal-pale/40">
                <span className="h-2 w-2 rounded-full bg-teal shrink-0" />
                <h3 className="font-display text-sm font-semibold text-teal-deep">Position 4–10 Quick Wins</h3>
                <span className="font-data text-xs text-ink-3 ml-auto">Estimated gain if moved to position 3 (~11% CTR)</span>
              </div>
              {quickWinKeywords.length === 0 ? (
                <p className="px-5 py-6 text-sm text-ink-3 text-center">No position 4–10 keywords found</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-cream-2 text-xs font-medium text-ink-3">
                        <th className="px-5 py-2.5 text-left">Keyword</th>
                        <th className="px-5 py-2.5 text-right">Position</th>
                        <th className="px-5 py-2.5 text-right">Clicks</th>
                        <th className="px-5 py-2.5 text-right">Impressions</th>
                        <th className="px-5 py-2.5 text-right">CTR</th>
                        <th className="px-5 py-2.5 text-right">Potential Gain</th>
                        <th className="px-5 py-2.5 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-cream-2">
                      {quickWinKeywords.map((k) => {
                        const gain = estimatePotentialGain(k)
                        return (
                          <tr key={k.query} className="hover:bg-cream transition-colors">
                            <td className="px-5 py-3 font-medium text-ink max-w-[240px]">
                              <span className="truncate block">{k.query}</span>
                            </td>
                            <td className="px-5 py-3 font-data text-xs text-right">
                              <span className="font-semibold text-amber-600">{pos(k.position)}</span>
                            </td>
                            <td className="px-5 py-3 font-data text-xs text-right text-ink-2">{k.clicks.toLocaleString()}</td>
                            <td className="px-5 py-3 font-data text-xs text-right text-ink-2">{k.impressions.toLocaleString()}</td>
                            <td className="px-5 py-3 font-data text-xs text-right text-ink-2">{pct(k.ctr)}</td>
                            <td className="px-5 py-3 font-data text-xs text-right">
                              {gain > 0 ? (
                                <span className="font-semibold text-teal-deep">+{gain.toLocaleString()} clicks/mo</span>
                              ) : <span className="text-ink-3">—</span>}
                            </td>
                            <td className="px-5 py-3 text-center">
                              <span className="rounded-full bg-teal-pale px-2 py-0.5 text-xs font-semibold text-teal-deep">Optimize</span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* High Impression / Low CTR */}
            <div>
              <div className="flex items-center gap-2 px-5 py-3 bg-amber-50/60">
                <span className="h-2 w-2 rounded-full bg-amber-400 shrink-0" />
                <h3 className="font-display text-sm font-semibold text-amber-700">High Impression / Low CTR</h3>
                <span className="font-data text-xs text-ink-3 ml-auto">Impressions &gt; 100, CTR &lt; 2% — title or meta description opportunity</span>
              </div>
              {lowCtrKeywords.length === 0 ? (
                <p className="px-5 py-6 text-sm text-ink-3 text-center">No low-CTR keywords found</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-cream-2 text-xs font-medium text-ink-3">
                        <th className="px-5 py-2.5 text-left">Keyword</th>
                        <th className="px-5 py-2.5 text-right">Impressions</th>
                        <th className="px-5 py-2.5 text-right">Current CTR</th>
                        <th className="px-5 py-2.5 text-right">Benchmark CTR</th>
                        <th className="px-5 py-2.5 text-right">Position</th>
                        <th className="px-5 py-2.5 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-cream-2">
                      {lowCtrKeywords.map((k) => (
                        <tr key={k.query} className="hover:bg-cream transition-colors">
                          <td className="px-5 py-3 font-medium text-ink max-w-[240px]">
                            <span className="truncate block">{k.query}</span>
                          </td>
                          <td className="px-5 py-3 font-data text-xs text-right text-ink-2">{k.impressions.toLocaleString()}</td>
                          <td className="px-5 py-3 font-data text-xs text-right">
                            <span className="font-semibold text-red-500">{pct(k.ctr)}</span>
                          </td>
                          <td className="px-5 py-3 font-data text-xs text-right text-teal-deep">3.0%</td>
                          <td className="px-5 py-3 font-data text-xs text-right text-ink-2">{pos(k.position)}</td>
                          <td className="px-5 py-3 text-center">
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">Fix Meta</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Pages tab */}
        {activeTab === 'pages' && (
          <>
            {/* Top 5 losing pages with Diagnose */}
            {losingPages.length > 0 && (
              <div className="border-b border-red-100 bg-red-50/40">
                <div className="flex items-center gap-2 px-5 py-3">
                  <svg className="h-4 w-4 text-red-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm-1-8a1 1 0 0 0-1 1v3a1 1 0 0 0 2 0V6a1 1 0 0 0-1-1z" clipRule="evenodd" />
                  </svg>
                  <h3 className="font-display text-sm font-semibold text-red-700">Pages Losing Traffic</h3>
                  <span className="font-data text-xs text-red-500">{losingPages.length} pages down vs prior 90 days</span>
                </div>
                <div className="px-5 pb-4 space-y-2">
                  {losingPages.slice(0, 5).map((p) => {
                    const drop = p.clicks_prior - p.clicks
                    const dropPct = ((drop / p.clicks_prior) * 100).toFixed(0)
                    const diagState = diagnosing[p.page] ?? 'idle'
                    const diagResult = diagnoses[p.page]
                    return (
                      <div key={p.page} className="rounded-xl bg-white border border-red-100 overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-3">
                          <div className="min-w-0 flex-1">
                            <a
                              href={p.page}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm font-medium text-ink hover:text-red-600 transition truncate block"
                              title={p.page}
                            >
                              {relUrl(p.page)}
                            </a>
                            <p className="font-data text-xs text-ink-3 mt-0.5">
                              {p.clicks_prior.toLocaleString()} → {p.clicks.toLocaleString()} clicks
                            </p>
                          </div>
                          <div className="flex items-center gap-3 shrink-0 ml-4">
                            <span className="font-data text-sm font-semibold text-red-500">−{dropPct}%</span>
                            <button
                              onClick={() => diagnose(p.page)}
                              disabled={diagState === 'loading' || diagState === 'done'}
                              className="rounded-lg border border-cream-3 bg-white px-2.5 py-1 text-xs font-medium text-ink-2 hover:bg-cream disabled:opacity-40 transition"
                            >
                              {diagState === 'loading' ? (
                                <span className="flex items-center gap-1">
                                  <span className="h-2.5 w-2.5 animate-spin rounded-full border border-cream-3 border-t-teal" />
                                  Analyzing…
                                </span>
                              ) : diagState === 'done' ? 'Diagnosed' : 'Diagnose'}
                            </button>
                          </div>
                        </div>
                        {diagResult && (
                          <div className="border-t border-cream-2 bg-cream/50 px-4 py-3">
                            <p className="text-xs text-ink-2 leading-relaxed mb-1.5">{diagResult.diagnosis}</p>
                            <p className="text-xs font-medium text-teal-deep">→ {diagResult.action}</p>
                          </div>
                        )}
                        {diagState === 'error' && (
                          <div className="border-t border-red-100 bg-red-50 px-4 py-2">
                            <p className="text-xs text-red-600">Diagnosis failed — check your ANTHROPIC_API_KEY</p>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* All pages table */}
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-cream-2 text-xs font-medium text-ink-3">
                    <th className="px-5 py-2.5 text-left">Page</th>
                    <th className="px-5 py-2.5 text-right">Clicks (90d)</th>
                    <th className="px-5 py-2.5 text-right">Impressions</th>
                    <th className="px-5 py-2.5 text-right">CTR</th>
                    <th className="px-5 py-2.5 text-right">Position</th>
                    <th className="px-5 py-2.5 text-right">Trend</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cream-2">
                  {pages.map((p) => {
                    const delta = p.clicks - p.clicks_prior
                    const isLosing = delta < 0 && p.clicks_prior > 10
                    const trendPct = p.clicks_prior > 0
                      ? ((delta / p.clicks_prior) * 100).toFixed(0)
                      : null
                    return (
                      <tr key={p.page} className={`transition-colors ${isLosing ? 'bg-red-50/30 hover:bg-red-50/60' : 'hover:bg-cream'}`}>
                        <td className="px-5 py-3 font-medium text-ink max-w-[280px]">
                          <a
                            href={p.page}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="truncate block hover:text-teal-deep transition"
                            title={p.page}
                          >
                            {relUrl(p.page)}
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
                          {trendPct != null ? (
                            <span className={`font-semibold ${delta >= 0 ? 'text-teal-deep' : 'text-red-500'}`}>
                              {delta >= 0 ? '↑' : '↓'} {Math.abs(Number(trendPct))}%
                            </span>
                          ) : <span className="text-ink-3">—</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* ── SECTION 5: Branded vs Non-Branded ──────────────────────────── */}
      {allClicks > 0 && (
        <section className="rounded-2xl bg-charcoal overflow-hidden shadow-lg">
          <div className="px-6 pt-6 pb-2">
            <p className="font-data text-xs uppercase tracking-widest text-white/40 mb-1">Traffic Mix</p>
            <h2 className="font-display text-lg font-semibold text-white">Branded vs Non-Branded Search</h2>
          </div>
          <div className="grid grid-cols-2 gap-px bg-white/10 mx-6 my-4 rounded-xl overflow-hidden">
            {[
              {
                label: 'Branded Clicks',
                clicks: brandedClicks,
                pct: brandedPct,
                sub: 'Existing customers finding you',
                color: '#4BBFAD',
                warn: brandedPct > 0.7 ? 'Most traffic is from existing customers — awareness gap' : null,
              },
              {
                label: 'Non-Branded Clicks',
                clicks: nonBrandedClicks,
                pct: 1 - brandedPct,
                sub: 'Discovery traffic from new customers',
                color: '#4BBFAD',
                warn: null,
              },
            ].map((s) => (
              <div key={s.label} className="px-5 py-4 bg-white/5">
                <p className="font-data text-xs text-white/50 uppercase tracking-wider mb-3">{s.label}</p>
                <p className="font-display text-2xl font-semibold text-white mb-0.5">{s.clicks.toLocaleString()}</p>
                <p className="font-data text-sm text-white/50 mb-3">{(s.pct * 100).toFixed(0)}% of total clicks</p>
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-teal transition-all duration-700"
                    style={{ width: `${s.pct * 100}%` }}
                  />
                </div>
                {s.warn && <p className="mt-2 text-xs text-amber-300">{s.warn}</p>}
              </div>
            ))}
          </div>
          <p className="px-6 pb-5 text-xs text-white/40 leading-relaxed">
            {brandedPct > 0.7
              ? `${(brandedPct * 100).toFixed(0)}% of clicks come from branded searches (containing "lashbox", "lash box", etc.). This means most organic traffic is from people who already know LashBox LA. Focus on non-branded content to drive discovery.`
              : nonBrandedClicks > brandedClicks
              ? `Strong discovery traffic — ${(100 - brandedPct * 100).toFixed(0)}% of clicks are from non-branded searches. New customers are finding the site organically. Focus on conversion.`
              : `Balanced traffic mix. Both brand awareness and discovery keywords are performing.`}
          </p>
        </section>
      )}
    </div>
  )
}
