'use client'

import { useState, useCallback } from 'react'

type Channel = 'email' | 'sms' | 'push'

interface EmailVersion { subject: string; preheader: string; body: string }
interface SmsVersion   { message: string }
interface PushVersion  { title: string; message: string }
type Version = EmailVersion | SmsVersion | PushVersion

interface GenerationResult { versions: Version[] }

const CHANNEL_TABS: { id: Channel; label: string }[] = [
  { id: 'email', label: 'Email' },
  { id: 'sms',   label: 'SMS' },
  { id: 'push',  label: 'Push' },
]

const TONE_OPTIONS = [
  'Educational',
  'Launch Hype',
  'Urgency / Scarcity',
  'Community',
  'Promotional',
  'Storytelling',
  'Results-Focused',
]

const PERSONA_OPTIONS = [
  { value: 'all-lash-artists',         label: 'All Lash Artists' },
  { value: 'new-lash-artists',          label: 'New Lash Artists' },
  { value: 'established-lash-artists',  label: 'Established Lash Artists' },
  { value: 'volume-specialists',        label: 'Volume Specialists' },
  { value: 'lash-lift-specialists',     label: 'Lash Lift Specialists' },
  { value: 'salon-owners',              label: 'Salon Owners' },
  { value: 'students',                  label: 'Students / Pre-Licensed' },
  { value: 'lapsed-customers',          label: 'Lapsed Customers (90+ days)' },
  { value: 'subscribers',               label: 'Active Subscribers' },
]

const CONTENT_TYPE_OPTIONS = [
  { value: 'product',    label: 'Product' },
  { value: 'collection', label: 'Collection' },
  { value: 'event',      label: 'Event' },
  { value: 'promotion',  label: 'Promotion' },
  { value: 'educational',label: 'Educational' },
  { value: 'brand',      label: 'Brand' },
  { value: 'other',      label: 'Other' },
]

// ── Copy button ────────────────────────────────────────────────────────────────

function CopyButton({ text, label = 'Copy', large = false }: { text: string; label?: string; large?: boolean }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  if (large) {
    return (
      <button
        type="button"
        onClick={copy}
        className="w-full rounded-xl bg-teal py-3 text-sm font-semibold text-white transition hover:bg-teal-dark active:scale-[0.98]"
      >
        {copied ? 'Copied!' : label}
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={copy}
      className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
        copied
          ? 'border-teal bg-teal/10 text-teal-deep'
          : 'border-cream-3 bg-white text-ink-3 hover:border-teal/50 hover:text-teal'
      }`}
    >
      {copied ? 'Copied!' : label}
    </button>
  )
}

// ── Version cards ──────────────────────────────────────────────────────────────

function EmailCard({ v, idx }: { v: EmailVersion; idx: number }) {
  const fullText = `Subject: ${v.subject}\nPreheader: ${v.preheader}\n\n${v.body}`
  return (
    <div className="rounded-xl border border-cream-3 bg-cream p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-data uppercase tracking-widest text-ink-3">Version {idx + 1}</span>
      </div>
      <div>
        <p className="text-xs font-semibold text-teal-deep uppercase tracking-wide mb-0.5">Subject</p>
        <p className="text-sm font-semibold text-ink leading-snug">{v.subject}</p>
      </div>
      {v.preheader && (
        <div>
          <p className="text-xs font-semibold text-teal-deep uppercase tracking-wide mb-0.5">Preheader</p>
          <p className="text-xs italic text-ink-3">{v.preheader}</p>
        </div>
      )}
      <div>
        <p className="text-xs font-semibold text-teal-deep uppercase tracking-wide mb-0.5">Body</p>
        <p className="whitespace-pre-wrap text-xs text-ink-2 leading-relaxed">{v.body}</p>
      </div>
      <CopyButton text={fullText} label="Copy all" large />
    </div>
  )
}

function SmsCard({ v, idx }: { v: SmsVersion; idx: number }) {
  const over = v.message.length > 160
  return (
    <div className="rounded-xl border border-cream-3 bg-cream p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-data uppercase tracking-widest text-ink-3">Version {idx + 1}</span>
        <span className={`font-data text-xs ${over ? 'text-red-500 font-semibold' : 'text-ink-3'}`}>
          {v.message.length}/160
        </span>
      </div>
      <p className="whitespace-pre-wrap text-sm text-ink leading-relaxed">{v.message}</p>
      <CopyButton text={v.message} label="Copy" large />
    </div>
  )
}

function PushCard({ v, idx }: { v: PushVersion; idx: number }) {
  const fullText = `${v.title}\n${v.message}`
  return (
    <div className="rounded-xl border border-cream-3 bg-cream p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-data uppercase tracking-widest text-ink-3">Version {idx + 1}</span>
        <div className="flex gap-3">
          <span className={`font-data text-[10px] ${v.title.length > 40 ? 'text-red-500' : 'text-ink-3'}`}>
            Title {v.title.length}/40
          </span>
          <span className={`font-data text-[10px] ${v.message.length > 100 ? 'text-red-500' : 'text-ink-3'}`}>
            Body {v.message.length}/100
          </span>
        </div>
      </div>
      <p className="text-sm font-semibold text-ink">{v.title}</p>
      <p className="text-xs text-ink-2 leading-relaxed">{v.message}</p>
      <CopyButton text={fullText} label="Copy both" large />
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
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function LblaContent({ styleGuideConfigured }: { styleGuideConfigured: boolean }) {
  const [channel, setChannel] = useState<Channel>('email')
  const [contentType, setContentType] = useState('product')
  const [topic, setTopic] = useState('')
  const [productFocus, setProductFocus] = useState('')
  const [audience, setAudience] = useState('all-lash-artists')
  const [customAudience, setCustomAudience] = useState('')
  const [selectedTones, setSelectedTones] = useState<Set<string>>(new Set(['Educational']))
  const [talkingPoints, setTalkingPoints] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<GenerationResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const inputCls = 'w-full rounded-xl border border-cream-3 bg-white px-4 py-3 text-sm text-ink focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20 transition'
  const labelCls = 'block text-xs font-semibold text-ink-2 mb-1.5 uppercase tracking-wide'

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

  const needsTopic = ['collection', 'educational', 'brand', 'other'].includes(contentType)
  const needsProduct = ['product', 'educational', 'promotion'].includes(contentType)

  function getEffectiveTopic(): string {
    if (needsTopic) return topic
    if (contentType === 'product') return topic || (productFocus ? `Promote ${productFocus}` : '')
    return topic
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const effectiveTopic = getEffectiveTopic()
    if (!effectiveTopic.trim() && !productFocus.trim()) {
      setError('Please fill in the topic or product focus.')
      return
    }

    setIsLoading(true)
    setResult(null)

    try {
      const res = await fetch('/api/lbla/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel,
          contentType,
          topic: effectiveTopic || productFocus,
          productFocus: needsProduct ? productFocus || null : null,
          audience,
          customAudience: customAudience || null,
          tones: Array.from(selectedTones),
          talkingPoints: talkingPoints || null,
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setError(data.error ?? 'Generation failed. Please try again.')
        return
      }
      setResult(data.data)
    } catch {
      setError('Network error — check your connection and try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const copyAllVersions = useCallback(() => {
    if (!result) return
    const allText = result.versions
      .map((v, i) => {
        const n = `=== Version ${i + 1} ===\n`
        if (channel === 'email') {
          const e = v as EmailVersion
          return `${n}Subject: ${e.subject}\nPreheader: ${e.preheader}\n\n${e.body}`
        }
        if (channel === 'sms') return `${n}${(v as SmsVersion).message}`
        const p = v as PushVersion
        return `${n}Title: ${p.title}\nMessage: ${p.message}`
      })
      .join('\n\n')
    navigator.clipboard.writeText(allText)
  }, [result, channel])

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">

      {!styleGuideConfigured && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Content settings not configured yet. Contact your administrator.
        </div>
      )}

      {/* ── Form ── */}
      <div className="rounded-2xl border border-cream-3 bg-white p-6 shadow-sm">
        <h1 className="font-display text-2xl font-semibold text-ink mb-6">Generate Content</h1>

        <form onSubmit={handleGenerate} className="space-y-5">

          {/* Channel tabs */}
          <div>
            <label className={labelCls}>Channel</label>
            <div className="flex gap-1 rounded-xl bg-cream-2 p-1">
              {CHANNEL_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => { setChannel(tab.id); setResult(null) }}
                  className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition ${
                    channel === tab.id
                      ? 'bg-white text-ink shadow-sm'
                      : 'text-ink-3 hover:text-ink-2'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Content Type */}
          <div>
            <label className={labelCls}>Content Type</label>
            <select
              value={contentType}
              onChange={(e) => { setContentType(e.target.value); setResult(null) }}
              className={inputCls}
            >
              {CONTENT_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Topic */}
          <div>
            <label className={labelCls}>
              {contentType === 'product' ? 'Content Angle / Topic' : 'Topic'}
              {contentType === 'product' && <span className="ml-1 font-normal normal-case text-ink-3">(optional for product)</span>}
              {needsTopic && !['product'].includes(contentType) && <span className="text-red-400 ml-0.5">*</span>}
            </label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder={
                contentType === 'product' ? 'e.g. Boost retention in summer humidity' :
                contentType === 'promotion' ? 'e.g. 20% off all adhesives with code SAVE20' :
                contentType === 'event' ? 'e.g. Miko Live Webinar — March 15' :
                'Describe what this content is about'
              }
              className={inputCls}
            />
          </div>

          {/* Product Focus */}
          {needsProduct && (
            <div>
              <label className={labelCls}>
                Product Focus
                {contentType === 'product' && <span className="text-red-400 ml-0.5">*</span>}
                {contentType !== 'product' && <span className="ml-1 font-normal normal-case text-ink-3">(optional)</span>}
              </label>
              <input
                type="text"
                value={productFocus}
                onChange={(e) => setProductFocus(e.target.value)}
                placeholder="Product name or lashboxla.com/products/... URL"
                className={inputCls}
              />
            </div>
          )}

          {/* Audience */}
          <div>
            <label className={labelCls}>Target Audience</label>
            <select value={audience} onChange={(e) => setAudience(e.target.value)} className={inputCls}>
              {PERSONA_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Custom Audience */}
          <div>
            <label className={labelCls}>
              Audience Detail <span className="font-normal normal-case text-ink-3">(optional)</span>
            </label>
            <input
              type="text"
              value={customAudience}
              onChange={(e) => setCustomAudience(e.target.value)}
              placeholder="e.g. Artists who attended the Miko webinar, Texas-based"
              className={inputCls}
            />
          </div>

          {/* Tone pills */}
          <div>
            <label className={labelCls}>Tone <span className="font-normal normal-case text-ink-3">(pick at least one)</span></label>
            <div className="flex flex-wrap gap-2">
              {TONE_OPTIONS.map((tone) => (
                <button
                  key={tone}
                  type="button"
                  onClick={() => toggleTone(tone)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    selectedTones.has(tone)
                      ? 'border-teal bg-teal/10 text-teal-deep'
                      : 'border-cream-3 bg-white text-ink-3 hover:border-teal/40 hover:text-ink-2'
                  }`}
                >
                  {tone}
                </button>
              ))}
            </div>
          </div>

          {/* Talking points */}
          <div>
            <label className={labelCls}>
              What should Claude know? <span className="font-normal normal-case text-ink-3">(optional)</span>
            </label>
            <textarea
              value={talkingPoints}
              onChange={(e) => setTalkingPoints(e.target.value)}
              placeholder="Add any key facts, specs, or angles to include..."
              className={inputCls + ' resize-none'}
              style={{ minHeight: '80px' }}
            />
          </div>

          {error && (
            <p className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isLoading || selectedTones.size === 0}
            className="w-full rounded-xl bg-teal py-3.5 text-base font-semibold text-white transition hover:bg-teal-dark disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.99]"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                Generating 3 versions...
              </span>
            ) : (
              'Generate Content'
            )}
          </button>
        </form>
      </div>

      {/* ── Results ── */}
      {isLoading && (
        <div className="mt-6">
          <LoadingSkeleton />
        </div>
      )}

      {!isLoading && result && (
        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold text-ink">Generated Versions</h2>
            <button
              type="button"
              onClick={copyAllVersions}
              className="text-xs font-medium text-teal-deep hover:text-teal transition"
            >
              Copy all versions
            </button>
          </div>

          {result.versions.map((v, i) => {
            if (channel === 'email') return <EmailCard key={i} v={v as EmailVersion} idx={i} />
            if (channel === 'sms')   return <SmsCard   key={i} v={v as SmsVersion}   idx={i} />
            return <PushCard key={i} v={v as PushVersion} idx={i} />
          })}

          <button
            type="button"
            onClick={() => { setResult(null); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
            className="w-full rounded-xl border border-cream-3 bg-white py-3 text-sm font-medium text-ink-3 transition hover:border-teal/40 hover:text-ink-2"
          >
            Generate again
          </button>
        </div>
      )}
    </div>
  )
}
