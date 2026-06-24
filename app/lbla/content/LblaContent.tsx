'use client'

import { useState, useEffect, useRef, useMemo } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

type Channel = 'email' | 'sms' | 'push'

interface EmailVersion { subject: string; preheader: string; body: string }
interface SmsVersion   { message: string }
interface PushVersion  { title: string; message: string }
type Version = EmailVersion | SmsVersion | PushVersion

interface GenerationResult { versions: Version[] }

interface VersionScore {
  score: number
  violations: { rule: string; text: string; suggestion: string }[]
  passed: boolean
}

export interface GenerationLogRow {
  id: string
  channel: 'email' | 'sms' | 'push'
  content_type: string | null
  topic: string | null
  product_focus: string | null
  audience: string | null
  tones: string[] | null
  talking_points: string | null
  output: { versions: unknown[] }
  generated_at: string
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

const CONTENT_TYPE_OPTIONS = [
  { value: 'product',      label: 'Product' },
  { value: 'collection',   label: 'Collection' },
  { value: 'landing-page', label: 'Landing Page' },
  { value: 'event',        label: 'Event' },
  { value: 'educational',  label: 'Educational' },
  { value: 'brand',        label: 'Brand' },
  { value: 'promotion',    label: 'Promotion' },
  { value: 'other',        label: 'Other' },
]

const OFFER_TYPE_OPTIONS = [
  { value: 'percent-off',    label: 'Percent Off' },
  { value: 'dollar-off',     label: 'Dollar Off' },
  { value: 'free-shipping',  label: 'Free Shipping' },
  { value: 'bogo',           label: 'Buy One Get One' },
  { value: 'bundle',         label: 'Bundle Deal' },
  { value: 'flash-sale',     label: 'Flash Sale' },
  { value: 'loyalty-reward', label: 'Loyalty Reward' },
  { value: 'referral',       label: 'Referral Offer' },
]

// ── Product focus input with typeahead ────────────────────────────────────────

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

function TonePills({ selected, onToggle }: { selected: Set<string>; onToggle: (tone: string) => void }) {
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

function EmailCard({ v, idx, copiedIdx, onCopy, score, scoreLoading }: {
  v: EmailVersion; idx: number; copiedIdx: number | null
  onCopy: (text: string, idx: number) => void
  score?: VersionScore | null; scoreLoading?: boolean
}) {
  const fullText = `Subject: ${v.subject}\nPreheader: ${v.preheader}\n\n${v.body}`
  return (
    <div className="rounded-xl border border-cream-3 bg-cream p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-data uppercase tracking-widest text-ink-3">Version {idx + 1}</span>
          <ScoreBadge score={score} loading={scoreLoading} />
        </div>
        <CopyButton text={fullText} idx={idx} copiedIdx={copiedIdx} onCopy={onCopy} />
      </div>
      <p className="text-sm font-semibold text-ink leading-snug">{v.subject}</p>
      {v.preheader && <p className="text-xs italic text-ink-3 leading-snug">{v.preheader}</p>}
      <div className="mt-2 border-t border-cream-3 pt-2">
        <p className="whitespace-pre-wrap text-xs text-ink-2 leading-relaxed">{v.body}</p>
      </div>
      {score && score.violations.length > 0 && <ViolationsPanel violations={score.violations} />}
    </div>
  )
}

function SmsCard({ v, idx, copiedIdx, onCopy, score, scoreLoading }: {
  v: SmsVersion; idx: number; copiedIdx: number | null
  onCopy: (text: string, idx: number) => void
  score?: VersionScore | null; scoreLoading?: boolean
}) {
  const overLimit = v.message.length > 160
  return (
    <div className="rounded-xl border border-cream-3 bg-cream p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-data uppercase tracking-widest text-ink-3">Version {idx + 1}</span>
          <ScoreBadge score={score} loading={scoreLoading} />
        </div>
        <div className="flex items-center gap-2">
          <span className={`font-data text-xs ${overLimit ? 'text-red-500 font-semibold' : 'text-ink-3'}`}>{v.message.length}/160</span>
          <CopyButton text={v.message} idx={idx} copiedIdx={copiedIdx} onCopy={onCopy} />
        </div>
      </div>
      <p className="whitespace-pre-wrap text-sm text-ink leading-relaxed">{v.message}</p>
      {score && score.violations.length > 0 && <ViolationsPanel violations={score.violations} />}
    </div>
  )
}

function PushCard({ v, idx, copiedIdx, onCopy, score, scoreLoading }: {
  v: PushVersion; idx: number; copiedIdx: number | null
  onCopy: (text: string, idx: number) => void
  score?: VersionScore | null; scoreLoading?: boolean
}) {
  const fullText = `${v.title}\n${v.message}`
  return (
    <div className="rounded-xl border border-cream-3 bg-cream p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-data uppercase tracking-widest text-ink-3">Version {idx + 1}</span>
          <ScoreBadge score={score} loading={scoreLoading} />
        </div>
        <CopyButton text={fullText} idx={idx} copiedIdx={copiedIdx} onCopy={onCopy} />
      </div>
      <p className="text-sm font-semibold text-ink">{v.title}</p>
      <p className="text-xs text-ink-2 leading-relaxed">{v.message}</p>
      <div className="flex gap-3 pt-0.5">
        <span className={`font-data text-[10px] ${v.title.length > 40 ? 'text-red-500' : 'text-ink-3'}`}>Title: {v.title.length}/40</span>
        <span className={`font-data text-[10px] ${v.message.length > 100 ? 'text-red-500' : 'text-ink-3'}`}>Message: {v.message.length}/100</span>
      </div>
      {score && score.violations.length > 0 && <ViolationsPanel violations={score.violations} />}
    </div>
  )
}

function ScoreBadge({ score, loading }: { score?: VersionScore | null; loading?: boolean }) {
  if (loading) return <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-teal/30 border-t-teal" />
  if (!score) return null
  const s = score.score
  const color = s >= 85 ? 'bg-green-50 text-green-700 border-green-200'
              : s >= 70 ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-red-50 text-red-700 border-red-200'
  const label = s >= 85 ? 'On brand' : s >= 70 ? 'Review needed' : 'Off brand'
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${color}`}>
      {s} — {label}
    </span>
  )
}

function ViolationsPanel({ violations }: { violations: VersionScore['violations'] }) {
  const [open, setOpen] = useState(false)
  if (!violations.length) return null
  return (
    <div className="mt-1">
      <button type="button" onClick={() => setOpen((v) => !v)} className="text-[10px] text-ink-3 hover:text-ink-2 transition">
        {open ? '▾' : '▸'} {violations.length} note{violations.length !== 1 ? 's' : ''}
      </button>
      {open && (
        <div className="mt-1.5 space-y-1.5">
          {violations.map((v, i) => (
            <div key={i} className="rounded-lg border border-amber-100 bg-amber-50 px-2.5 py-2">
              <p className="text-[11px] font-semibold text-amber-800">{v.rule}</p>
              {v.text && <p className="mt-0.5 text-[11px] text-amber-700">Found: &ldquo;{v.text}&rdquo;</p>}
              {v.suggestion && <p className="mt-0.5 text-[11px] text-amber-600">Try: {v.suggestion}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function GenerationHistory({
  history,
  onLoad,
}: {
  history: GenerationLogRow[]
  onLoad: (row: GenerationLogRow) => void
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  if (!history.length) return null

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(null), 2000)
    })
  }

  function versionText(v: unknown, channel: string): string {
    const r = v as Record<string, string>
    if (channel === 'email') return `Subject: ${r.subject ?? ''}\nPreheader: ${r.preheader ?? ''}\n\n${r.body ?? ''}`
    if (channel === 'sms')   return r.message ?? ''
    return `${r.title ?? ''}\n${r.message ?? ''}`
  }

  return (
    <section className="mt-10">
      <h2 className="font-display text-base font-semibold text-ink mb-3">Recent Generations</h2>
      <div className="space-y-2">
        {history.map((row) => {
          const isOpen = expandedId === row.id
          const date = new Date(row.generated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
          return (
            <div key={row.id} className="rounded-xl border border-cream-3 bg-cream">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                onClick={() => setExpandedId(isOpen ? null : row.id)}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{row.topic || row.product_focus || 'Untitled'}</p>
                  <p className="text-[11px] text-ink-3 mt-0.5">
                    <span className="font-data uppercase">{row.channel}</span>
                    {row.content_type && row.content_type !== row.channel ? ` · ${row.content_type}` : ''}
                    {row.audience ? ` · ${row.audience.replace(/-/g, ' ')}` : ''}
                    {' · '}
                    {date}
                  </p>
                </div>
                <span className={`shrink-0 text-ink-3 transition-transform ${isOpen ? 'rotate-180' : ''}`}>
                  <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </button>

              {isOpen && (
                <div className="border-t border-cream-3 px-4 pb-4 pt-3 space-y-3">
                  {(row.output.versions ?? []).map((v, i) => {
                    const text = versionText(v, row.channel)
                    const copyKey = `${row.id}-${i}`
                    const vr = v as Record<string, string>
                    return (
                      <div key={i} className="rounded-lg border border-cream-3 bg-white p-3 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-data uppercase tracking-widest text-ink-3">Version {i + 1}</span>
                          <button
                            type="button"
                            onClick={() => copy(text, copyKey)}
                            className="text-xs text-ink-3 hover:text-teal transition font-medium"
                          >
                            {copiedKey === copyKey ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                        {row.channel === 'email' && (
                          <>
                            <p className="text-sm font-semibold text-ink leading-snug">{vr.subject}</p>
                            {vr.preheader && <p className="text-xs italic text-ink-3">{vr.preheader}</p>}
                            <p className="whitespace-pre-wrap text-xs text-ink-2 leading-relaxed border-t border-cream-3 pt-2 mt-2">{vr.body}</p>
                          </>
                        )}
                        {row.channel === 'sms' && (
                          <p className="whitespace-pre-wrap text-sm text-ink leading-relaxed">{vr.message}</p>
                        )}
                        {row.channel === 'push' && (
                          <>
                            <p className="text-sm font-semibold text-ink">{vr.title}</p>
                            <p className="text-xs text-ink-2">{vr.message}</p>
                          </>
                        )}
                      </div>
                    )
                  })}
                  <button
                    type="button"
                    onClick={() => { onLoad(row); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                    className="w-full rounded-lg border border-teal/30 bg-teal/5 py-2 text-xs font-semibold text-teal-deep transition hover:bg-teal/10"
                  >
                    Use this again
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
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

function TopicSuggestionPills({ suggestions, onSelect, onDismiss }: {
  suggestions: string[]; onSelect: (s: string) => void; onDismiss: () => void
}) {
  if (!suggestions.length) return null
  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((s, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onSelect(s)}
            className="rounded-full border border-cream-3 bg-cream px-3 py-1 text-xs text-ink hover:bg-teal hover:text-white hover:border-teal transition cursor-pointer"
          >
            {s}
          </button>
        ))}
      </div>
      <button type="button" onClick={onDismiss} className="text-[10px] text-ink-3 hover:text-ink-2 transition">Dismiss</button>
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

  // ── Content type + conditional fields ────────────────────────────────────
  const [contentType, setContentType] = useState('product')
  const [collectionUrl, setCollectionUrl] = useState('')
  const [landingPageUrl, setLandingPageUrl] = useState('')
  const [landingPageDescription, setLandingPageDescription] = useState('')
  const [eventName, setEventName] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [eventUrl, setEventUrl] = useState('')
  const [offerType, setOfferType] = useState('percent-off')
  const [discountAmount, setDiscountAmount] = useState('')
  const [promoCode, setPromoCode] = useState('')
  const [offerEndDate, setOfferEndDate] = useState('')
  const [offerDetails, setOfferDetails] = useState('')
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})

  // ── Brand voice scoring (Section 5) ──────────────────────────────────────
  const [scores, setScores] = useState<VersionScore[] | null>(null)
  const [scoresLoading, setScoresLoading] = useState(false)

  // ── Recent history (grows after new generations) ──────────────────────────
  const [recentHistory, setRecentHistory] = useState<GenerationLogRow[]>(history)

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

  // ── Helpers ───────────────────────────────────────────────────────────────

  function clearConditionalFields() {
    setForm((f) => ({ ...f, topic: '', productFocus: '' }))
    setProductDisplayName('')
    setCollectionUrl('')
    setLandingPageUrl('')
    setLandingPageDescription('')
    setEventName('')
    setEventDate('')
    setEventUrl('')
    setOfferType('percent-off')
    setDiscountAmount('')
    setPromoCode('')
    setOfferEndDate('')
    setOfferDetails('')
    setValidationErrors({})
    setShowTopicSuggestions(false)
    setShowTalkingPointSuggestions(false)
  }

  function getEffectiveTopic(): string {
    switch (contentType) {
      case 'product':
        if (form.topic) return form.topic
        return productDisplayName ? `Promote ${productDisplayName}` : ''
      case 'collection':
        return form.topic
      case 'landing-page':
        return landingPageDescription ? landingPageDescription.slice(0, 120) : ''
      case 'event':
        return eventName ? `${eventName}${eventDate ? ` on ${eventDate}` : ''}` : ''
      case 'promotion': {
        const offerLabel = OFFER_TYPE_OPTIONS.find((o) => o.value === offerType)?.label ?? offerType
        const parts = [offerLabel, discountAmount, promoCode ? `Code: ${promoCode}` : ''].filter(Boolean)
        return parts.join(' - ') || 'Promotion'
      }
      default:
        return form.topic
    }
  }

  function getEffectiveProductFocus(): string {
    if (contentType === 'product' || contentType === 'educational' || contentType === 'promotion') {
      return form.productFocus
    }
    if (contentType === 'collection') return collectionUrl
    return ''
  }

  function validateForm(): Record<string, string> {
    const errs: Record<string, string> = {}
    switch (contentType) {
      case 'product':
        if (!form.productFocus.trim()) errs.productFocus = 'Product is required'
        break
      case 'collection':
        if (!collectionUrl.trim()) errs.collectionUrl = 'Collection URL is required'
        if (!form.topic.trim()) errs.topic = 'Topic is required'
        break
      case 'landing-page':
        if (!landingPageUrl.trim()) errs.landingPageUrl = 'Landing page URL is required'
        if (!landingPageDescription.trim()) errs.landingPageDescription = 'Description is required'
        break
      case 'event':
        if (!eventName.trim()) errs.eventName = 'Event name is required'
        break
      case 'educational':
      case 'brand':
      case 'other':
        if (!form.topic.trim()) errs.topic = 'Topic is required'
        break
    }
    return errs
  }

  // ── Auto-trigger talking points when product selected ─────────────────────
  const lastAutoTriggerKey = useRef('')
  useEffect(() => {
    if (contentType !== 'product') return
    const key = productDisplayName || ''
    if (key && key !== lastAutoTriggerKey.current && !showTalkingPointSuggestions && !talkingPointSuggestionsLoading) {
      lastAutoTriggerKey.current = key
      setTalkingPointsFromProduct(true)
      setTalkingPointSuggestionsLoading(true)
      const effectiveTopic = `Promote ${productDisplayName}`
      fetch('/api/lbla/suggest-talking-points', {
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
    if (!productDisplayName) lastAutoTriggerKey.current = ''
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productDisplayName, showTalkingPointSuggestions, talkingPointSuggestionsLoading, contentType])

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function toggleTone(tone: string) {
    setSelectedTones((prev) => {
      const next = new Set(prev)
      if (next.has(tone)) {
        if (next.size === 1) return prev
        next.delete(tone)
      } else {
        next.add(tone)
      }
      return next
    })
  }

  function handleCopy(text: string, idx: number) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIdx(idx)
      setTimeout(() => setCopiedIdx(null), 2000)
    })
  }

  async function fetchTopicSuggestions() {
    setTopicSuggestionsLoading(true)
    setShowTopicSuggestions(false)
    try {
      const res = await fetch('/api/lbla/suggest-topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productFocus: getEffectiveProductFocus() || null, contentType }),
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
    const effectiveTopic = getEffectiveTopic()
    if (!effectiveTopic) {
      setTopicRequiredMsg(true)
      setTimeout(() => setTopicRequiredMsg(false), 2500)
      return
    }
    setTalkingPointSuggestionsLoading(true)
    setTalkingPointsFromProduct(false)
    try {
      const res = await fetch('/api/lbla/suggest-talking-points', {
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

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault()
    if (selectedTones.size === 0) return

    const errs = validateForm()
    if (Object.keys(errs).length > 0) {
      setValidationErrors(errs)
      return
    }
    setValidationErrors({})

    const effectiveTopic = getEffectiveTopic()
    if (!effectiveTopic) {
      setError('Please fill in the required fields above.')
      return
    }

    setIsLoading(true)
    setResult(null)
    setError(null)
    setScores(null)

    const payload: Record<string, unknown> = {
      channel: form.channel,
      contentType,
      topic: effectiveTopic,
      productFocus: getEffectiveProductFocus() || null,
      audience: form.audience || null,
      customAudience: customAudience || null,
      tones: Array.from(selectedTones),
      talkingPoints: form.talkingPoints || null,
    }

    if (contentType === 'promotion') {
      payload.offerType = offerType
      payload.discountAmount = discountAmount || null
      payload.promoCode = promoCode || null
      payload.offerEndDate = offerEndDate || null
      payload.offerDetails = offerDetails || null
    }
    if (contentType === 'event') {
      payload.eventName = eventName
      payload.eventDate = eventDate || null
      payload.eventUrl = eventUrl || null
    }
    if (contentType === 'landing-page') {
      payload.landingPageUrl = landingPageUrl
      payload.landingPageDescription = landingPageDescription
    }
    if (contentType === 'collection') {
      payload.collectionUrl = collectionUrl
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

      // Section 5: fire brand voice scoring non-blocking
      setScoresLoading(true)
      fetch('/api/lbla/score-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versions: data.data.versions, channel: form.channel }),
      })
        .then((r) => r.json() as Promise<{ scores?: VersionScore[] }>)
        .then((scoreData) => { if (scoreData.scores) setScores(scoreData.scores) })
        .catch(() => {})
        .finally(() => setScoresLoading(false))

      // Section 4: prepend to local history list (server already saved it)
      const logRow: GenerationLogRow = {
        id: crypto.randomUUID(),
        channel: form.channel,
        content_type: contentType,
        topic: effectiveTopic,
        product_focus: getEffectiveProductFocus() || null,
        audience: form.audience || null,
        tones: Array.from(selectedTones),
        talking_points: form.talkingPoints || null,
        output: data.data as { versions: unknown[] },
        generated_at: new Date().toISOString(),
      }
      setRecentHistory((prev) => [logRow, ...prev].slice(0, 10))
    } catch {
      setError('Network error — check console')
    } finally {
      setIsLoading(false)
    }
  }

  function loadFromHistory(row: GenerationLogRow) {
    setField('channel', row.channel)
    setContentType(row.content_type ?? 'product')
    setField('topic', row.topic ?? '')
    setField('productFocus', row.product_focus ?? '')
    setProductDisplayName(row.product_focus ? row.product_focus.split('/').pop() ?? '' : '')
    setField('audience', row.audience ?? 'all-lash-artists')
    setField('talkingPoints', row.talking_points ?? '')
    setSelectedTones(new Set(row.tones ?? ['Educational']))
    setResult(row.output as GenerationResult)
    setScores(null)
  }

  const inputCls = 'w-full rounded-lg border border-cream-3 bg-white px-3 py-2 text-sm text-ink focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal transition'
  const labelCls = 'block text-xs font-medium text-ink-2 mb-1'
  const errCls   = 'mt-1 text-[11px] text-red-500'

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">

      {/* ── Form ── */}
      <section className="rounded-2xl border border-cream-3 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-lg font-semibold text-ink">Generate Content</h2>
        </div>

        <form onSubmit={handleGenerate} className="space-y-4">

          {/* Channel */}
          <div>
            <label className={labelCls}>Channel</label>
            <ChannelTabs value={form.channel} onChange={(c) => { setField('channel', c); setResult(null) }} />
          </div>

          {/* Content Type */}
          <div>
            <label className={labelCls}>Content Type</label>
            <select
              value={contentType}
              onChange={(e) => { setContentType(e.target.value); clearConditionalFields(); setResult(null) }}
              className={inputCls}
            >
              {CONTENT_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* ── Conditional fields ── */}

          {/* product */}
          {contentType === 'product' && (
            <>
              <div>
                <label className={labelCls}>Product <span className="text-red-400">*</span></label>
                <ProductFocusInput
                  value={form.productFocus}
                  onChange={(v) => { setField('productFocus', v); setProductDisplayName(''); setField('topic', '') }}
                  onSelect={(url, name) => { setField('productFocus', url); setProductDisplayName(name); setField('topic', '') }}
                  displayName={productDisplayName}
                  products={products}
                  className={inputCls + (validationErrors.productFocus ? ' border-red-400' : '')}
                  placeholder="Paste a product URL or type a product name"
                />
                {validationErrors.productFocus && <p className={errCls}>{validationErrors.productFocus}</p>}
              </div>
              {form.productFocus && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-ink-2">
                      Content Angle <span className="font-normal text-ink-3">(optional)</span>
                    </label>
                    <SuggestButton onClick={fetchTopicSuggestions} loading={topicSuggestionsLoading} label="Suggest angles" />
                  </div>
                  {showTopicSuggestions && (
                    <TopicSuggestionPills
                      suggestions={topicSuggestions}
                      onSelect={(s) => { setField('topic', s); setShowTopicSuggestions(false) }}
                      onDismiss={() => setShowTopicSuggestions(false)}
                    />
                  )}
                </div>
              )}
            </>
          )}

          {/* collection */}
          {contentType === 'collection' && (
            <>
              <div>
                <label className={labelCls}>Collection URL <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  value={collectionUrl}
                  onChange={(e) => setCollectionUrl(e.target.value)}
                  placeholder="https://lashboxla.com/collections/..."
                  className={inputCls + (validationErrors.collectionUrl ? ' border-red-400' : '')}
                />
                {validationErrors.collectionUrl && <p className={errCls}>{validationErrors.collectionUrl}</p>}
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-ink-2">Topic / Angle <span className="text-red-400">*</span></label>
                  <SuggestButton onClick={fetchTopicSuggestions} loading={topicSuggestionsLoading} label="Suggest topics" />
                </div>
                <input
                  value={form.topic}
                  onChange={(e) => setField('topic', e.target.value)}
                  placeholder="e.g. Best sellers for spring volume sets"
                  className={inputCls + (validationErrors.topic ? ' border-red-400' : '')}
                />
                {validationErrors.topic && <p className={errCls}>{validationErrors.topic}</p>}
                {showTopicSuggestions && (
                  <TopicSuggestionPills
                    suggestions={topicSuggestions}
                    onSelect={(s) => { setField('topic', s); setShowTopicSuggestions(false) }}
                    onDismiss={() => setShowTopicSuggestions(false)}
                  />
                )}
              </div>
            </>
          )}

          {/* landing-page */}
          {contentType === 'landing-page' && (
            <>
              <div>
                <label className={labelCls}>Landing Page URL <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  value={landingPageUrl}
                  onChange={(e) => setLandingPageUrl(e.target.value)}
                  placeholder="https://lashboxla.com/pages/..."
                  className={inputCls + (validationErrors.landingPageUrl ? ' border-red-400' : '')}
                />
                {validationErrors.landingPageUrl && <p className={errCls}>{validationErrors.landingPageUrl}</p>}
              </div>
              <div>
                <label className={labelCls}>What is this page about? <span className="text-red-400">*</span></label>
                <textarea
                  value={landingPageDescription}
                  onChange={(e) => setLandingPageDescription(e.target.value)}
                  placeholder="Describe the page goal, offer, or content — Claude will use this as the topic"
                  className={inputCls + ' resize-none' + (validationErrors.landingPageDescription ? ' border-red-400' : '')}
                  style={{ minHeight: '72px' }}
                />
                {validationErrors.landingPageDescription && <p className={errCls}>{validationErrors.landingPageDescription}</p>}
              </div>
            </>
          )}

          {/* event */}
          {contentType === 'event' && (
            <>
              <div>
                <label className={labelCls}>Event Name <span className="text-red-400">*</span></label>
                <input
                  value={eventName}
                  onChange={(e) => setEventName(e.target.value)}
                  placeholder="e.g. Spring Lash Summit, Miko Live Webinar"
                  className={inputCls + (validationErrors.eventName ? ' border-red-400' : '')}
                />
                {validationErrors.eventName && <p className={errCls}>{validationErrors.eventName}</p>}
              </div>
              <div>
                <label className={labelCls}>Event Date <span className="font-normal text-ink-3">(optional)</span></label>
                <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Event URL <span className="font-normal text-ink-3">(optional)</span></label>
                <input type="text" value={eventUrl} onChange={(e) => setEventUrl(e.target.value)} placeholder="https://..." className={inputCls} />
              </div>
            </>
          )}

          {/* educational */}
          {contentType === 'educational' && (
            <>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-ink-2">Topic <span className="text-red-400">*</span></label>
                  <SuggestButton onClick={fetchTopicSuggestions} loading={topicSuggestionsLoading} label="Suggest topics" />
                </div>
                <input
                  value={form.topic}
                  onChange={(e) => setField('topic', e.target.value)}
                  placeholder="e.g. How to troubleshoot retention issues in humid climates"
                  className={inputCls + (validationErrors.topic ? ' border-red-400' : '')}
                />
                {validationErrors.topic && <p className={errCls}>{validationErrors.topic}</p>}
                {showTopicSuggestions && (
                  <TopicSuggestionPills
                    suggestions={topicSuggestions}
                    onSelect={(s) => { setField('topic', s); setShowTopicSuggestions(false) }}
                    onDismiss={() => setShowTopicSuggestions(false)}
                  />
                )}
              </div>
              <div>
                <label className={labelCls}>Optional Product Tie-in</label>
                <ProductFocusInput
                  value={form.productFocus}
                  onChange={(v) => { setField('productFocus', v); setProductDisplayName('') }}
                  onSelect={(url, name) => { setField('productFocus', url); setProductDisplayName(name) }}
                  displayName={productDisplayName}
                  products={products}
                  className={inputCls}
                  placeholder="Search for a product to reference, or paste a URL"
                />
              </div>
            </>
          )}

          {/* brand */}
          {contentType === 'brand' && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-ink-2">Topic <span className="text-red-400">*</span></label>
                <SuggestButton onClick={fetchTopicSuggestions} loading={topicSuggestionsLoading} label="Suggest topics" />
              </div>
              <input
                value={form.topic}
                onChange={(e) => setField('topic', e.target.value)}
                placeholder="e.g. Why LashBox LA has been the #1 choice for artists for 10 years"
                className={inputCls + (validationErrors.topic ? ' border-red-400' : '')}
              />
              {validationErrors.topic && <p className={errCls}>{validationErrors.topic}</p>}
              {showTopicSuggestions && (
                <TopicSuggestionPills
                  suggestions={topicSuggestions}
                  onSelect={(s) => { setField('topic', s); setShowTopicSuggestions(false) }}
                  onDismiss={() => setShowTopicSuggestions(false)}
                />
              )}
            </div>
          )}

          {/* promotion */}
          {contentType === 'promotion' && (
            <>
              <div>
                <label className={labelCls}>Product <span className="font-normal text-ink-3">(optional)</span></label>
                <ProductFocusInput
                  value={form.productFocus}
                  onChange={(v) => { setField('productFocus', v); setProductDisplayName('') }}
                  onSelect={(url, name) => { setField('productFocus', url); setProductDisplayName(name) }}
                  displayName={productDisplayName}
                  products={products}
                  className={inputCls}
                  placeholder="Paste a product URL or type a product name"
                />
              </div>
              <div>
                <label className={labelCls}>Offer Type</label>
                <select value={offerType} onChange={(e) => setOfferType(e.target.value)} className={inputCls}>
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
                <input value={promoCode} onChange={(e) => setPromoCode(e.target.value)} placeholder="e.g. SPRING20" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Offer End Date <span className="font-normal text-ink-3">(optional)</span></label>
                <input type="date" value={offerEndDate} onChange={(e) => setOfferEndDate(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Offer Details <span className="font-normal text-ink-3">(optional)</span></label>
                <textarea
                  value={offerDetails}
                  onChange={(e) => setOfferDetails(e.target.value)}
                  placeholder="Any additional details about the promotion..."
                  className={inputCls + ' resize-none'}
                  style={{ minHeight: '72px' }}
                />
              </div>
            </>
          )}

          {/* other */}
          {contentType === 'other' && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-ink-2">Topic <span className="text-red-400">*</span></label>
                <SuggestButton onClick={fetchTopicSuggestions} loading={topicSuggestionsLoading} label="Suggest topics" />
              </div>
              <input
                value={form.topic}
                onChange={(e) => setField('topic', e.target.value)}
                placeholder="Describe what this content is about"
                className={inputCls + (validationErrors.topic ? ' border-red-400' : '')}
              />
              {validationErrors.topic && <p className={errCls}>{validationErrors.topic}</p>}
              {showTopicSuggestions && (
                <TopicSuggestionPills
                  suggestions={topicSuggestions}
                  onSelect={(s) => { setField('topic', s); setShowTopicSuggestions(false) }}
                  onDismiss={() => setShowTopicSuggestions(false)}
                />
              )}
            </div>
          )}

          {/* ── Fixed bottom fields ── */}

          {/* Target Audience */}
          <div>
            <label className={labelCls}>Target Audience</label>
            <select value={form.audience} onChange={(e) => setField('audience', e.target.value)} className={inputCls}>
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

          {/* Tone / Angle */}
          <div>
            <label className={labelCls}>Tone / Angle <span className="text-ink-3">(select at least one)</span></label>
            <TonePills selected={selectedTones} onToggle={toggleTone} />
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
              placeholder="Optional. Add any facts, specs, or angles Claude should include."
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
            <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">{error}</p>
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

      {/* ── Results ── */}
      {isLoading && (
        <div className="mt-6">
          <LoadingSkeleton />
        </div>
      )}

      {!isLoading && result && (
        <div className="mt-6 space-y-3">
          <h2 className="font-display text-lg font-semibold text-ink">Generated Versions</h2>
          {result.versions.map((v, i) => {
            const score = scores?.[i] ?? null
            if (form.channel === 'email') return <EmailCard key={i} v={v as EmailVersion} idx={i} copiedIdx={copiedIdx} onCopy={handleCopy} score={score} scoreLoading={scoresLoading && !scores} />
            if (form.channel === 'sms')   return <SmsCard   key={i} v={v as SmsVersion}   idx={i} copiedIdx={copiedIdx} onCopy={handleCopy} score={score} scoreLoading={scoresLoading && !scores} />
            return <PushCard key={i} v={v as PushVersion} idx={i} copiedIdx={copiedIdx} onCopy={handleCopy} score={score} scoreLoading={scoresLoading && !scores} />
          })}
          <button
            type="button"
            onClick={() => { setResult(null); setScores(null); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
            className="w-full rounded-lg border border-cream-3 bg-white py-2.5 text-sm font-medium text-ink-3 transition hover:border-teal/40 hover:text-ink-2"
          >
            Generate again
          </button>
        </div>
      )}

      <GenerationHistory history={recentHistory} onLoad={loadFromHistory} />
    </div>
  )
}
