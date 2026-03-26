'use client'

import { useState, useEffect } from 'react'

export interface ExecutiveInsight {
  title: string
  description: string
  sources: string[]
  action: string
  impact: 'Low' | 'Medium' | 'High'
}

interface Props {
  cachedInsights: ExecutiveInsight[] | null
  calculatedAt: string | null
}

const SOURCE_COLORS: Record<string, string> = {
  Shopify:  'bg-[#96BF48]/15 text-[#4a6b1a]',
  Klaviyo:  'bg-orange-50 text-orange-700',
  'Meta Ads': 'bg-blue-50 text-blue-700',
  'Google Ads': 'bg-yellow-50 text-yellow-700',
  GSC: 'bg-[#4285F4]/10 text-[#4285F4]',
  'Search Console': 'bg-[#4285F4]/10 text-[#4285F4]',
}

const IMPACT_COLORS: Record<string, string> = {
  High:   'bg-teal-pale text-teal-deep',
  Medium: 'bg-yellow-50 text-yellow-700',
  Low:    'bg-cream-2 text-ink-3',
}

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function InsightCard({ insight }: { insight: ExecutiveInsight }) {
  return (
    <div className="rounded-xl border border-cream-2 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex flex-wrap gap-1.5">
          {insight.sources.map((s) => (
            <span key={s} className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${SOURCE_COLORS[s] ?? 'bg-cream-2 text-ink-3'}`}>
              {s}
            </span>
          ))}
        </div>
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${IMPACT_COLORS[insight.impact]}`}>
          {insight.impact} impact
        </span>
      </div>
      <h3 className="mt-2 text-sm font-semibold text-ink">{insight.title}</h3>
      <p className="mt-1 text-xs text-ink-2 leading-relaxed">{insight.description}</p>
      <div className="mt-2 flex items-start gap-1.5">
        <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal" />
        <p className="text-xs text-teal-deep font-medium leading-relaxed">{insight.action}</p>
      </div>
    </div>
  )
}

export default function AiInsightsBrief({ cachedInsights, calculatedAt }: Props) {
  const [insights, setInsights] = useState<ExecutiveInsight[]>(cachedInsights ?? [])
  const [ts, setTs] = useState<string | null>(calculatedAt)
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [errMsg, setErrMsg] = useState('')

  // Auto-refresh if insights are stale (>12h) or missing
  useEffect(() => {
    const isStale = !ts || (Date.now() - new Date(ts).getTime()) > 12 * 60 * 60 * 1000
    if (isStale && insights.length === 0) {
      refresh()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function refresh() {
    setState('loading')
    setErrMsg('')
    try {
      const res = await fetch('/api/insights/executive', { method: 'POST' })
      const data = await res.json() as { insights?: ExecutiveInsight[]; calculated_at?: string; error?: string }
      if (data.error) { setState('error'); setErrMsg(data.error); return }
      setInsights(data.insights ?? [])
      setTs(data.calculated_at ?? null)
      setState('idle')
    } catch {
      setState('error')
      setErrMsg('Network error — try again')
    }
  }

  return (
    <section className="rounded-2xl border border-cream-3 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-base font-semibold text-ink">AI Intelligence Brief</h2>
            <span className="inline-flex items-center rounded-full bg-charcoal/8 px-2 py-0.5 text-[10px] font-medium text-ink-3">
              Cross-platform
            </span>
          </div>
          <p className="text-xs text-ink-3 mt-0.5">
            {ts ? `Last analyzed ${timeAgo(ts)}` : 'Not yet generated'}
            {' · '}Insights connecting Shopify, Email, Ads &amp; Search data
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={state === 'loading'}
          className="inline-flex items-center gap-1.5 rounded-lg border border-cream-3 bg-cream px-3 py-1.5 text-xs font-medium text-ink-2 hover:bg-cream-2 disabled:opacity-50 transition"
        >
          {state === 'loading' ? (
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-cream-3 border-t-teal" />
          ) : (
            <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M11 6A5 5 0 1 1 6 1" strokeLinecap="round"/>
              <path d="M11 1v3H8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
          {state === 'loading' ? 'Analyzing…' : insights.length > 0 ? 'Refresh Insights' : 'Generate Insights'}
        </button>
      </div>

      {state === 'error' && (
        <div className="mt-4 rounded-lg bg-red-50 border border-red-100 px-4 py-3 text-xs text-red-700">
          {errMsg}
        </div>
      )}

      {state === 'loading' && insights.length === 0 && (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-xl border border-cream-2 bg-cream p-4 animate-pulse">
              <div className="h-3 w-24 bg-cream-3 rounded mb-2" />
              <div className="h-4 w-full bg-cream-3 rounded mb-1.5" />
              <div className="h-3 w-3/4 bg-cream-3 rounded" />
            </div>
          ))}
        </div>
      )}

      {insights.length > 0 ? (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {insights.map((ins, i) => (
            <InsightCard key={i} insight={ins} />
          ))}
        </div>
      ) : state !== 'loading' ? (
        <div className="mt-4 rounded-xl border border-dashed border-cream-3 bg-cream px-6 py-8 text-center">
          <p className="text-sm text-ink-2 font-medium">No insights yet</p>
          <p className="mt-1 text-xs text-ink-3">
            Connect and sync at least 2 platforms (Shopify + one other), then click Generate Insights.
          </p>
        </div>
      ) : null}
    </section>
  )
}
