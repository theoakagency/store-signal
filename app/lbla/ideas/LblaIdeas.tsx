'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import type { IdeaItem, IdeasResponse } from '@/app/api/lbla/ideas/route'

// ── Category config ───────────────────────────────────────────────────────────

type Category = IdeaItem['category']

const CATEGORY_LABEL: Record<Category, string> = {
  restock:            'Restock',
  subscription_upsell: 'Sub Upsell',
  bundle:             'Bundle',
  winback:            'Win-back',
  declining:          'Needs Push',
  churn_risk:         'Churn Risk',
  followup:           'Follow-up',
}

const CATEGORY_BADGE: Record<Category, string> = {
  restock:            'bg-teal/10 text-teal-deep border-teal/20',
  subscription_upsell: 'bg-purple-50 text-purple-700 border-purple-200',
  bundle:             'bg-blue-50 text-blue-700 border-blue-200',
  winback:            'bg-amber-50 text-amber-700 border-amber-200',
  declining:          'bg-red-50 text-red-700 border-red-200',
  churn_risk:         'bg-red-50 text-red-700 border-red-200',
  followup:           'bg-green-50 text-green-700 border-green-200',
}

const SCORE_COLOR = (score: number) =>
  score >= 75 ? 'text-green-600' : score >= 50 ? 'text-amber-500' : 'text-red-500'

// ── URL builder ───────────────────────────────────────────────────────────────

// The generator now takes subject + goal rather than a single content type, and
// audience is free text rather than a persona slug. Ideas still describe
// themselves in the old vocabulary, so translate here.

const SUBJECT_FROM_CONTENT_TYPE: Record<string, string> = {
  product:     'products',
  collection:  'products',
  educational: 'products',
  promotion:   'products',
}

const GOAL_FROM_CONTENT_TYPE: Record<string, string> = {
  promotion:   'promote',
  educational: 'educate',
}

const GOAL_FROM_TONE: Record<string, string> = {
  Educational:  'educate',
  Promotional:  'promote',
  Urgency:      'promote',
  'Launch Hype': 'announce',
}

// Persona slugs become the plain-language audience the new field expects.
const AUDIENCE_TEXT: Record<string, string> = {
  'general-audience': '',   // no constraint — leave the field blank
  'active-customers': 'active customers who reorder regularly',
  'new-customers':    'new customers still forming their supplier habits',
  'lapsed-customers': "customers who haven't ordered in 90+ days",
  'vip-top-spenders': 'VIP and top-spending customers',
}

function buildContentUrl(idea: IdeaItem): string {
  const params = new URLSearchParams()
  params.set('channel', idea.prefill.channel)

  // Subject: products only when there is actually a product to point at.
  const subject = idea.prefill.productFocus
    ? (SUBJECT_FROM_CONTENT_TYPE[idea.prefill.contentType] ?? 'products')
    : 'none'
  params.set('subject', subject)

  // Goal: content type wins, tone decides the rest.
  const goal =
    GOAL_FROM_CONTENT_TYPE[idea.prefill.contentType] ??
    GOAL_FROM_TONE[idea.prefill.tone] ??
    'educate'
  params.set('goal', goal)

  if (idea.prefill.productFocus) params.append('productFocus', idea.prefill.productFocus)

  // Audience is free text now; the custom detail is appended rather than split
  // across two fields.
  const audienceParts = [
    AUDIENCE_TEXT[idea.prefill.audience] ?? '',
    idea.prefill.customAudienceDetail ?? '',
  ].filter(Boolean)
  if (audienceParts.length) params.set('audience', audienceParts.join(', '))

  // Promotion prose has no structured home any more, so it joins the notes.
  const notesParts = [
    idea.prefill.whatShouldClaudeKnow ?? '',
    idea.prefill.promotionDetails ?? '',
  ].filter(Boolean)
  if (notesParts.length) params.set('whatShouldClaudeKnow', notesParts.join('\n\n'))

  return `/lbla/content?${params.toString()}`
}

// ── Skeleton card ─────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-cream-3 bg-white p-5 shadow-sm animate-pulse">
      <div className="flex items-start justify-between mb-3">
        <div className="h-5 w-20 rounded-full bg-cream-3" />
        <div className="h-5 w-16 rounded-full bg-cream-3" />
      </div>
      <div className="h-5 w-3/4 rounded bg-cream-3 mb-2" />
      <div className="h-4 w-full rounded bg-cream-3 mb-1" />
      <div className="h-4 w-5/6 rounded bg-cream-3 mb-4" />
      <div className="rounded-lg border border-cream-3 bg-cream p-3 mb-4">
        <div className="h-4 w-full rounded bg-cream-3" />
      </div>
      <div className="flex gap-2 mb-4">
        <div className="h-5 w-14 rounded-full bg-cream-3" />
        <div className="h-5 w-20 rounded-full bg-cream-3" />
        <div className="h-5 w-18 rounded-full bg-cream-3" />
      </div>
      <div className="h-9 w-full rounded-lg bg-cream-3" />
    </div>
  )
}

// ── Idea card ─────────────────────────────────────────────────────────────────

function IdeaCard({ idea }: { idea: IdeaItem }) {
  const contentUrl = buildContentUrl(idea)

  return (
    <div className="rounded-2xl border border-cream-3 bg-white p-5 shadow-sm flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${CATEGORY_BADGE[idea.category]}`}>
          {CATEGORY_LABEL[idea.category]}
        </span>
        <span className={`text-[11px] font-data font-semibold shrink-0 ${SCORE_COLOR(idea.opportunity_score)}`}>
          Score: {idea.opportunity_score}
        </span>
      </div>

      {/* Title */}
      <h3 className="font-display text-[15px] font-semibold text-ink leading-snug mb-1 line-clamp-1">
        {idea.title}
      </h3>

      {/* Description */}
      <p className="text-xs text-ink-3 leading-relaxed line-clamp-2 mb-3">
        {idea.description}
      </p>

      {/* Why now callout */}
      <div className="rounded-lg border-l-2 border-teal bg-teal/5 px-3 py-2 mb-3">
        <p className="text-[11px] text-ink-2 leading-snug">
          <span className="mr-1">📊</span>{idea.why_now}
        </p>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        <span className="rounded-full bg-cream px-2 py-0.5 text-[10px] font-medium text-ink-3 border border-cream-3">
          {idea.suggested_channel}
        </span>
        <span className="rounded-full bg-cream px-2 py-0.5 text-[10px] font-medium text-ink-3 border border-cream-3 capitalize">
          {idea.suggested_audience.replace(/-/g, ' ')}
        </span>
        <span className="rounded-full bg-cream px-2 py-0.5 text-[10px] font-medium text-ink-3 border border-cream-3">
          {idea.suggested_angle}
        </span>
      </div>

      {/* Generate button */}
      <div className="mt-auto">
        <Link
          href={contentUrl}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-deep transition"
        >
          Generate Content
          <svg className="h-3.5 w-3.5" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2 7h10M8 3l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      </div>
    </div>
  )
}

// ── What's Working section ────────────────────────────────────────────────────

function WhatsWorking({ campaigns }: { campaigns: IdeasResponse['whats_working'] }) {
  if (!campaigns.length) return null

  return (
    <section className="rounded-2xl border border-cream-3 bg-white p-6 shadow-sm">
      <div className="mb-1">
        <h2 className="font-display text-base font-semibold text-ink">Recent Top Performers</h2>
        <p className="text-xs text-ink-3 mt-0.5">Your highest-performing campaigns from the last 60 days</p>
      </div>
      <p className="text-[11px] text-ink-3 mb-4 italic">
        Build on these angles — your audience is engaged on these topics
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {campaigns.map((c, i) => {
          const sendDate = c.send_date
            ? new Date(c.send_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            : ''
          const openPct = (c.open_rate * 100).toFixed(1)
          return (
            <div key={i} className="rounded-xl border border-cream-3 bg-cream p-4">
              <p className="text-xs font-semibold text-ink leading-snug mb-2 line-clamp-2" title={c.campaign_name}>
                {c.campaign_name.length > 40 ? `${c.campaign_name.slice(0, 40)}…` : c.campaign_name}
              </p>
              <p className="font-data text-2xl font-bold text-teal mb-0.5">{openPct}%</p>
              <p className="text-[11px] text-ink-3">open rate</p>
              {c.revenue_attributed > 0 && (
                <p className="text-[11px] text-ink-3 mt-1">
                  ${c.revenue_attributed.toLocaleString()} revenue
                </p>
              )}
              {sendDate && (
                <p className="text-[10px] text-ink-3 mt-1">{sendDate}</p>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ── Data snapshot banner ──────────────────────────────────────────────────────

function DataSnapshot({ snapshot }: { snapshot: IdeasResponse['data_snapshot'] }) {
  if (!snapshot.total_customers && !snapshot.active_subscribers) return null
  return (
    <div className="flex flex-wrap gap-4 text-[11px] text-ink-3">
      {snapshot.total_customers > 0 && (
        <span>{snapshot.total_customers.toLocaleString()} total customers</span>
      )}
      {snapshot.lapsed_count > 0 && (
        <span className="text-amber-600">{snapshot.lapsed_count.toLocaleString()} lapsed</span>
      )}
      {snapshot.active_subscribers > 0 && (
        <span>{snapshot.active_subscribers.toLocaleString()} subscribers</span>
      )}
      {snapshot.mrr > 0 && (
        <span>${snapshot.mrr.toLocaleString()} MRR</span>
      )}
      {snapshot.churn_rate > 0 && (
        <span className={snapshot.churn_rate > 0.05 ? 'text-red-500' : ''}>
          {(snapshot.churn_rate * 100).toFixed(1)}% churn
        </span>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function LblaIdeas() {
  const [ideas, setIdeas] = useState<IdeaItem[]>([])
  const [whatsWorking, setWhatsWorking] = useState<IdeasResponse['whats_working']>([])
  const [snapshot, setSnapshot] = useState<IdeasResponse['data_snapshot'] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchIdeas = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/lbla/ideas')
      if (!res.ok) throw new Error(`Request failed: ${res.status}`)
      const data = await res.json() as IdeasResponse
      setIdeas(data.ideas)
      setWhatsWorking(data.whats_working)
      setSnapshot(data.data_snapshot)
      setLastUpdated(new Date())
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void fetchIdeas() }, [fetchIdeas])

  const minutesAgo = lastUpdated
    ? Math.round((Date.now() - lastUpdated.getTime()) / 60_000)
    : null

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6 lg:px-8 space-y-6">

      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Campaign Ideas</h1>
          <p className="mt-1 text-sm text-ink-3">Data-driven content ideas ranked by opportunity</p>
          {snapshot && <div className="mt-2"><DataSnapshot snapshot={snapshot} /></div>}
        </div>
        <div className="flex shrink-0 items-center gap-3 pt-1">
          {minutesAgo !== null && (
            <span className="hidden text-[11px] text-ink-3 sm:block">
              Updated {minutesAgo === 0 ? 'just now' : `${minutesAgo}m ago`}
            </span>
          )}
          <button
            type="button"
            onClick={() => void fetchIdeas()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-cream-3 bg-white px-3 py-1.5 text-xs font-medium text-ink-2 hover:border-teal/40 hover:text-ink transition disabled:opacity-50"
          >
            <svg
              className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M13 7A6 6 0 1 1 7 1" strokeLinecap="round" />
              <path d="M13 1v6h-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Refresh Ideas
          </button>
        </div>
      </div>

      {/* Ideas grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm font-medium text-red-700">Failed to load ideas</p>
          <p className="text-xs text-red-500 mt-1">{error}</p>
          <button
            type="button"
            onClick={() => void fetchIdeas()}
            className="mt-3 text-xs font-semibold text-red-600 underline"
          >
            Try again
          </button>
        </div>
      ) : ideas.length === 0 ? (
        <div className="rounded-2xl border border-cream-3 bg-white p-10 text-center shadow-sm">
          <p className="text-sm font-medium text-ink">No campaign opportunities found</p>
          <p className="text-xs text-ink-3 mt-1">
            Make sure your data is synced — product stats, Klaviyo campaigns, and customer data are all needed.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {ideas.map((idea) => (
            <IdeaCard key={idea.id} idea={idea} />
          ))}
        </div>
      )}

      {/* What's Working */}
      {!loading && whatsWorking.length > 0 && <WhatsWorking campaigns={whatsWorking} />}

    </div>
  )
}
