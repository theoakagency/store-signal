'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface HistoryRow {
  id: string
  name: string
  score: number | null
  promotion_type: string | null
  discount_type: string | null
  discount_value: number | null
  created_at: string
  ai_analysis: {
    verdict?: string
    audience_fit?: number
    buying_motivation?: number
    margin_impact?: number
    timing_urgency?: number
    staff_effort_roi?: number
  } | null
}

interface Analysis {
  overall_score: number
  audience_fit: number
  buying_motivation: number
  margin_impact: number
  timing_urgency: number
  staff_effort_roi: number
  verdict: string
  main_analysis: string
  what_to_try_instead: string
  strengths: string[]
  risks: string[]
}

const DIMENSIONS: { key: keyof Analysis & string; label: string }[] = [
  { key: 'audience_fit',      label: 'Audience Fit' },
  { key: 'buying_motivation', label: 'Buying Motivation' },
  { key: 'margin_impact',     label: 'Margin Impact' },
  { key: 'timing_urgency',    label: 'Timing & Urgency' },
  { key: 'staff_effort_roi',  label: 'Staff Effort ROI' },
]

// ── Score ring ────────────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const r = 44
  const circumference = 2 * Math.PI * r
  const offset = circumference - (score / 100) * circumference
  const color = score >= 75 ? '#4BBFAD' : score >= 50 ? '#f59e0b' : '#ef4444'
  const label = score >= 75 ? 'Strong' : score >= 50 ? 'Moderate' : 'Weak'

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="130" height="130" viewBox="0 0 130 130" role="img" aria-label={`Score: ${score} out of 100`}>
        {/* Track */}
        <circle cx="65" cy="65" r={r} fill="none" stroke="#E8E2D9" strokeWidth="10" />
        {/* Fill */}
        <circle
          cx="65"
          cy="65"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 65 65)"
          className="animate-ring"
        />
        {/* Score number — DM Mono */}
        <text
          x="65"
          y="61"
          textAnchor="middle"
          fontSize="30"
          fontWeight="500"
          fill={color}
          fontFamily="DM Mono, Fira Mono, monospace"
        >
          {score}
        </text>
        {/* /100 */}
        <text
          x="65"
          y="78"
          textAnchor="middle"
          fontSize="11"
          fill="#888888"
          fontFamily="DM Mono, monospace"
        >
          / 100
        </text>
      </svg>
      {/* Verdict label — Cormorant Garamond */}
      <p
        className="text-base font-semibold"
        style={{ color, fontFamily: 'Cormorant Garamond, Georgia, serif' }}
      >
        {label}
      </p>
    </div>
  )
}

// ── Dimension bar ─────────────────────────────────────────────────────────────

function DimBar({ label, value }: { label: string; value: number }) {
  const color = value >= 75 ? 'bg-teal' : value >= 50 ? 'bg-amber-400' : 'bg-red-400'
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1.5">
        <span className="text-xs font-medium text-ink-2" style={{ fontFamily: 'Jost, system-ui, sans-serif' }}>
          {label}
        </span>
        <span className="font-data text-xs text-ink-3">{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-cream-2 overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all duration-700`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PromotionScorer({ history }: { history: HistoryRow[] }) {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'scoring' | 'done' | 'error'>('idle')
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [form, setForm] = useState({
    name: '',
    description: '',
    status: 'Just considering',
    promotion_type: 'discount',
    discount_type: 'percentage',
    discount_value: '',
    target_audience: 'All customers',
    channel: 'Email - full list',
    budget: '',
    duration_days: '',
  })

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleScore(e: React.FormEvent) {
    e.preventDefault()
    setState('scoring')
    setAnalysis(null)
    setErrorMsg('')

    try {
      const res = await fetch('/api/promotions/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (data.error) {
        setState('error')
        setErrorMsg(data.error)
        return
      }
      setAnalysis(data.analysis)
      setState('done')
    } catch {
      setState('error')
      setErrorMsg('Network error — check console')
    }
  }

  const inputCls =
    'w-full rounded-lg border border-cream-3 bg-white px-3 py-2 text-sm text-ink focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal transition'
  const labelCls =
    'block text-xs font-medium text-ink-2 mb-1'

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

        {/* ── Form ── */}
        <section className="rounded-2xl border border-cream-3 bg-white p-6 shadow-sm">
          <h2 className="font-display text-lg font-semibold text-ink mb-5">Score a Promotion</h2>

          <form onSubmit={handleScore} className="space-y-4">

            {/* Name */}
            <div>
              <label className={labelCls}>Promotion name *</label>
              <input
                required
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="e.g. Summer Lash Flash Sale"
                className={inputCls}
              />
            </div>

            {/* Status */}
            <div>
              <label className={labelCls}>Status</label>
              <select
                value={form.status}
                onChange={(e) => set('status', e.target.value)}
                className={inputCls}
              >
                <option>Already ran</option>
                <option>Planning to run</option>
                <option>Just considering</option>
              </select>
            </div>

            {/* Description */}
            <div>
              <label className={labelCls}>Description</label>
              <textarea
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                placeholder="Describe the promotion and share your gut feeling. The AI will validate or challenge your thinking using your actual store data."
                className={inputCls + ' resize-none'}
                style={{ minHeight: '120px' }}
              />
            </div>

            {/* Promotion type + Discount type */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Promotion type *</label>
                <select
                  value={form.promotion_type}
                  onChange={(e) => set('promotion_type', e.target.value)}
                  className={inputCls}
                >
                  <option value="discount">Discount</option>
                  <option value="bogo">BOGO</option>
                  <option value="free_shipping">Free Shipping</option>
                  <option value="gift_with_purchase">Gift w/ Purchase</option>
                  <option value="flash_sale">Flash Sale</option>
                  <option value="loyalty">Loyalty Reward</option>
                  <option value="referral">Referral</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Discount type *</label>
                <select
                  value={form.discount_type}
                  onChange={(e) => set('discount_type', e.target.value)}
                  className={inputCls}
                >
                  <option value="percentage">Percentage (%)</option>
                  <option value="fixed_amount">Fixed Amount ($)</option>
                  <option value="free_shipping">Free Shipping</option>
                </select>
              </div>
            </div>

            {/* Discount value + Duration */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Discount value</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.discount_value}
                  onChange={(e) => set('discount_value', e.target.value)}
                  placeholder={form.discount_type === 'percentage' ? '20' : '10.00'}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Duration (days)</label>
                <input
                  type="number"
                  min="1"
                  value={form.duration_days}
                  onChange={(e) => set('duration_days', e.target.value)}
                  placeholder="7"
                  className={inputCls}
                />
              </div>
            </div>

            {/* Target audience */}
            <div>
              <label className={labelCls}>Target audience</label>
              <select
                value={form.target_audience}
                onChange={(e) => set('target_audience', e.target.value)}
                className={inputCls}
              >
                <option>All customers</option>
                <option>VIP/top spenders</option>
                <option>Lapsed customers (90+ days)</option>
                <option>First-time buyers</option>
                <option>Email subscribers only</option>
              </select>
            </div>

            {/* Channel + Budget */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Distribution channel</label>
                <select
                  value={form.channel}
                  onChange={(e) => set('channel', e.target.value)}
                  className={inputCls}
                >
                  <option>Email - full list</option>
                  <option>Email - segment only</option>
                  <option>Social media</option>
                  <option>Paid ads</option>
                  <option>Sitewide banner</option>
                  <option>Multi-channel</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Budget ($)</label>
                <input
                  type="number"
                  min="0"
                  value={form.budget}
                  onChange={(e) => set('budget', e.target.value)}
                  placeholder="500"
                  className={inputCls}
                />
              </div>
            </div>

            {errorMsg && (
              <p className="text-sm text-red-500">{errorMsg}</p>
            )}

            <button
              type="submit"
              disabled={state === 'scoring'}
              className="w-full rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-dark disabled:opacity-60 disabled:cursor-not-allowed transition"
            >
              {state === 'scoring' ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  Scoring with AI…
                </span>
              ) : (
                'Score this promotion'
              )}
            </button>
          </form>
        </section>

        {/* ── Results panel ── */}
        <section className="rounded-2xl border border-cream-3 bg-white p-6 shadow-sm">
          {/* Heading — Cormorant Garamond */}
          <h2
            className="text-xl font-semibold text-ink mb-5"
            style={{ fontFamily: 'Cormorant Garamond, Georgia, serif' }}
          >
            Score Results
          </h2>

          {state === 'idle' && (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <div className="mb-3 h-12 w-12 rounded-full bg-cream-2 flex items-center justify-center">
                <svg className="h-6 w-6 text-ink-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M9 12l2 2 4-4M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <p className="text-sm text-ink-3 leading-relaxed">
                Fill in the form and click<br />
                <span className="font-medium text-ink-2">"Score this promotion"</span>
              </p>
            </div>
          )}

          {state === 'scoring' && (
            <div className="flex flex-col items-center justify-center py-14 gap-4">
              <div className="h-16 w-16 animate-spin rounded-full border-4 border-cream-2 border-t-teal" />
              <p className="text-sm text-ink-3">Analyzing with Claude AI…</p>
            </div>
          )}

          {state === 'done' && analysis && (
            <div className="space-y-5">
              {/* Ring + verdict */}
              <ScoreRing score={analysis.overall_score} />

              {/* Verdict text — Cormorant Garamond */}
              {analysis.verdict && (
                <p
                  className="text-center text-base text-ink leading-snug px-2"
                  style={{ fontFamily: 'Cormorant Garamond, Georgia, serif' }}
                >
                  {analysis.verdict}
                </p>
              )}

              {/* 5 dimension bars */}
              <div className="space-y-3 pt-1">
                {DIMENSIONS.map((d) => (
                  <DimBar
                    key={d.key}
                    label={d.label}
                    value={analysis[d.key] as number}
                  />
                ))}
              </div>

              {/* Main analysis */}
              {analysis.main_analysis && (
                <div className="rounded-xl bg-cream px-4 py-3.5">
                  <p
                    className="text-xs font-semibold uppercase tracking-wider text-ink-3 mb-2"
                    style={{ fontFamily: 'Jost, system-ui, sans-serif' }}
                  >
                    Analysis
                  </p>
                  <p className="text-sm text-ink leading-relaxed">{analysis.main_analysis}</p>
                </div>
              )}

              {/* What to try instead */}
              {analysis.what_to_try_instead && (
                <div className="rounded-xl border border-teal/20 bg-teal-pale px-4 py-3.5">
                  <p
                    className="text-xs font-semibold uppercase tracking-wider text-teal-deep mb-2"
                    style={{ fontFamily: 'Jost, system-ui, sans-serif' }}
                  >
                    What to try instead
                  </p>
                  <p className="text-sm text-ink leading-relaxed">{analysis.what_to_try_instead}</p>
                </div>
              )}

              {/* Ask AI for alternatives */}
              <button
                onClick={() => router.push(`/dashboard/chat?q=${encodeURIComponent(`The "${form.name}" promotion scored ${analysis.overall_score}/100. What specific promotions would work better for my customer type?`)}`)}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-teal/25 bg-teal/5 px-4 py-3 text-sm font-medium text-teal hover:bg-teal hover:text-white transition"
              >
                <svg className="h-4 w-4" viewBox="0 0 12 12" fill="currentColor">
                  <path d="M6 1l1.2 3.8H11l-3 2.2 1.2 3.8L6 8.5l-3.2 2.3L4 7 1 4.8h3.8L6 1z" />
                </svg>
                Ask AI for better alternatives
              </button>

              {/* Strengths + Risks */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-cream-2 px-3 py-3">
                  <p
                    className="text-xs font-semibold text-ink-2 mb-2"
                    style={{ fontFamily: 'Jost, system-ui, sans-serif' }}
                  >
                    Strengths
                  </p>
                  <ul className="space-y-1.5">
                    {analysis.strengths.map((s, i) => (
                      <li key={i} className="text-xs text-ink-2 flex gap-1.5 leading-snug">
                        <span className="text-teal shrink-0 mt-0.5">✓</span>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-xl bg-red-50 px-3 py-3">
                  <p
                    className="text-xs font-semibold text-red-700 mb-2"
                    style={{ fontFamily: 'Jost, system-ui, sans-serif' }}
                  >
                    Risks
                  </p>
                  <ul className="space-y-1.5">
                    {analysis.risks.map((r, i) => (
                      <li key={i} className="text-xs text-ink-2 flex gap-1.5 leading-snug">
                        <span className="text-red-400 shrink-0 mt-0.5">!</span>
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* ── History ── */}
      {history.length > 0 && (
        <section className="rounded-2xl border border-cream-3 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between border-b border-cream-2 px-5 py-3.5">
            <h2 className="font-display text-sm font-semibold text-ink">Score History</h2>
            <span className="font-data text-xs text-ink-3">Recent 20</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-cream-2 text-xs font-medium text-ink-3">
                  <th className="px-5 py-2.5 text-left">Name</th>
                  <th className="px-5 py-2.5 text-left">Type</th>
                  <th className="px-5 py-2.5 text-left">Discount</th>
                  <th className="px-5 py-2.5 text-center">Score</th>
                  <th className="px-5 py-2.5 text-left">Verdict</th>
                  <th className="px-5 py-2.5 text-left">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-2">
                {history.map((row) => {
                  const score = row.score ?? 0
                  const scoreColor =
                    score >= 75 ? 'text-teal-deep' : score >= 50 ? 'text-amber-600' : 'text-red-500'
                  return (
                    <tr key={row.id} className="hover:bg-cream transition-colors">
                      <td className="px-5 py-3 font-medium text-ink">{row.name}</td>
                      <td className="px-5 py-3 text-ink-2 capitalize">{row.promotion_type ?? '—'}</td>
                      <td className="px-5 py-3 font-data text-xs text-ink-2">
                        {row.discount_value
                          ? `${row.discount_value}${row.discount_type === 'percentage' ? '%' : '$'}`
                          : '—'}
                      </td>
                      <td className={`px-5 py-3 text-center font-data font-semibold ${scoreColor}`}>
                        {score}
                      </td>
                      <td className="px-5 py-3 text-xs text-ink-3 max-w-[200px] truncate">
                        {row.ai_analysis?.verdict ?? '—'}
                      </td>
                      <td className="px-5 py-3 font-data text-xs text-ink-3">
                        {new Date(row.created_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
