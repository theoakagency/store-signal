'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  SUBJECT_OPTIONS,
  GOAL_OPTIONS,
  OFFER_TYPE_OPTIONS,
  goalLabel,
} from '@/lib/contentStudioOptions'

// ── Types ─────────────────────────────────────────────────────────────────────

type Channel = 'email' | 'sms' | 'push'

/** One selected product or collection, rendered as a removable chip. */
interface FocusChip {
  value: string   // product URL, collection URL, or a typed name
  label: string   // display name
  kind: 'product' | 'collection'
}

interface EmailVersion { subject: string; preheader: string; body: string }
interface SmsVersion   { message: string }
interface PushVersion  { title: string; message: string }
type Version = EmailVersion | SmsVersion | PushVersion

interface GenerationResult { versions: Version[] }

interface AppliedFix   { rule: string; before: string; after: string }
interface FlaggedIssue { rule: string; text: string; suggestion: string }

/** Result of the editing pass: corrected copy plus a record of what changed. */
interface VersionReview {
  version: Record<string, string>
  fixes: AppliedFix[]
  flags: FlaggedIssue[]
}

export interface GenerationLogRow {
  id: string
  channel: 'email' | 'sms' | 'push'
  subject: string | null
  goal: string | null
  topic: string | null
  product_focus: string | null
  audience: string | null
  talking_points: string | null
  output: { versions: unknown[] }
  generated_at: string
}

type ContentLength = 'short' | 'long'

const LENGTH_OPTIONS: { value: ContentLength; label: string }[] = [
  { value: 'short', label: 'Short' },
  { value: 'long',  label: 'Long' },
]

interface FormState {
  channel: Channel
  audience: string
  talkingPoints: string
}

const CHANNEL_TABS: { id: Channel; label: string }[] = [
  { id: 'email', label: 'Email' },
  { id: 'sms',   label: 'SMS' },
  { id: 'push',  label: 'Push' },
]

// ── Product / collection multi-select ─────────────────────────────────────────

const JUNK_PATTERNS = ['return', 'protection', 'package', 'shipping', 'insurance']

function isUrlInput(value: string) {
  const lower = value.toLowerCase()
  return lower.startsWith('http') || lower.startsWith('lashboxla.com')
}

/** "omega-adhesive" → "Omega Adhesive" — a readable label before the server resolves it. */
function titleFromHandle(handle: string): string {
  return handle
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/**
 * Turn raw input into a chip. Accepts product URLs, collection URLs, and typed
 * product names. Returns null for input that cannot become a chip.
 */
function chipFromInput(raw: string, products: { title: string; handle: string }[]): FocusChip | null {
  const value = raw.trim()
  if (!value) return null

  const match = value.match(/\/(products|collections)\/([^/?#]+)/)
  if (match) {
    const [, kind, handle] = match
    if (kind === 'collections') {
      return { value, label: titleFromHandle(handle), kind: 'collection' }
    }
    // Prefer the real catalogue title when the handle is one we know.
    const known = products.find((p) => p.handle === handle)
    return { value, label: known?.title ?? titleFromHandle(handle), kind: 'product' }
  }

  // Not a URL — a typed product name is a valid focus on its own.
  return { value, label: value, kind: 'product' }
}

function FocusChips({ chips, onRemove }: { chips: FocusChip[]; onRemove: (value: string) => void }) {
  if (!chips.length) return null
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <span
          key={chip.value}
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
            chip.kind === 'collection'
              ? 'border-purple-200 bg-purple-50 text-purple-700'
              : 'border-teal/30 bg-teal/10 text-teal-deep'
          }`}
        >
          {chip.label}{chip.kind === 'collection' ? ' (collection)' : ''}
          <button
            type="button"
            onClick={() => onRemove(chip.value)}
            aria-label={`Remove ${chip.label}`}
            className="text-current opacity-50 hover:opacity-100 transition"
          >
            &times;
          </button>
        </span>
      ))}
    </div>
  )
}

function ProductMultiSelect({
  value,
  onChange,
  onAdd,
  products,
  chosen,
  className,
  placeholder = 'Paste a product or collection URL, or type a product name',
}: {
  value: string
  onChange: (v: string) => void
  onAdd: (chip: FocusChip) => void
  products: { title: string; handle: string }[]
  chosen: FocusChip[]
  className: string
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const suggestions = useMemo(() => {
    if (!value.trim() || isUrlInput(value)) return []
    const lower = value.toLowerCase()
    const taken = new Set(chosen.map((c) => c.value))
    return products
      .filter((p) => {
        const t = p.title.toLowerCase()
        return (
          t.includes(lower) &&
          !JUNK_PATTERNS.some((pat) => t.includes(pat)) &&
          !taken.has(`https://lashboxla.com/products/${p.handle}`)
        )
      })
      .slice(0, 8)
  }, [value, products, chosen])

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  // Commit whatever is typed — a URL or a free-text name — as a chip.
  function commitRaw() {
    const chip = chipFromInput(value, products)
    if (chip) {
      onAdd(chip)
      setOpen(false)
    }
  }

  const showSuggestions = open && suggestions.length > 0 && !isUrlInput(value)

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()   // never submits the form
            commitRaw()
          }
        }}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
      />

      <p className="mt-1 text-[11px] text-ink-3">
        Press Enter to add. Products and collections can be mixed.
      </p>

      {showSuggestions && (
        <div className="absolute z-20 left-0 right-0 top-full mt-1 max-h-56 overflow-y-auto rounded-lg border border-cream-3 bg-white shadow-lg">
          {suggestions.map((p) => (
            <button
              key={p.title}
              type="button"
              className="w-full text-left px-3 py-2 text-sm text-ink hover:bg-cream transition-colors border-b border-cream-2 last:border-0"
              onMouseDown={(e) => {
                e.preventDefault()
                onAdd({
                  value: `https://lashboxla.com/products/${p.handle}`,
                  label: p.title,
                  kind: 'product',
                })
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

// ── Email body rendering (handles **bold** and - bullets) ─────────────────────

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  if (parts.length === 1) return text
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : part
  )
}

function renderEmailBody(body: string): React.ReactNode {
  const lines = body.split('\n')
  const elements: React.ReactNode[] = []
  const bulletBuffer: string[] = []

  function flushBullets(key: string) {
    if (!bulletBuffer.length) return
    elements.push(
      <ul key={key} className="list-disc list-inside space-y-0.5 text-xs text-ink-2 leading-relaxed">
        {bulletBuffer.map((b, i) => <li key={i}>{renderInline(b)}</li>)}
      </ul>
    )
    bulletBuffer.length = 0
  }

  lines.forEach((line, idx) => {
    if (line.startsWith('- ')) {
      bulletBuffer.push(line.slice(2))
    } else {
      flushBullets(`b${idx}`)
      if (line.trim()) {
        elements.push(
          <p key={idx} className="text-xs text-ink-2 leading-relaxed">{renderInline(line)}</p>
        )
      }
    }
  })
  flushBullets('end')

  return <div className="space-y-1.5">{elements}</div>
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function WordCountBadge({ body }: { body: string }) {
  const count = wordCount(body)
  const color = count <= 180 ? 'text-green-600' : count <= 250 ? 'text-amber-500' : 'text-red-500'
  return <span className={`text-[10px] font-data ${color}`}>{count} words</span>
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ChannelTabs({ value, onChange }: { value: Channel; onChange: (c: Channel) => void }) {
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
  text: string; idx: number; copiedIdx: number | null; onCopy: (text: string, idx: number) => void
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

function EmailCard({ v, idx, copiedIdx, onCopy, review, reviewLoading }: {
  v: EmailVersion; idx: number; copiedIdx: number | null
  onCopy: (text: string, idx: number) => void
  review?: VersionReview | null; reviewLoading?: boolean
}) {
  const fullText = `Subject: ${v.subject}\nPreheader: ${v.preheader}\n\n${v.body}`
  return (
    <div className="rounded-xl border border-cream-3 bg-cream p-6 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-data uppercase tracking-widest text-ink-3">Version {idx + 1}</span>
          <ScoringSpinner loading={reviewLoading} />
        </div>
        <CopyButton text={fullText} idx={idx} copiedIdx={copiedIdx} onCopy={onCopy} />
      </div>
      <p className="text-sm font-semibold text-ink leading-snug">{v.subject}</p>
      {v.preheader && <p className="text-xs italic text-ink-3 leading-snug">{v.preheader}</p>}
      <div className="border-t border-cream-3 pt-3 space-y-2">
        {renderEmailBody(v.body)}
        <WordCountBadge body={v.body} />
      </div>
      <ChangeNotes review={review} />
    </div>
  )
}

function SmsCard({ v, idx, copiedIdx, onCopy, review, reviewLoading }: {
  v: SmsVersion; idx: number; copiedIdx: number | null
  onCopy: (text: string, idx: number) => void
  review?: VersionReview | null; reviewLoading?: boolean
}) {
  const overLimit = v.message.length > 160
  return (
    <div className="rounded-xl border border-cream-3 bg-cream p-6 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-data uppercase tracking-widest text-ink-3">Version {idx + 1}</span>
          <ScoringSpinner loading={reviewLoading} />
        </div>
        <div className="flex items-center gap-2">
          <span className={`font-data text-xs ${overLimit ? 'text-red-500 font-semibold' : 'text-ink-3'}`}>{v.message.length}/160</span>
          <CopyButton text={v.message} idx={idx} copiedIdx={copiedIdx} onCopy={onCopy} />
        </div>
      </div>
      <p className="whitespace-pre-wrap text-sm text-ink leading-relaxed">{v.message}</p>
      <ChangeNotes review={review} />
    </div>
  )
}

function PushCard({ v, idx, copiedIdx, onCopy, review, reviewLoading }: {
  v: PushVersion; idx: number; copiedIdx: number | null
  onCopy: (text: string, idx: number) => void
  review?: VersionReview | null; reviewLoading?: boolean
}) {
  const fullText = `${v.title}\n${v.message}`
  return (
    <div className="rounded-xl border border-cream-3 bg-cream p-6 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-data uppercase tracking-widest text-ink-3">Version {idx + 1}</span>
          <ScoringSpinner loading={reviewLoading} />
        </div>
        <CopyButton text={fullText} idx={idx} copiedIdx={copiedIdx} onCopy={onCopy} />
      </div>
      <p className="text-sm font-semibold text-ink">{v.title}</p>
      <p className="text-xs text-ink-2 leading-relaxed">{v.message}</p>
      <div className="flex gap-3">
        <span className={`font-data text-[10px] ${v.title.length > 40 ? 'text-red-500' : 'text-ink-3'}`}>Title: {v.title.length}/40</span>
        <span className={`font-data text-[10px] ${v.message.length > 100 ? 'text-red-500' : 'text-ink-3'}`}>Message: {v.message.length}/100</span>
      </div>
      <ChangeNotes review={review} />
    </div>
  )
}

// Scoring still runs; only the numeric score is hidden. Violations remain, shown
// by ViolationsPanel, which renders nothing when a version is clean.
function ScoringSpinner({ loading }: { loading?: boolean }) {
  if (!loading) return null
  return <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-teal/30 border-t-teal" />
}

function ChangeNotes({ review }: { review?: VersionReview | null }) {
  const [open, setOpen] = useState(false)
  if (!review) return null

  const total = review.fixes.length + review.flags.length
  if (total === 0) return null

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-[10px] text-ink-3 hover:text-ink-2 transition"
      >
        {open ? '▾' : '▸'} {total} note{total !== 1 ? 's' : ''}
      </button>
      {open && (
        <div className="mt-1.5 space-y-1.5">
          {/* Already corrected in the copy above. */}
          {review.fixes.map((f, i) => (
            <div key={`fix-${i}`} className="rounded-lg border border-green-100 bg-green-50 px-2.5 py-2">
              <p className="text-[11px] font-semibold text-green-800">Changed &middot; {f.rule}</p>
              <p className="mt-0.5 text-[11px] text-green-700">
                <span className="line-through opacity-70">{f.before}</span>
                {' → '}
                <span className="font-medium">{f.after}</span>
              </p>
            </div>
          ))}
          {/* Left as written — fixing these would change the meaning. */}
          {review.flags.map((f, i) => (
            <div key={`flag-${i}`} className="rounded-lg border border-amber-100 bg-amber-50 px-2.5 py-2">
              <p className="text-[11px] font-semibold text-amber-800">Worth a look &middot; {f.rule}</p>
              {f.text && <p className="mt-0.5 text-[11px] text-amber-700">Found: &ldquo;{f.text}&rdquo;</p>}
              {f.suggestion && <p className="mt-0.5 text-[11px] text-amber-600">Consider: {f.suggestion}</p>}
            </div>
          ))}
        </div>
      )}
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

// ── Main component ─────────────────────────────────────────────────────────────

export default function LblaContent({
  products,
  history = [],
}: {
  products: { title: string; handle: string }[]
  history?: GenerationLogRow[]
}) {
  const [form, setForm] = useState<FormState>({
    channel: 'email',
    audience: '',
    talkingPoints: '',
  })
  const [productInput, setProductInput] = useState('')
  const [focusChips, setFocusChips] = useState<FocusChip[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<GenerationResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)

  // ── URL param pre-fill (from Campaign Ideas) ─────────────────────────────
  const searchParams = useSearchParams()
  const router = useRouter()
  const [hasPrefill, setHasPrefill] = useState(false)

  // ── Subject + goal + conditional fields ──────────────────────────────────
  const [subject, setSubject] = useState('products')
  const [goal, setGoal] = useState('educate')
  const [pageUrl, setPageUrl] = useState('')
  const [contentLength, setContentLength] = useState<ContentLength>('short')
  const [offerType, setOfferType] = useState('percent-off')
  const [discountAmount, setDiscountAmount] = useState('')
  const [promoCode, setPromoCode] = useState('')
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})

  // ── Style-rule editing pass ──────────────────────────────────────────────
  const [reviews, setReviews] = useState<VersionReview[] | null>(null)
  const [reviewsLoading, setReviewsLoading] = useState(false)

  // ── Recent history (grows after new generations) ──────────────────────────
  const [recentHistory, setRecentHistory] = useState<GenerationLogRow[]>(history)

  // ── Helpers ───────────────────────────────────────────────────────────────

  // Subject-axis fields. Offer fields belong to the goal axis and clear separately.
  function clearSubjectFields() {
    setProductInput('')
    setFocusChips([])
    setPageUrl('')
    setValidationErrors({})
  }

  function clearGoalFields() {
    setOfferType('percent-off')
    setDiscountAmount('')
    setPromoCode('')
    setValidationErrors({})
  }

  function addChip(chip: FocusChip) {
    setFocusChips((prev) => (prev.some((c) => c.value === chip.value) ? prev : [...prev, chip]))
    setProductInput('')   // input clears after each selection
  }

  function removeChip(value: string) {
    setFocusChips((prev) => prev.filter((c) => c.value !== value))
  }

  // Display-only descriptor for the history list. Never sent as a topic.
  // Every chip carries a label, so this cannot come back empty when a product is
  // selected — the old free-text dead end is gone with getEffectiveTopic().
  function getHistoryLabel(): string {
    if (subject === 'products' && focusChips.length > 0) {
      const [first, ...rest] = focusChips
      return rest.length ? `${first.label} + ${rest.length} more` : first.label
    }
    if (subject === 'page' && pageUrl.trim()) return pageUrl.trim()
    return goalLabel(goal)
  }

  function validateForm(): Record<string, string> {
    const errs: Record<string, string> = {}
    if (subject === 'products' && focusChips.length === 0) {
      errs.productFocus = 'Add at least one product or collection'
    }
    if (subject === 'page' && !pageUrl.trim()) {
      errs.pageUrl = 'URL is required'
    }
    if (goal === 'promote' && !discountAmount.trim() && !promoCode.trim()) {
      errs.promoCode = 'Add a discount amount or promo code so the copy has something to reference.'
    }
    return errs
  }

  // ── Pre-fill from Campaign Ideas URL params ───────────────────────────────
  useEffect(() => {
    const channelP  = searchParams.get('channel') as Channel | null
    const subjectP  = searchParams.get('subject')
    const goalP     = searchParams.get('goal')
    const productsP = searchParams.getAll('productFocus')
    const audienceP = searchParams.get('audience')
    const notesP    = searchParams.get('whatShouldClaudeKnow')
    const pageUrlP  = searchParams.get('pageUrl')
    const offerP    = searchParams.get('offerType')
    const discountP = searchParams.get('discountAmount')
    const promoP    = searchParams.get('promoCode')

    if (!channelP && !subjectP && !goalP && !productsP.length) return

    // Params come from a URL and are not trusted: anything not matching a known
    // option value is ignored rather than written into state.
    const validSubject = subjectP && SUBJECT_OPTIONS.some((o) => o.value === subjectP) ? subjectP : null
    const validGoal    = goalP    && GOAL_OPTIONS.some((o) => o.value === goalP)       ? goalP    : null
    const validOffer   = offerP   && OFFER_TYPE_OPTIONS.some((o) => o.value === offerP) ? offerP  : null

    if (validSubject) setSubject(validSubject)
    if (validGoal)    setGoal(validGoal)
    if (channelP && ['email', 'sms', 'push'].includes(channelP)) setField('channel', channelP)

    if (productsP.length && (validSubject ?? 'products') === 'products') {
      const chips = productsP
        .map((raw) => chipFromInput(raw, products))
        .filter((c): c is FocusChip => c != null)
      if (chips.length) setFocusChips(chips)
    }

    if (pageUrlP && validSubject === 'page') setPageUrl(pageUrlP)
    if (audienceP) setField('audience', audienceP)   // free text, nothing to validate
    if (notesP) setField('talkingPoints', notesP)

    if (validGoal === 'promote') {
      if (validOffer) setOfferType(validOffer)
      if (discountP)  setDiscountAmount(discountP)
      if (promoP)     setPromoCode(promoP)
    }

    setHasPrefill(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // run once on mount

  function clearPrefill() {
    router.replace('/lbla/content')
    setHasPrefill(false)
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function handleCopy(text: string, idx: number) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIdx(idx)
      setTimeout(() => setCopiedIdx(null), 2000)
    })
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

    setIsLoading(true)
    setResult(null)
    setError(null)
    setReviews(null)

    const payload: Record<string, unknown> = {
      channel: form.channel,
      subject,
      goal,
      historyLabel,
      products: subject === 'products' ? focusChips.map((c) => c.value) : [],
      audience: form.audience.trim() || null,
      talkingPoints: form.talkingPoints || null,
      length: form.channel === 'sms' ? null : contentLength,
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
      const res = await fetch('/api/lbla/generate', {
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

      // The copy is good even when the history write failed — say so rather
      // than silently dropping the generation from Recent Generations.
      if (data.saveError) {
        setError(`Copy generated, but saving to Recent Generations failed: ${data.saveError}`)
      }

      // Style-rule editing pass, non-blocking. When it returns, the corrected
      // copy replaces what is on screen and the notes record what changed.
      setReviewsLoading(true)
      fetch('/api/lbla/score-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versions: data.data.versions, channel: form.channel }),
      })
        .then((r) => r.json() as Promise<{ results?: VersionReview[] }>)
        .then((reviewData) => {
          if (!reviewData.results?.length) return
          setReviews(reviewData.results)
          setResult({ versions: reviewData.results.map((r) => r.version as unknown as Version) })
        })
        .catch(() => {})
        .finally(() => setReviewsLoading(false))

      // Section 4: prepend to local history list (server already saved it)
      const logRow: GenerationLogRow = {
        id: crypto.randomUUID(),
        channel: form.channel,
        subject,
        goal,
        topic: historyLabel,
        product_focus: focusChips.length ? focusChips.map((c) => c.value).join(', ') : null,
        audience: form.audience.trim() || null,
        talking_points: form.talkingPoints || null,
        output: data.data as { versions: unknown[] },
        generated_at: new Date().toISOString(),
      }
      if (!data.saveError) {
        setRecentHistory((prev) => [logRow, ...prev].slice(0, 20))
      }
    } catch {
      setError('Network error — check console')
    } finally {
      setIsLoading(false)
    }
  }

  function loadFromHistory(row: GenerationLogRow) {
    setSubject(row.subject ?? 'products')
    setGoal(row.goal ?? 'educate')
    clearSubjectFields()
    clearGoalFields()
    setForm({
      channel: row.channel,
      audience: row.audience ?? '',
      talkingPoints: row.talking_points ?? '',
    })
    // product_focus is a comma-joined list of the raw chip values.
    setFocusChips(
      (row.product_focus ?? '')
        .split(', ')
        .map((v) => chipFromInput(v, products))
        .filter((c): c is FocusChip => c != null),
    )
    setResult(row.output as GenerationResult)
    setReviews(null)
    setError(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const inputCls = 'w-full rounded-lg border border-cream-3 bg-white px-3 py-2 text-sm text-ink focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal transition'
  const labelCls = 'block text-xs font-medium text-ink-2 mb-1'
  const errCls   = 'mt-1 text-[11px] text-red-500'

  return (
    <div className="mx-auto max-w-[1280px] px-6 py-8 lg:px-8 space-y-6">

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">

      {/* ── Form ── */}
      <section className="rounded-2xl border border-cream-3 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-lg font-semibold text-ink">Generate Content</h2>
        </div>

        <form onSubmit={handleGenerate} className="space-y-4">

          {/* Pre-fill banner */}
          {hasPrefill && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-teal/30 bg-teal/5 px-3 py-2">
              <p className="text-xs text-teal-deep font-medium">
                Pre-filled from Campaign Ideas — review and generate
              </p>
              <button
                type="button"
                onClick={clearPrefill}
                className="text-[11px] text-ink-3 underline hover:text-ink-2 transition shrink-0"
              >
                Clear
              </button>
            </div>
          )}

          {/* Channel */}
          <div>
            <label className={labelCls}>Channel</label>
            <ChannelTabs value={form.channel} onChange={(c) => { setField('channel', c); setResult(null) }} />
          </div>

          {/* Subject */}
          <div>
            <label className={labelCls}>Subject</label>
            <select
              value={subject}
              onChange={(e) => { setSubject(e.target.value); clearSubjectFields(); setResult(null) }}
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
              onChange={(e) => { setGoal(e.target.value); clearGoalFields(); setResult(null) }}
              className={inputCls}
            >
              {GOAL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Length — SMS is already length-constrained */}
          {form.channel !== 'sms' && (
            <div>
              <label className={labelCls}>Length</label>
              <div className="flex gap-1.5">
                {LENGTH_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setContentLength(opt.value)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                      contentLength === opt.value
                        ? 'border-teal bg-teal/10 text-teal-deep'
                        : 'border-cream-3 bg-white text-ink-3 hover:border-teal/40 hover:text-ink-2'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Subject-driven fields ── */}

          {subject === 'products' && (
            <div>
              <label className={labelCls}>Products <span className="text-red-400">*</span></label>
              <ProductMultiSelect
                value={productInput}
                onChange={setProductInput}
                onAdd={addChip}
                products={products}
                chosen={focusChips}
                className={inputCls + (validationErrors.productFocus ? ' border-red-400' : '')}
              />
              <FocusChips chips={focusChips} onRemove={removeChip} />
              {validationErrors.productFocus && <p className={errCls}>{validationErrors.productFocus}</p>}
              {focusChips.length > 5 && (
                <p className="mt-1.5 text-[11px] text-amber-600">
                  {focusChips.length} items selected. Past about five, the copy tends to turn into a list rather than a pitch.
                </p>
              )}
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
            <label className={labelCls}>What should Claude know?</label>
            <textarea
              value={form.talkingPoints}
              onChange={(e) => setField('talkingPoints', e.target.value)}
              placeholder="Paste a campaign brief, product notes, or any specifics Claude should work from. Include who this is going to if it matters, for example lapsed customers or new subscribers."
              className={inputCls + ' resize-none'}
              style={{ minHeight: '240px' }}
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">{error}</p>
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
      <section className="rounded-2xl border border-cream-3 bg-white shadow-sm flex flex-col overflow-hidden">
        <h2 className="shrink-0 px-6 pt-6 pb-5 font-display text-lg font-semibold text-ink">Generated Versions</h2>

        <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-3">
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

          {!isLoading && result && result.versions.map((v, i) => {
            const review = reviews?.[i] ?? null
            if (form.channel === 'email') return <EmailCard key={i} v={v as EmailVersion} idx={i} copiedIdx={copiedIdx} onCopy={handleCopy} review={review} reviewLoading={reviewsLoading && !reviews} />
            if (form.channel === 'sms')   return <SmsCard   key={i} v={v as SmsVersion}   idx={i} copiedIdx={copiedIdx} onCopy={handleCopy} review={review} reviewLoading={reviewsLoading && !reviews} />
            return <PushCard key={i} v={v as PushVersion} idx={i} copiedIdx={copiedIdx} onCopy={handleCopy} review={review} reviewLoading={reviewsLoading && !reviews} />
          })}
        </div>
      </section>

      </div>{/* end grid */}

      {/* ── Generation History Table ── */}
      <section className="rounded-2xl border border-cream-3 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-cream-2 px-5 py-3.5">
          <h2 className="font-display text-sm font-semibold text-ink">Generation History</h2>
          <span className="font-data text-xs text-ink-3">Recent {recentHistory.length}</span>
        </div>

        {recentHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
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
                {recentHistory.map((row) => (
                  <tr key={row.id} className="hover:bg-cream transition-colors">
                    <td className="px-5 py-3 font-data text-xs text-ink-3 whitespace-nowrap">
                      {new Date(row.generated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
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
                    <td className="px-5 py-3 text-ink max-w-[200px] truncate">{row.topic || row.product_focus || '—'}</td>
                    <td className="px-5 py-3 text-ink-2 text-xs max-w-[150px] truncate">{row.audience ?? '—'}</td>
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
