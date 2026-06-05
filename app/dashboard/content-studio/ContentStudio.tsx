'use client'

import { useState, useCallback } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

type Channel = 'email' | 'sms' | 'push'

interface EmailVersion {
  subject: string
  preheader: string
  body: string
}
interface SmsVersion {
  message: string
}
interface PushVersion {
  title: string
  message: string
}
type Version = EmailVersion | SmsVersion | PushVersion

interface GenerationResult {
  versions: Version[]
}

export interface ContentGeneration {
  id: string
  channel: Channel
  topic: string
  product_focus: string | null
  audience: string | null
  tones: string[] | null
  talking_points: string | null
  versions: GenerationResult
  created_at: string
}

interface FormState {
  channel: Channel
  topic: string
  productFocus: string
  audience: string
  talkingPoints: string
}

const TONE_OPTIONS = [
  'Educational',
  'Launch Hype',
  'Urgency / Scarcity',
  'Community',
  'Promotional',
  'Storytelling',
  'Results-Focused',
]

const CHANNEL_TABS: { id: Channel; label: string }[] = [
  { id: 'email', label: 'Email' },
  { id: 'sms',   label: 'SMS' },
  { id: 'push',  label: 'Push' },
]

// ── Sub-components ────────────────────────────────────────────────────────────

function ChannelTabs({
  value,
  onChange,
}: {
  value: Channel
  onChange: (c: Channel) => void
}) {
  return (
    <div className="flex gap-1 rounded-lg bg-cream-2 p-1">
      {CHANNEL_TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
            value === tab.id
              ? 'bg-white text-ink shadow-sm'
              : 'text-ink-3 hover:text-ink-2'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

function TonePills({
  selected,
  onToggle,
}: {
  selected: Set<string>
  onToggle: (tone: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {TONE_OPTIONS.map((tone) => (
        <button
          key={tone}
          type="button"
          onClick={() => onToggle(tone)}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
            selected.has(tone)
              ? 'border-teal bg-teal/10 text-teal-deep'
              : 'border-cream-3 bg-white text-ink-3 hover:border-teal/40 hover:text-ink-2'
          }`}
        >
          {tone}
        </button>
      ))}
    </div>
  )
}

function CopyButton({ text, idx, copiedIdx, onCopy }: {
  text: string
  idx: number
  copiedIdx: number | null
  onCopy: (text: string, idx: number) => void
}) {
  const copied = copiedIdx === idx
  return (
    <button
      type="button"
      onClick={() => onCopy(text, idx)}
      className="flex items-center gap-1 rounded-md border border-cream-3 bg-white px-2.5 py-1 text-xs font-medium text-ink-3 transition hover:border-teal/50 hover:text-teal"
    >
      {copied ? (
        <>
          <svg className="h-3 w-3 text-teal" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2 6l3 3 5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Copied
        </>
      ) : (
        <>
          <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="4" y="4" width="7" height="7" rx="1" />
            <path d="M8 4V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h1" strokeLinecap="round" />
          </svg>
          Copy
        </>
      )}
    </button>
  )
}

function EmailCard({ v, idx, copiedIdx, onCopy }: {
  v: EmailVersion
  idx: number
  copiedIdx: number | null
  onCopy: (text: string, idx: number) => void
}) {
  const fullText = `Subject: ${v.subject}\nPreheader: ${v.preheader}\n\n${v.body}`
  return (
    <div className="rounded-xl border border-cream-3 bg-cream p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-data uppercase tracking-widest text-ink-3">Version {idx + 1}</span>
        <CopyButton text={fullText} idx={idx} copiedIdx={copiedIdx} onCopy={onCopy} />
      </div>
      <p className="text-sm font-semibold text-ink leading-snug">{v.subject}</p>
      {v.preheader && (
        <p className="text-xs italic text-ink-3 leading-snug">{v.preheader}</p>
      )}
      <div className="mt-2 border-t border-cream-3 pt-2">
        <p className="whitespace-pre-wrap text-xs text-ink-2 leading-relaxed">{v.body}</p>
      </div>
    </div>
  )
}

function SmsCard({ v, idx, copiedIdx, onCopy }: {
  v: SmsVersion
  idx: number
  copiedIdx: number | null
  onCopy: (text: string, idx: number) => void
}) {
  const charCount = v.message.length
  const overLimit = charCount > 160
  return (
    <div className="rounded-xl border border-cream-3 bg-cream p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-data uppercase tracking-widest text-ink-3">Version {idx + 1}</span>
        <div className="flex items-center gap-2">
          <span className={`font-data text-xs ${overLimit ? 'text-red-500 font-semibold' : 'text-ink-3'}`}>
            {charCount}/160
          </span>
          <CopyButton text={v.message} idx={idx} copiedIdx={copiedIdx} onCopy={onCopy} />
        </div>
      </div>
      <p className="whitespace-pre-wrap text-sm text-ink leading-relaxed">{v.message}</p>
    </div>
  )
}

function PushCard({ v, idx, copiedIdx, onCopy }: {
  v: PushVersion
  idx: number
  copiedIdx: number | null
  onCopy: (text: string, idx: number) => void
}) {
  const fullText = `${v.title}\n${v.message}`
  return (
    <div className="rounded-xl border border-cream-3 bg-cream p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-data uppercase tracking-widest text-ink-3">Version {idx + 1}</span>
        <CopyButton text={fullText} idx={idx} copiedIdx={copiedIdx} onCopy={onCopy} />
      </div>
      <p className="text-sm font-semibold text-ink">{v.title}</p>
      <p className="text-xs text-ink-2 leading-relaxed">{v.message}</p>
      <div className="flex gap-3 pt-0.5">
        <span className={`font-data text-[10px] ${v.title.length > 40 ? 'text-red-500' : 'text-ink-3'}`}>
          Title: {v.title.length}/40
        </span>
        <span className={`font-data text-[10px] ${v.message.length > 100 ? 'text-red-500' : 'text-ink-3'}`}>
          Message: {v.message.length}/100
        </span>
      </div>
    </div>
  )
}

function VersionCards({ channel, versions, copiedIdx, onCopy }: {
  channel: Channel
  versions: Version[]
  copiedIdx: number | null
  onCopy: (text: string, idx: number) => void
}) {
  return (
    <div className="space-y-3">
      {versions.map((v, i) => {
        if (channel === 'email') return <EmailCard key={i} v={v as EmailVersion} idx={i} copiedIdx={copiedIdx} onCopy={onCopy} />
        if (channel === 'sms')   return <SmsCard   key={i} v={v as SmsVersion}   idx={i} copiedIdx={copiedIdx} onCopy={onCopy} />
        return <PushCard key={i} v={v as PushVersion} idx={i} copiedIdx={copiedIdx} onCopy={onCopy} />
      })}
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-xl border border-cream-3 bg-cream p-4 space-y-2 animate-pulse">
          <div className="h-3 w-16 rounded bg-cream-3" />
          <div className="h-4 w-3/4 rounded bg-cream-3" />
          <div className="h-3 w-1/2 rounded bg-cream-3" />
          <div className="space-y-1 pt-2">
            <div className="h-3 rounded bg-cream-3" />
            <div className="h-3 w-5/6 rounded bg-cream-3" />
            <div className="h-3 w-4/6 rounded bg-cream-3" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ContentStudio({
  history,
  products,
  segments,
}: {
  history: ContentGeneration[]
  products: { title: string; total_revenue: number }[]
  segments: { segment: string; count: number }[]
}) {
  const [form, setForm] = useState<FormState>({
    channel: 'email',
    topic: '',
    productFocus: '',
    audience: '',
    talkingPoints: '',
  })
  const [selectedTones, setSelectedTones] = useState<Set<string>>(new Set(['Educational']))
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<GenerationResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const [liveHistory, setLiveHistory] = useState<ContentGeneration[]>(history)

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function toggleTone(tone: string) {
    setSelectedTones((prev) => {
      const next = new Set(prev)
      if (next.has(tone)) {
        if (next.size === 1) return prev // must keep at least one
        next.delete(tone)
      } else {
        next.add(tone)
      }
      return next
    })
  }

  const handleCopy = useCallback((text: string, idx: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIdx(idx)
      setTimeout(() => setCopiedIdx(null), 2000)
    })
  }, [])

  function loadFromHistory(row: ContentGeneration) {
    setForm({
      channel: row.channel,
      topic: row.topic,
      productFocus: row.product_focus ?? '',
      audience: row.audience ?? '',
      talkingPoints: row.talking_points ?? '',
    })
    setSelectedTones(new Set(row.tones ?? ['Educational']))
    setResult(row.versions)
    setError(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault()
    if (selectedTones.size === 0) return
    setIsLoading(true)
    setResult(null)
    setError(null)

    try {
      const res = await fetch('/api/content-studio/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: form.channel,
          topic: form.topic,
          productFocus: form.productFocus || null,
          audience: form.audience || null,
          tones: Array.from(selectedTones),
          talkingPoints: form.talkingPoints || null,
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setError(data.error ?? 'Generation failed')
        return
      }
      setResult(data.data)
      // Prepend to local history
      if (data.saved) {
        setLiveHistory((prev) => [data.saved, ...prev].slice(0, 20))
      }
    } catch {
      setError('Network error — check console')
    } finally {
      setIsLoading(false)
    }
  }

  const inputCls = 'w-full rounded-lg border border-cream-3 bg-white px-3 py-2 text-sm text-ink focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal transition'
  const labelCls = 'block text-xs font-medium text-ink-2 mb-1'

  // Build audience options from real segment data + static options
  const audienceOptions = [
    ...(segments.length > 0
      ? segments.map((s) => ({
          value: s.segment,
          label: `${s.segment} Customers (${s.count.toLocaleString()})`,
        }))
      : []),
    { value: 'All Lash Artists', label: 'All Lash Artists' },
    { value: 'New Customers', label: 'New Customers' },
    { value: 'Lapsed Customers', label: 'Lapsed Customers (90+ days)' },
  ]

  return (
    <div className="space-y-6">

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

        {/* ── Input Form ── */}
        <section className="rounded-2xl border border-cream-3 bg-white p-6 shadow-sm">
          <h2 className="font-display text-lg font-semibold text-ink mb-5">Generate Content</h2>

          <form onSubmit={handleGenerate} className="space-y-4">

            {/* Channel */}
            <div>
              <label className={labelCls}>Channel</label>
              <ChannelTabs
                value={form.channel}
                onChange={(c) => { setField('channel', c); setResult(null) }}
              />
            </div>

            {/* Topic */}
            <div>
              <label className={labelCls}>Topic / Theme *</label>
              <input
                required
                value={form.topic}
                onChange={(e) => setField('topic', e.target.value)}
                placeholder="e.g. Restock reminder for CC curl lashes"
                className={inputCls}
              />
            </div>

            {/* Product Focus */}
            <div>
              <label className={labelCls}>Product Focus</label>
              <select
                value={form.productFocus}
                onChange={(e) => setField('productFocus', e.target.value)}
                className={inputCls}
              >
                <option value="">— No specific product —</option>
                {products.map((p) => (
                  <option key={p.title} value={p.title}>{p.title}</option>
                ))}
              </select>
            </div>

            {/* Target Audience */}
            <div>
              <label className={labelCls}>Target Audience</label>
              <select
                value={form.audience}
                onChange={(e) => setField('audience', e.target.value)}
                className={inputCls}
              >
                <option value="">— Select audience —</option>
                {audienceOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Tone */}
            <div>
              <label className={labelCls}>Tone / Angle <span className="text-ink-3">(select at least one)</span></label>
              <TonePills selected={selectedTones} onToggle={toggleTone} />
            </div>

            {/* Key Talking Points */}
            <div>
              <label className={labelCls}>Key Talking Points</label>
              <textarea
                value={form.talkingPoints}
                onChange={(e) => setField('talkingPoints', e.target.value)}
                placeholder="e.g. 72hr hold time, now available in CC curl, bulk discount available..."
                className={inputCls + ' resize-none'}
                style={{ minHeight: '80px' }}
              />
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isLoading || selectedTones.size === 0}
              className="w-full rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-dark disabled:opacity-60 disabled:cursor-not-allowed transition"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  Generating 3 versions…
                </span>
              ) : (
                'Generate Content'
              )}
            </button>
          </form>
        </section>

        {/* ── Results Panel ── */}
        <section className="rounded-2xl border border-cream-3 bg-white p-6 shadow-sm">
          <h2 className="font-display text-lg font-semibold text-ink mb-5">Generated Versions</h2>

          {!isLoading && !result && (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <div className="mb-3 h-12 w-12 rounded-full bg-cream-2 flex items-center justify-center">
                <svg className="h-6 w-6 text-ink-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M15.232 5.232l3.536 3.536M9 13l-4 4 4-1 7-7-3-3-7 7 1-4z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <p className="text-sm text-ink-3 leading-relaxed">
                Fill in the form and click<br />
                <span className="font-medium text-ink-2">"Generate Content"</span>
              </p>
            </div>
          )}

          {isLoading && <LoadingSkeleton />}

          {!isLoading && result && (
            <VersionCards
              channel={form.channel}
              versions={result.versions}
              copiedIdx={copiedIdx}
              onCopy={handleCopy}
            />
          )}
        </section>
      </div>

      {/* ── History Table ── */}
      <section className="rounded-2xl border border-cream-3 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-cream-2 px-5 py-3.5">
          <h2 className="font-display text-sm font-semibold text-ink">Generation History</h2>
          <span className="font-data text-xs text-ink-3">Recent 20</span>
        </div>

        {liveHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-ink-3">No generations yet — create your first above.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-cream-2 text-xs font-medium text-ink-3">
                  <th className="px-5 py-2.5 text-left">Date</th>
                  <th className="px-5 py-2.5 text-left">Channel</th>
                  <th className="px-5 py-2.5 text-left">Topic</th>
                  <th className="px-5 py-2.5 text-left">Audience</th>
                  <th className="px-5 py-2.5 text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-2">
                {liveHistory.map((row) => (
                  <tr key={row.id} className="hover:bg-cream transition-colors">
                    <td className="px-5 py-3 font-data text-xs text-ink-3 whitespace-nowrap">
                      {new Date(row.created_at).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                        row.channel === 'email' ? 'bg-blue-50 text-blue-600' :
                        row.channel === 'sms'   ? 'bg-purple-50 text-purple-600' :
                        'bg-amber-50 text-amber-600'
                      }`}>
                        {row.channel}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-ink max-w-[200px] truncate">{row.topic}</td>
                    <td className="px-5 py-3 text-ink-2 text-xs max-w-[150px] truncate">
                      {row.audience ?? '—'}
                    </td>
                    <td className="px-5 py-3">
                      <button
                        type="button"
                        onClick={() => loadFromHistory(row)}
                        className="rounded-md border border-cream-3 bg-white px-2.5 py-1 text-xs font-medium text-ink-3 transition hover:border-teal/50 hover:text-teal"
                      >
                        Load
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

    </div>
  )
}
