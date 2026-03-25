'use client'

import { useState } from 'react'

export interface HealthComponent {
  name: string
  pts: number
  maxPts: number
  description: string
}

interface Props {
  score: number
  components: HealthComponent[]
  summary: string
  calculatedAt: string | null
}

function ScoreRing({ score }: { score: number }) {
  const r = 52
  const circumference = 2 * Math.PI * r
  const offset = circumference - (score / 100) * circumference
  const color = score >= 70 ? '#4BBFAD' : score >= 40 ? '#f59e0b' : '#ef4444'
  const label = score >= 70 ? 'Healthy' : score >= 40 ? 'Needs Attention' : 'At Risk'

  return (
    <div className="flex flex-col items-center gap-1.5">
      <svg width="150" height="150" viewBox="0 0 150 150" role="img" aria-label={`Business Health Score: ${score} out of 100`}>
        <circle cx="75" cy="75" r={r} fill="none" stroke="#E8E2D9" strokeWidth="12" />
        <circle
          cx="75" cy="75" r={r}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 75 75)"
          className="animate-ring"
        />
        <text x="75" y="70" textAnchor="middle" fontSize="36" fontWeight="500" fill={color} fontFamily="DM Mono, Fira Mono, monospace">
          {score}
        </text>
        <text x="75" y="88" textAnchor="middle" fontSize="12" fill="#888888" fontFamily="DM Mono, monospace">
          / 100
        </text>
      </svg>
      <p className="text-lg font-semibold" style={{ color, fontFamily: 'Cormorant Garamond, Georgia, serif' }}>
        {label}
      </p>
    </div>
  )
}

function ComponentBar({ component }: { component: HealthComponent }) {
  const pct = component.maxPts > 0 ? (component.pts / component.maxPts) * 100 : 0
  const color = pct >= 70 ? 'bg-teal' : pct >= 40 ? 'bg-amber-400' : 'bg-red-400'
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs font-medium text-ink-2">{component.name}</span>
        <span className="font-data text-[10px] text-ink-3">{component.pts}/{component.maxPts}pts</span>
      </div>
      <div className="h-1.5 rounded-full bg-cream-2 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 2) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function BusinessHealthScore({ score, components, summary, calculatedAt }: Props) {
  const [recalculating, setRecalculating] = useState(false)
  const [ts, setTs] = useState(calculatedAt)
  const [currentScore] = useState(score)

  async function recalculate() {
    setRecalculating(true)
    try {
      await fetch('/api/metrics/refresh', { method: 'POST' })
      setTs(new Date().toISOString())
    } finally {
      setRecalculating(false)
    }
  }

  return (
    <section className="rounded-2xl border border-cream-3 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-4 flex-wrap mb-5">
        <div>
          <h2 className="font-display text-base font-semibold text-ink">Business Health Score</h2>
          <p className="text-xs text-ink-3 mt-0.5">
            {ts ? `Last calculated ${timeAgo(ts)}` : 'Not yet calculated'}
            {' · '}Composite score across all connected platforms
          </p>
        </div>
        <button
          onClick={recalculate}
          disabled={recalculating}
          className="inline-flex items-center gap-1.5 rounded-lg border border-cream-3 bg-cream px-3 py-1.5 text-xs font-medium text-ink-2 hover:bg-cream-2 disabled:opacity-50 transition"
        >
          {recalculating ? (
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-cream-3 border-t-teal" />
          ) : (
            <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M11 6A5 5 0 1 1 6 1" strokeLinecap="round"/>
              <path d="M11 1v3H8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
          {recalculating ? 'Recalculating…' : 'Recalculate'}
        </button>
      </div>

      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
        {/* Ring */}
        <div className="flex flex-col items-center gap-3 sm:w-48 shrink-0">
          <ScoreRing score={currentScore} />
          <p className="text-center text-xs text-ink-2 leading-relaxed max-w-[160px]">{summary}</p>
        </div>

        {/* Component bars */}
        <div className="flex-1 space-y-3">
          {components.map((c) => (
            <ComponentBar key={c.name} component={c} />
          ))}
        </div>
      </div>
    </section>
  )
}
