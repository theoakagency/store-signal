'use client'

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import Link from 'next/link'

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
  custom_audience: string | null
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

const PERSONA_OPTIONS = [
  { value: 'all-lash-artists',        label: 'All Lash Artists' },
  { value: 'new-lash-artists',         label: 'New Lash Artists (0-2 years, building clientele)' },
  { value: 'established-lash-artists', label: 'Established Lash Artists (3+ years, efficiency focused)' },
  { value: 'volume-specialists',       label: 'Volume Specialists (high client load, speed and consistency)' },
  { value: 'lash-lift-specialists',    label: 'Lash Lift Specialists (offering or exploring lift services)' },
  { value: 'salon-owners',             label: 'Salon Owners (managing staff, buying in bulk)' },
  { value: 'students',                 label: 'Students / Pre-Licensed (in training)' },
  { value: 'lapsed-customers',         label: 'Lapsed Customers (90+ days since last order)' },
  { value: 'subscribers',              label: 'Active Subscribers (Recharge, loyalty-focused)' },
]

// ── Product focus input ───────────────────────────────────────────────────────

const JUNK_PATTERNS = ['return', 'protection', 'package', 'shipping', 'insurance']

function isUrlInput(value: string) {
  const lower = value.toLowerCase()
  return lower.startsWith('http') || lower.startsWith('lashboxla.com')
}

function ProductFocusInput({
  value,
  onChange,
  onSelect,
  displayName,
  products,
  className,
}: {
  value: string
  onChange: (v: string) => void
  onSelect: (url: string, displayName: string) => void
  displayName: string
  products: { title: string; handle: string }[]
  className: string
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const suggestions = useMemo(() => {
    if (!value.trim() || isUrlInput(value)) return []
    const lower = value.toLowerCase()
    return products
      .filter((p) => {
        const t = p.title.toLowerCase()
        return t.includes(lower) && !JUNK_PATTERNS.some((pat) => t.includes(pat))
      })
      .slice(0, 8)
  }, [value, products])

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  const isUrl = isUrlInput(value)
  const showSuggestions = open && suggestions.length > 0 && !isUrl

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder="Paste a product URL or type a product name"
        className={className}
        autoComplete="off"
      />

      {/* URL detected — show product name if selected from typeahead, otherwise generic badge */}
      {isUrl && (
        <p className="mt-1.5 text-[11px] font-medium text-teal-deep">
          {displayName
            ? <>{displayName} &mdash; full product details will be fetched at generation time</>
            : 'Product data will be fetched at generation time'
          }
        </p>
      )}

      {/* Hint line when empty */}
      {!value && (
        <p className="mt-1 text-[11px] text-ink-3">
          e.g. lashboxla.com/products/omega-adhesive or just &ldquo;OMega adhesive&rdquo;
        </p>
      )}

      {/* Typeahead suggestions */}
      {showSuggestions && (
        <div className="absolute z-20 left-0 right-0 top-full mt-1 max-h-56 overflow-y-auto rounded-lg border border-cream-3 bg-white shadow-lg">
          {suggestions.map((p) => (
            <button
              key={p.title}
              type="button"
              className="w-full text-left px-3 py-2 text-sm text-ink hover:bg-cream transition-colors border-b border-cream-2 last:border-0"
              onMouseDown={(e) => {
                e.preventDefault() // prevent input blur before click registers
                onSelect(`https://lashboxla.com/products/${p.handle}`, p.title)
                setOpen(false)
              }}
            >
              {p.title}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

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
}: {
  history: ContentGeneration[]
  products: { title: string; handle: string }[]
}) {
  const [form, setForm] = useState<FormState>({
    channel: 'email',
    topic: '',
    productFocus: '',
    audience: 'all-lash-artists',
    talkingPoints: '',
  })
  const [productDisplayName, setProductDisplayName] = useState('')
  const [customAudience, setCustomAudience] = useState('')
  const [selectedTones, setSelectedTones] = useState<Set<string>>(new Set(['Educational']))
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<GenerationResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const [liveHistory, setLiveHistory] = useState<ContentGeneration[]>(history)

  // ── Topic suggestions ─────────────────────────────────────────────────────
  const [topicSuggestions, setTopicSuggestions] = useState<string[]>([])
  const [topicSuggestionsLoading, setTopicSuggestionsLoading] = useState(false)
  const [showTopicSuggestions, setShowTopicSuggestions] = useState(false)

  // ── Talking point suggestions ─────────────────────────────────────────────
  const [talkingPointSuggestions, setTalkingPointSuggestions] = useState<string[]>([])
  const [talkingPointSuggestionsLoading, setTalkingPointSuggestionsLoading] = useState(false)
  const [selectedTalkingPoints, setSelectedTalkingPoints] = useState<Set<number>>(new Set())
  const [showTalkingPointSuggestions, setShowTalkingPointSuggestions] = useState(false)
  const [talkingPointsFromProduct, setTalkingPointsFromProduct] = useState(false)
  const [topicRequiredMsg, setTopicRequiredMsg] = useState(false)

  // ── Auto-trigger talking points when product + topic are both set ─────────
  const lastAutoTriggerKey = useRef('')
  useEffect(() => {
    const topicReady = form.topic.length > 5
    const key = productDisplayName && topicReady ? `${productDisplayName}` : ''
    if (
      key &&
      key !== lastAutoTriggerKey.current &&
      !showTalkingPointSuggestions &&
      !talkingPointSuggestionsLoading
    ) {
      lastAutoTriggerKey.current = key
      setTalkingPointsFromProduct(true)
      setTalkingPointSuggestionsLoading(true)
      fetch('/api/content-studio/suggest-talking-points', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productFocus: form.productFocus, topic: form.topic, channel: form.channel }),
      })
        .then((r) => r.json())
        .then((data: { talkingPoints?: string[] }) => {
          if (data.talkingPoints?.length) {
            setTalkingPointSuggestions(data.talkingPoints)
            setShowTalkingPointSuggestions(true)
            setSelectedTalkingPoints(new Set())
          }
        })
        .catch(() => {})
        .finally(() => setTalkingPointSuggestionsLoading(false))
    }
    if (!productDisplayName) {
      lastAutoTriggerKey.current = ''
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productDisplayName, form.topic, showTalkingPointSuggestions, talkingPointSuggestionsLoading])

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

  async function fetchTopicSuggestions() {
    setTopicSuggestionsLoading(true)
    setShowTopicSuggestions(false)
    try {
      const res = await fetch('/api/content-studio/suggest-topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productFocus: form.productFocus || null }),
      })
      const data = await res.json() as { topics?: string[] }
      if (data.topics?.length) {
        setTopicSuggestions(data.topics)
        setShowTopicSuggestions(true)
      }
    } catch { /* ignore */ } finally {
      setTopicSuggestionsLoading(false)
    }
  }

  async function fetchTalkingPointSuggestions() {
    if (!form.topic) {
      setTopicRequiredMsg(true)
      setTimeout(() => setTopicRequiredMsg(false), 2500)
      return
    }
    setTalkingPointSuggestionsLoading(true)
    setTalkingPointsFromProduct(false)
    try {
      const res = await fetch('/api/content-studio/suggest-talking-points', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productFocus: form.productFocus || null, topic: form.topic, channel: form.channel }),
      })
      const data = await res.json() as { talkingPoints?: string[] }
      if (data.talkingPoints?.length) {
        setTalkingPointSuggestions(data.talkingPoints)
        setShowTalkingPointSuggestions(true)
        setSelectedTalkingPoints(new Set())
      }
    } catch { /* ignore */ } finally {
      setTalkingPointSuggestionsLoading(false)
    }
  }

  function addSelectedToNotes() {
    if (selectedTalkingPoints.size === 0) return
    const lines = talkingPointSuggestions
      .filter((_, i) => selectedTalkingPoints.has(i))
      .map((p) => `- ${p}`)
      .join('\n')
    const current = form.talkingPoints.trim()
    setField('talkingPoints', current ? `${current}\n${lines}` : lines)
    setShowTalkingPointSuggestions(false)
    setSelectedTalkingPoints(new Set())
  }

  function loadFromHistory(row: ContentGeneration) {
    setForm({
      channel: row.channel,
      topic: row.topic,
      productFocus: row.product_focus ?? '',
      audience: row.audience ?? '',
      talkingPoints: row.talking_points ?? '',
    })
    setProductDisplayName('')
    setCustomAudience(row.custom_audience ?? '')
    setSelectedTones(new Set(row.tones ?? ['Educational']))
    setShowTopicSuggestions(false)
    setShowTalkingPointSuggestions(false)
    setSelectedTalkingPoints(new Set())
    lastAutoTriggerKey.current = ''
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
          customAudience: customAudience || null,
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

  return (
    <div className="space-y-6">

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

        {/* ── Input Form ── */}
        <section className="rounded-2xl border border-cream-3 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-display text-lg font-semibold text-ink">Generate Content</h2>
            <Link
              href="/dashboard/content-studio/settings"
              className="flex items-center gap-1.5 rounded-lg border border-cream-3 px-2.5 py-1.5 text-xs font-medium text-ink-3 hover:border-teal/50 hover:text-teal transition"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M11 2l3 3-7 7H4v-3L11 2z" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M9 4l3 3" strokeLinecap="round" />
              </svg>
              Style Guide
            </Link>
          </div>

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
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-ink-2">Topic / Theme *</label>
                <button
                  type="button"
                  onClick={fetchTopicSuggestions}
                  disabled={topicSuggestionsLoading}
                  className="flex items-center gap-1 text-xs text-teal-deep hover:text-teal disabled:opacity-50 transition"
                >
                  {topicSuggestionsLoading ? (
                    <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-teal/30 border-t-teal" />
                  ) : (
                    <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M6 1v2M6 9v2M1 6h2M9 6h2M2.5 2.5l1.5 1.5M8 8l1.5 1.5M8 4l1.5-1.5M2.5 9.5L4 8" strokeLinecap="round"/>
                    </svg>
                  )}
                  {form.topic ? 'Refresh suggestions' : 'Suggest topics'}
                </button>
              </div>
              <input
                required
                value={form.topic}
                onChange={(e) => setField('topic', e.target.value)}
                placeholder="e.g. Restock reminder for CC curl lashes"
                className={inputCls}
              />
              {showTopicSuggestions && topicSuggestions.length > 0 && (
                <div className="mt-2 space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {topicSuggestions.map((s, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => { setField('topic', s); setShowTopicSuggestions(false) }}
                        className="rounded-full border border-cream-3 bg-cream px-3 py-1 text-xs text-ink hover:bg-teal hover:text-white hover:border-teal transition cursor-pointer"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowTopicSuggestions(false)}
                    className="text-[10px] text-ink-3 hover:text-ink-2 transition"
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </div>

            {/* Product Focus */}
            <div>
              <label className={labelCls}>Product Focus</label>
              <ProductFocusInput
                value={form.productFocus}
                onChange={(v) => { setField('productFocus', v); setProductDisplayName('') }}
                onSelect={(url, name) => { setField('productFocus', url); setProductDisplayName(name) }}
                displayName={productDisplayName}
                products={products}
                className={inputCls}
              />
            </div>

            {/* Target Audience */}
            <div>
              <label className={labelCls}>Target Audience</label>
              <select
                value={form.audience}
                onChange={(e) => setField('audience', e.target.value)}
                className={inputCls}
              >
                {PERSONA_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Custom Audience Detail */}
            <div>
              <label className={labelCls}>Custom Audience Detail <span className="font-normal text-ink-3">(optional)</span></label>
              <input
                type="text"
                value={customAudience}
                onChange={(e) => setCustomAudience(e.target.value)}
                placeholder="e.g. Artists who attended the Miko webinar, CC curl early adopters, Texas-based artists"
                className={inputCls}
              />
            </div>

            {/* Tone */}
            <div>
              <label className={labelCls}>Tone / Angle <span className="text-ink-3">(select at least one)</span></label>
              <TonePills selected={selectedTones} onToggle={toggleTone} />
            </div>

            {/* Key Talking Points */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-ink-2">Key Talking Points</label>
                <button
                  type="button"
                  onClick={fetchTalkingPointSuggestions}
                  disabled={talkingPointSuggestionsLoading}
                  className="flex items-center gap-1 text-xs text-teal-deep hover:text-teal disabled:opacity-50 transition"
                >
                  {talkingPointSuggestionsLoading ? (
                    <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-teal/30 border-t-teal" />
                  ) : (
                    <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M6 1v2M6 9v2M1 6h2M9 6h2M2.5 2.5l1.5 1.5M8 8l1.5 1.5M8 4l1.5-1.5M2.5 9.5L4 8" strokeLinecap="round"/>
                    </svg>
                  )}
                  Suggest
                </button>
              </div>
              {topicRequiredMsg && (
                <p className="mb-1 text-[11px] text-amber-600">Add a topic first</p>
              )}
              <textarea
                value={form.talkingPoints}
                onChange={(e) => setField('talkingPoints', e.target.value)}
                placeholder="e.g. 72hr hold time, now available in CC curl, bulk discount available..."
                className={inputCls + ' resize-none'}
                style={{ minHeight: '80px' }}
              />
              {showTalkingPointSuggestions && talkingPointSuggestions.length > 0 && (
                <div className="mt-2 rounded-lg border border-cream-3 bg-cream p-3 space-y-2">
                  <p className="text-[10px] font-data uppercase tracking-widest text-ink-3">
                    {talkingPointsFromProduct ? 'Suggested from product description' : 'Suggested talking points'}
                  </p>
                  {talkingPointSuggestions.map((point, i) => (
                    <label key={i} className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedTalkingPoints.has(i)}
                        onChange={(e) => {
                          setSelectedTalkingPoints((prev) => {
                            const next = new Set(prev)
                            if (e.target.checked) next.add(i)
                            else next.delete(i)
                            return next
                          })
                        }}
                        className="mt-0.5 h-3.5 w-3.5 accent-teal flex-shrink-0"
                      />
                      <span className="text-xs text-ink-2 leading-relaxed">{point}</span>
                    </label>
                  ))}
                  <div className="flex items-center gap-4 pt-1 border-t border-cream-2">
                    <button
                      type="button"
                      onClick={addSelectedToNotes}
                      disabled={selectedTalkingPoints.size === 0}
                      className="text-xs font-medium text-teal-deep hover:text-teal disabled:opacity-40 disabled:cursor-not-allowed transition"
                    >
                      Add selected to notes
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowTalkingPointSuggestions(false); setSelectedTalkingPoints(new Set()) }}
                      className="text-xs text-ink-3 hover:text-ink-2 transition"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}
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
