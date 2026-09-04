'use client'

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import Link from 'next/link'
import {
  SUBJECT_OPTIONS,
  GOAL_OPTIONS,
  OFFER_TYPE_OPTIONS,
  goalLabel,
} from '@/lib/contentStudioOptions'

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
  talking_points: string | null
  versions: GenerationResult
  created_at: string
  subject?: string | null
  goal?: string | null
}

interface FormState {
  channel: Channel
  productFocus: string
  audience: string
  talkingPoints: string
}

const CHANNEL_TABS: { id: Channel; label: string }[] = [
  { id: 'email', label: 'Email' },
  { id: 'sms',   label: 'SMS' },
  { id: 'push',  label: 'Push' },
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
  placeholder = 'Paste a product URL or type a product name',
}: {
  value: string
  onChange: (v: string) => void
  onSelect: (url: string, displayName: string) => void
  displayName: string
  products: { title: string; handle: string }[]
  className: string
  placeholder?: string
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
        placeholder={placeholder}
        className={className}
        autoComplete="off"
      />

      {isUrl && (
        <p className="mt-1.5 text-[11px] font-medium text-teal-deep">
          {displayName
            ? <>{displayName} &mdash; full product details will be fetched at generation time</>
            : 'Product data will be fetched at generation time'
          }
        </p>
      )}

      {!value && (
        <p className="mt-1 text-[11px] text-ink-3">
          e.g. lashboxla.com/products/omega-adhesive or just &ldquo;OMega adhesive&rdquo;
        </p>
      )}

      {showSuggestions && (
        <div className="absolute z-20 left-0 right-0 top-full mt-1 max-h-56 overflow-y-auto rounded-lg border border-cream-3 bg-white shadow-lg">
          {suggestions.map((p) => (
            <button
              key={p.title}
              type="button"
              className="w-full text-left px-3 py-2 text-sm text-ink hover:bg-cream transition-colors border-b border-cream-2 last:border-0"
              onMouseDown={(e) => {
                e.preventDefault()
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

// ── Suggest button ────────────────────────────────────────────────────────────

function SuggestButton({ onClick, loading, label }: { onClick: () => void; loading: boolean; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="flex items-center gap-1 text-xs text-teal-deep hover:text-teal disabled:opacity-50 transition"
    >
      {loading ? (
        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-teal/30 border-t-teal" />
      ) : (
        <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M6 1v2M6 9v2M1 6h2M9 6h2M2.5 2.5l1.5 1.5M8 8l1.5 1.5M8 4l1.5-1.5M2.5 9.5L4 8" strokeLinecap="round"/>
        </svg>
      )}
      {label}
    </button>
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
    productFocus: '',
    audience: '',
    talkingPoints: '',
  })
  const [productDisplayName, setProductDisplayName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<GenerationResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const [liveHistory, setLiveHistory] = useState<ContentGeneration[]>(history)

  // ── Subject + goal + conditional fields ───────────────────────────────────
  const [subject, setSubject] = useState('products')
  const [goal, setGoal] = useState('educate')
  const [pageUrl, setPageUrl] = useState('')
  const [offerType, setOfferType] = useState('percent-off')
  const [discountAmount, setDiscountAmount] = useState('')
  const [promoCode, setPromoCode] = useState('')
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})

  // ── Talking point suggestions ─────────────────────────────────────────────
  const [talkingPointSuggestions, setTalkingPointSuggestions] = useState<string[]>([])
  const [talkingPointSuggestionsLoading, setTalkingPointSuggestionsLoading] = useState(false)
  const [selectedTalkingPoints, setSelectedTalkingPoints] = useState<Set<number>>(new Set())
  const [showTalkingPointSuggestions, setShowTalkingPointSuggestions] = useState(false)
  const [talkingPointsFromProduct, setTalkingPointsFromProduct] = useState(false)
  const [topicRequiredMsg, setTopicRequiredMsg] = useState(false)

  // ── Helpers ───────────────────────────────────────────────────────────────

  // Clears the fields tied to the subject axis. Offer fields belong to the goal
  // axis and are cleared separately so switching one does not wipe the other.
  function clearSubjectFields() {
    setForm((f) => ({ ...f, productFocus: '' }))
    setProductDisplayName('')
    setPageUrl('')
    setValidationErrors({})
    setShowTalkingPointSuggestions(false)
  }

  function clearGoalFields() {
    setOfferType('percent-off')
    setDiscountAmount('')
    setPromoCode('')
    setValidationErrors({})
  }

  // Display-only descriptor: names the generation in the History table and is
  // stored as content_generations.topic. Never sent to the model as a topic.
  function getHistoryLabel(): string {
    const gLabel = goalLabel(goal)
    let base = ''
    if (subject === 'products') base = productDisplayName || form.productFocus.trim()
    else if (subject === 'page') base = pageUrl.trim()
    // 'Nothing specific' has no subject of its own, so the goal names it outright
    // rather than reading as "Educate (Educate)".
    if (!base) return gLabel
    return `${base} (${gLabel})`
  }

  function getEffectiveProductFocus(): string {
    return subject === 'products' ? form.productFocus : ''
  }

  function validateForm(): Record<string, string> {
    const errs: Record<string, string> = {}
    if (subject === 'products' && !form.productFocus.trim()) {
      errs.productFocus = 'Product is required'
    }
    if (subject === 'page' && !pageUrl.trim()) {
      errs.pageUrl = 'URL is required'
    }
    if (goal === 'promote' && !discountAmount.trim() && !promoCode.trim()) {
      errs.promoCode = 'Add a discount amount or promo code so the copy has something to reference.'
    }
    return errs
  }

  // ── Auto-trigger talking points when product selected (product type only) ──
  const lastAutoTriggerKey = useRef('')
  useEffect(() => {
    if (subject !== 'products') return
    const key = productDisplayName || ''
    if (
      key &&
      key !== lastAutoTriggerKey.current &&
      !showTalkingPointSuggestions &&
      !talkingPointSuggestionsLoading
    ) {
      lastAutoTriggerKey.current = key
      setTalkingPointsFromProduct(true)
      setTalkingPointSuggestionsLoading(true)
      const effectiveTopic = `Promote ${productDisplayName}`
      fetch('/api/content-studio/suggest-talking-points', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productFocus: form.productFocus, topic: effectiveTopic, channel: form.channel }),
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
  }, [productDisplayName, showTalkingPointSuggestions, talkingPointSuggestionsLoading, subject])

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  const handleCopy = useCallback((text: string, idx: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIdx(idx)
      setTimeout(() => setCopiedIdx(null), 2000)
    })
  }, [])

  async function fetchTalkingPointSuggestions() {
    // Suggestions need something descriptive to work from, so they use the
    // history label rather than the (often empty) user-typed topic.
    const effectiveTopic = getHistoryLabel()
    if (!effectiveTopic) {
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
        body: JSON.stringify({ productFocus: getEffectiveProductFocus() || null, topic: effectiveTopic, channel: form.channel }),
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
    setSubject(row.subject ?? 'products')
    setGoal(row.goal ?? 'educate')
    clearSubjectFields()
    clearGoalFields()
    setForm({
      channel: row.channel,
      productFocus: row.product_focus ?? '',
      audience: row.audience ?? '',
      talkingPoints: row.talking_points ?? '',
    })
    setProductDisplayName('')
    setShowTalkingPointSuggestions(false)
    setSelectedTalkingPoints(new Set())
    lastAutoTriggerKey.current = ''
    setResult(row.versions)
    setError(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault()

    const errs = validateForm()
    if (Object.keys(errs).length > 0) {
      setValidationErrors(errs)
      return
    }
    setValidationErrors({})

    const historyLabel = getHistoryLabel()
    if (!historyLabel) {
      setError('Please fill in the required fields above.')
      return
    }

    setIsLoading(true)
    setResult(null)
    setError(null)

    const payload: Record<string, unknown> = {
      channel: form.channel,
      subject,
      goal,
      historyLabel,
      productFocus: getEffectiveProductFocus() || null,
      audience: form.audience.trim() || null,
      talkingPoints: form.talkingPoints || null,
    }

    if (subject === 'page') {
      payload.pageUrl = pageUrl
    }
    if (goal === 'promote') {
      payload.offerType = offerType
      payload.discountAmount = discountAmount || null
      payload.promoCode = promoCode || null
    }

    try {
      const res = await fetch('/api/content-studio/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setError(data.error ?? 'Generation failed')
        return
      }
      setResult(data.data)
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
  const errCls = 'mt-1 text-[11px] text-red-500'

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

            {/* Subject */}
            <div>
              <label className={labelCls}>Subject</label>
              <select
                value={subject}
                onChange={(e) => {
                  setSubject(e.target.value)
                  clearSubjectFields()
                  setResult(null)
                }}
                className={inputCls}
              >
                {SUBJECT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Goal */}
            <div>
              <label className={labelCls}>Goal</label>
              <select
                value={goal}
                onChange={(e) => {
                  setGoal(e.target.value)
                  clearGoalFields()
                  setResult(null)
                }}
                className={inputCls}
              >
                {GOAL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* ── Subject-driven fields ── */}

            {subject === 'products' && (
              <div>
                <label className={labelCls}>Product <span className="text-red-400">*</span></label>
                <ProductFocusInput
                  value={form.productFocus}
                  onChange={(v) => { setField('productFocus', v); setProductDisplayName('') }}
                  onSelect={(url, name) => { setField('productFocus', url); setProductDisplayName(name) }}
                  displayName={productDisplayName}
                  products={products}
                  className={inputCls + (validationErrors.productFocus ? ' border-red-400' : '')}
                  placeholder="Paste a product URL or type a product name"
                />
                {validationErrors.productFocus && <p className={errCls}>{validationErrors.productFocus}</p>}
              </div>
            )}

            {subject === 'page' && (
              <div>
                <label className={labelCls}>URL <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  value={pageUrl}
                  onChange={(e) => setPageUrl(e.target.value)}
                  placeholder="https://lashboxla.com/pages/..."
                  className={inputCls + (validationErrors.pageUrl ? ' border-red-400' : '')}
                />
                {validationErrors.pageUrl && <p className={errCls}>{validationErrors.pageUrl}</p>}
                <p className="mt-1 text-[11px] text-ink-3">
                  Event names, dates, and any other specifics go in the notes box below.
                </p>
              </div>
            )}

            {/* ── Goal-driven fields ── */}

            {goal === 'promote' && (
              <>
                <div>
                  <label className={labelCls}>Offer Type</label>
                  <select
                    value={offerType}
                    onChange={(e) => {
                      const next = e.target.value
                      setOfferType(next)
                      if (next !== 'percent-off' && next !== 'dollar-off') setDiscountAmount('')
                    }}
                    className={inputCls}
                  >
                    {OFFER_TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                {(offerType === 'percent-off' || offerType === 'dollar-off') && (
                  <div>
                    <label className={labelCls}>Discount Amount <span className="font-normal text-ink-3">(optional)</span></label>
                    <input
                      value={discountAmount}
                      onChange={(e) => setDiscountAmount(e.target.value)}
                      placeholder={offerType === 'percent-off' ? 'e.g. 20%' : 'e.g. $15 off'}
                      className={inputCls}
                    />
                  </div>
                )}
                <div>
                  <label className={labelCls}>Promo Code <span className="font-normal text-ink-3">(optional)</span></label>
                  <input
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value)}
                    placeholder="e.g. SPRING20"
                    className={inputCls + (validationErrors.promoCode ? ' border-red-400' : '')}
                  />
                  {validationErrors.promoCode && <p className={errCls}>{validationErrors.promoCode}</p>}
                </div>
              </>
            )}

            {/* ── Fixed bottom fields ── */}

            {/* Audience */}
            <div>
              <label className={labelCls}>Audience <span className="font-normal text-ink-3">(optional)</span></label>
              <input
                type="text"
                value={form.audience}
                onChange={(e) => setField('audience', e.target.value)}
                placeholder="e.g. customers who haven't ordered in 6 months, new subscribers, Korean lash lift customers"
                className={inputCls}
              />
            </div>

            {/* What should Claude know? */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-ink-2">What should Claude know?</label>
                <SuggestButton onClick={fetchTalkingPointSuggestions} loading={talkingPointSuggestionsLoading} label="Suggest" />
              </div>
              {topicRequiredMsg && (
                <p className="mb-1 text-[11px] text-amber-600">Fill in the required fields first</p>
              )}
              <textarea
                value={form.talkingPoints}
                onChange={(e) => setField('talkingPoints', e.target.value)}
                placeholder="Paste a campaign brief, product notes, or any specifics Claude should work from. Include who this is going to if it matters, for example lapsed customers or new subscribers."
                className={inputCls + ' resize-none'}
                style={{ minHeight: '240px' }}
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
              disabled={isLoading}
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
                <span className="font-medium text-ink-2">&ldquo;Generate Content&rdquo;</span>
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
