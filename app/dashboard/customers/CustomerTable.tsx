'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSortableTable, SortIcon, thCls } from '@/hooks/useSortableTable'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface BuyerProfile {
  email: string
  total_orders: number
  total_revenue: number
  avg_order_value: number
  segment: string
  ltv_segment: string | null
  engagement_score: number | null
  is_subscriber: boolean
  is_loyalty_member: boolean
  predicted_next_order_date: string | null
  subscription_interval: string | null
  subscription_mrr: number | null
  loyalty_tier: string | null
  loyalty_points_balance: number | null
  avg_days_between_orders: number | null
  days_since_last_order: number | null
  first_product_bought: string | null
  most_recent_product: string | null
  top_products: Array<{ title: string; count: number; revenue: number }> | null
  first_order_at: string | null
  last_order_at: string | null
}

// Alias kept for any existing imports
export type CustomerProfile = BuyerProfile

export interface OverlapData {
  total_customers: number
  subscribers_only: number
  loyalty_only: number
  vip_only: number
  subscriber_and_loyalty: number
  subscriber_and_vip: number
  loyalty_and_vip: number
  all_three: number
  calculated_at: string
}

interface Props {
  buyers: BuyerProfile[]
  page: number
  totalPages: number
  totalCount: number
  segmentCounts: Record<string, number>
  overlapData: OverlapData | null
  ltvCounts: Record<string, { count: number; totalRevenue: number }>
  totalRevenueAll: number
}

// ── Constants ──────────────────────────────────────────────────────────────────

const SEGMENT_AI_PROMPTS: Record<string, string> = {
  vip:     'Tell me about my VIP customers and what I can do to maximize their lifetime value',
  active:  'Tell me about my active customers and how I can increase their purchase frequency',
  at_risk: 'Tell me about my at-risk customers and what win-back tactics would work best for them',
  lapsed:  'Tell me about my lapsed customers and the best way to re-engage them',
  new:     'Tell me about my new customers and how I can convert them into repeat buyers',
}

const SEGMENT_META: Record<string, { label: string; bg: string; text: string }> = {
  vip:     { label: 'VIP',     bg: 'bg-teal-pale',  text: 'text-teal-deep' },
  active:  { label: 'Active',  bg: 'bg-green-50',   text: 'text-green-700' },
  at_risk: { label: 'At Risk', bg: 'bg-orange-50',  text: 'text-orange-700' },
  lapsed:  { label: 'Lapsed',  bg: 'bg-cream-2',    text: 'text-ink-3' },
  new:     { label: 'New',     bg: 'bg-blue-50',    text: 'text-blue-700' },
}

const LTV_META: Record<string, { bg: string; text: string; ring: string }> = {
  Diamond: { bg: 'bg-purple-50',  text: 'text-purple-700', ring: 'ring-purple-200' },
  Gold:    { bg: 'bg-yellow-50',  text: 'text-yellow-700', ring: 'ring-yellow-200' },
  Silver:  { bg: 'bg-teal-pale',  text: 'text-teal-deep',  ring: 'ring-teal-200'   },
  Bronze:  { bg: 'bg-cream-2',    text: 'text-ink-3',      ring: 'ring-cream-3'    },
}

const SEGMENTS = ['all', 'vip', 'active', 'at_risk', 'lapsed', 'new']

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n)
}

// ── Venn Diagram ───────────────────────────────────────────────────────────────

function VennDiagram({ data, onSelectAll }: { data: OverlapData; onSelectAll: () => void }) {
  const fmtN = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)

  return (
    <div className="rounded-2xl border border-cream-3 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="font-display text-base font-semibold text-ink">Customer Overlap</h2>
          <p className="text-xs text-ink-3 mt-0.5">Cross-platform membership across {data.total_customers.toLocaleString()} unique buyers</p>
        </div>
        {data.all_three > 0 && (
          <button
            onClick={onSelectAll}
            className="text-xs font-medium text-[#FF642D] hover:underline"
          >
            View all-three segment →
          </button>
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-center">
        {/* SVG Venn */}
        <div className="shrink-0">
          <svg viewBox="0 0 320 270" width="320" height="270" className="overflow-visible">
            <circle cx="130" cy="120" r="90" fill="#0D9B8A" fillOpacity="0.15" stroke="#0D9B8A" strokeWidth="1.5" strokeOpacity="0.4" />
            <circle cx="210" cy="120" r="90" fill="#F59E0B" fillOpacity="0.15" stroke="#F59E0B" strokeWidth="1.5" strokeOpacity="0.4" />
            <circle cx="170" cy="185" r="90" fill="#2C2C2C" fillOpacity="0.12" stroke="#2C2C2C" strokeWidth="1.5" strokeOpacity="0.35" />

            <text x="75"  y="100" textAnchor="middle" fontSize="11" fill="#0D9B8A" fontWeight="600">{fmtN(data.subscribers_only)}</text>
            <text x="75"  y="115" textAnchor="middle" fontSize="9"  fill="#0D9B8A" opacity="0.8">only</text>
            <text x="265" y="100" textAnchor="middle" fontSize="11" fill="#B45309" fontWeight="600">{fmtN(data.loyalty_only)}</text>
            <text x="265" y="115" textAnchor="middle" fontSize="9"  fill="#B45309" opacity="0.8">only</text>
            <text x="170" y="255" textAnchor="middle" fontSize="11" fill="#2C2C2C" fontWeight="600">{fmtN(data.vip_only)}</text>
            <text x="170" y="270" textAnchor="middle" fontSize="9"  fill="#2C2C2C" opacity="0.8">only</text>
            <text x="170" y="90"  textAnchor="middle" fontSize="10" fill="#374151" fontWeight="500">{fmtN(data.subscriber_and_loyalty)}</text>
            <text x="110" y="185" textAnchor="middle" fontSize="10" fill="#374151" fontWeight="500">{fmtN(data.subscriber_and_vip)}</text>
            <text x="230" y="185" textAnchor="middle" fontSize="10" fill="#374151" fontWeight="500">{fmtN(data.loyalty_and_vip)}</text>
            <text x="170" y="148" textAnchor="middle" fontSize="14" fill="#1a1a1a" fontWeight="700">{fmtN(data.all_three)}</text>

            <text x="65"  y="38"  textAnchor="middle" fontSize="10" fill="#0D9B8A" fontWeight="600">Subscribers</text>
            <text x="275" y="38"  textAnchor="middle" fontSize="10" fill="#B45309" fontWeight="600">Loyalty</text>
            <text x="170" y="12"  textAnchor="middle" fontSize="10" fill="#2C2C2C" fontWeight="600">VIP Spenders</text>
          </svg>
        </div>

        {/* Legend */}
        <div className="flex-1 space-y-3 min-w-0">
          <div className="rounded-xl bg-teal-pale border border-teal/20 px-4 py-3">
            <p className="text-xs font-medium text-teal-deep">Most Valuable Segment</p>
            <p className="mt-0.5 font-display text-2xl font-bold text-teal-deep">{data.all_three.toLocaleString()}</p>
            <p className="text-xs text-teal-deep/70 mt-0.5">subscribers, loyalty members AND top spenders</p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              { label: 'Sub + Loyalty', value: data.subscriber_and_loyalty, color: 'text-teal-deep' },
              { label: 'Sub + VIP',     value: data.subscriber_and_vip,     color: 'text-teal-deep' },
              { label: 'Loyalty + VIP', value: data.loyalty_and_vip,        color: 'text-yellow-700' },
              { label: 'Single only',   value: data.subscribers_only + data.loyalty_only + data.vip_only, color: 'text-ink-3' },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-lg bg-cream px-3 py-2">
                <p className="text-ink-3">{label}</p>
                <p className={`font-semibold ${color}`}>{value.toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── LTV Segments ───────────────────────────────────────────────────────────────

function LtvSegments({
  ltvCounts,
  totalRevenueAll,
  totalCustomers,
}: {
  ltvCounts: Record<string, { count: number; totalRevenue: number }>
  totalRevenueAll: number
  totalCustomers: number
}) {
  const segments = ['Diamond', 'Gold', 'Silver', 'Bronze'] as const
  return (
    <div>
      <h2 className="font-display text-sm font-semibold text-ink mb-3">LTV Segments</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {segments.map((seg) => {
          const { count, totalRevenue } = ltvCounts[seg] ?? { count: 0, totalRevenue: 0 }
          const revPct = totalRevenueAll > 0 ? (totalRevenue / totalRevenueAll) * 100 : 0
          const meta = LTV_META[seg]
          return (
            <div
              key={seg}
              className={`rounded-2xl border bg-white p-4 shadow-sm ring-1 ${meta.ring} ${seg === 'Diamond' ? 'border-purple-200' : 'border-cream-3'}`}
            >
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.bg} ${meta.text}`}>
                {seg}
              </span>
              <p className="mt-2 font-display text-2xl font-bold text-ink">{count.toLocaleString()}</p>
              <p className="text-[10px] text-ink-3 mt-0.5">customers</p>
              <div className="mt-2 border-t border-cream-2 pt-2 space-y-0.5">
                <p className="text-xs text-ink-2">{fmt(count > 0 ? totalRevenue / count : 0)} avg LTV</p>
                <p className="text-xs text-ink-3">{revPct.toFixed(0)}% of revenue</p>
              </div>
            </div>
          )
        })}
      </div>
      {totalCustomers > 0 && (
        <p className="mt-2 text-xs text-ink-3">
          Based on {totalCustomers.toLocaleString()} profiled buyers ·{' '}
          <span className="text-ink-2">Run "Build Profiles" to update</span>
        </p>
      )}
    </div>
  )
}

// ── Engagement Score Bar ───────────────────────────────────────────────────────

function EngagementBar({ score }: { score: number }) {
  const color = score >= 70 ? 'bg-teal-deep' : score >= 40 ? 'bg-yellow-400' : 'bg-red-400'
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-10 rounded-full bg-cream-2 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="font-data text-[10px] text-ink-3">{score}</span>
    </div>
  )
}

// ── Detail Panel ───────────────────────────────────────────────────────────────

function DetailPanel({ buyer, onClose }: {
  buyer: BuyerProfile
  onClose: () => void
}) {
  const [insight, setInsight] = useState('')
  const [loading, setLoading] = useState(false)

  const seg = SEGMENT_META[buyer.segment] ?? SEGMENT_META.active

  const today = new Date()
  const isOverdue = buyer.predicted_next_order_date
    ? new Date(buyer.predicted_next_order_date) < today
    : false

  async function loadInsight() {
    if (insight) return
    setLoading(true)
    try {
      const res  = await fetch('/api/customers/insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: buyer.email }),
      })
      const data = await res.json()
      setInsight(data.insight ?? data.error ?? 'Unable to load insight.')
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-charcoal/40 backdrop-blur-sm" onClick={onClose} />
      <aside className="relative z-50 w-full max-w-md bg-white shadow-2xl animate-slide-in-right overflow-y-auto">
        <div className="flex items-start justify-between border-b border-cream-2 px-6 py-5">
          <div>
            <h3 className="font-display text-base font-semibold text-ink break-all">{buyer.email}</h3>
            <p className="text-xs text-ink-3 mt-0.5">
              {buyer.first_order_at ? `First order ${new Date(buyer.first_order_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}` : 'No order history'}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-cream-2 transition text-ink-3 shrink-0 ml-3">
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 0 1 1.414 0L10 8.586l4.293-4.293a1 1 0 1 1 1.414 1.414L11.414 10l4.293 4.293a1 1 0 0 1-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 0 1-1.414-1.414L8.586 10 4.293 5.707a1 1 0 0 1 0-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Badges row */}
          <div className="flex flex-wrap gap-2">
            <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${seg.bg} ${seg.text}`}>
              {seg.label}
            </span>
            {buyer.ltv_segment && (
              <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${LTV_META[buyer.ltv_segment]?.bg ?? 'bg-cream-2'} ${LTV_META[buyer.ltv_segment]?.text ?? 'text-ink-3'}`}>
                {buyer.ltv_segment}
              </span>
            )}
            {buyer.is_subscriber && (
              <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold bg-teal-pale text-teal-deep">Subscriber</span>
            )}
            {buyer.is_loyalty_member && (
              <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold bg-yellow-50 text-yellow-700">Loyalty Member</span>
            )}
          </div>

          {/* Overdue warning */}
          {isOverdue && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              Overdue for reorder — predicted {new Date(buyer.predicted_next_order_date!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>
          )}

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-cream px-4 py-3">
              <p className="font-data text-xs text-ink-3 mb-1">Lifetime Value</p>
              <p className="font-display text-2xl font-semibold text-ink">{fmt(Number(buyer.total_revenue))}</p>
            </div>
            <div className="rounded-xl bg-cream px-4 py-3">
              <p className="font-data text-xs text-ink-3 mb-1">Total Orders</p>
              <p className="font-display text-2xl font-semibold text-ink">{buyer.total_orders}</p>
            </div>
            {buyer.engagement_score != null && (
              <div className="rounded-xl bg-cream px-4 py-3">
                <p className="font-data text-xs text-ink-3 mb-1">Engagement Score</p>
                <EngagementBar score={buyer.engagement_score} />
              </div>
            )}
            {buyer.avg_days_between_orders != null && buyer.avg_days_between_orders > 0 && (
              <div className="rounded-xl bg-cream px-4 py-3">
                <p className="font-data text-xs text-ink-3 mb-1">Avg Reorder Interval</p>
                <p className="text-sm font-semibold text-ink">{Math.round(Number(buyer.avg_days_between_orders))} days</p>
              </div>
            )}
          </div>

          {/* Subscription details */}
          {buyer.is_subscriber && buyer.subscription_interval && (
            <div className="rounded-xl bg-teal-pale/50 border border-teal/20 px-4 py-3">
              <p className="font-data text-xs text-teal-deep mb-1">Subscription</p>
              <p className="text-sm font-medium text-ink">{buyer.subscription_interval}</p>
              {buyer.subscription_mrr != null && buyer.subscription_mrr > 0 && (
                <p className="text-xs text-ink-3 mt-0.5">{fmt(Number(buyer.subscription_mrr))} MRR contribution</p>
              )}
            </div>
          )}

          {/* Loyalty details */}
          {buyer.is_loyalty_member && (
            <div className="rounded-xl bg-yellow-50 border border-yellow-200 px-4 py-3">
              <p className="font-data text-xs text-yellow-700 mb-1">Loyalty Program</p>
              {buyer.loyalty_tier && <p className="text-sm font-medium text-ink">{buyer.loyalty_tier} tier</p>}
              {buyer.loyalty_points_balance != null && (
                <p className="text-xs text-ink-3 mt-0.5">{buyer.loyalty_points_balance.toLocaleString()} points balance</p>
              )}
            </div>
          )}

          {/* Predicted next order */}
          {buyer.predicted_next_order_date && (
            <div>
              <p className="font-data text-xs text-ink-3 mb-1">Predicted Next Order</p>
              <p className={`text-sm font-medium ${isOverdue ? 'text-red-600' : 'text-ink'}`}>
                {new Date(buyer.predicted_next_order_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                {isOverdue && ' (overdue)'}
              </p>
            </div>
          )}

          {/* Product journey */}
          {(buyer.first_product_bought || buyer.most_recent_product) && (
            <div>
              <p className="font-data text-xs text-ink-3 mb-2">Product Journey</p>
              <div className="space-y-1.5">
                {buyer.first_product_bought && (
                  <div className="flex gap-2 items-start">
                    <span className="text-[10px] text-ink-3 bg-cream-2 rounded px-1.5 py-0.5 shrink-0">First</span>
                    <p className="text-xs text-ink">{buyer.first_product_bought}</p>
                  </div>
                )}
                {buyer.most_recent_product && buyer.most_recent_product !== buyer.first_product_bought && (
                  <div className="flex gap-2 items-start">
                    <span className="text-[10px] text-ink-3 bg-cream-2 rounded px-1.5 py-0.5 shrink-0">Recent</span>
                    <p className="text-xs text-ink">{buyer.most_recent_product}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* AI Insight */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="font-data text-xs text-ink-3">AI Insight</p>
              {!insight && (
                <button onClick={loadInsight} disabled={loading} className="text-xs text-teal hover:text-teal-dark font-medium transition disabled:opacity-50">
                  {loading ? 'Loading…' : 'Generate insight'}
                </button>
              )}
            </div>
            {loading && (
              <div className="rounded-xl bg-cream px-4 py-3">
                <div className="skeleton h-3 w-3/4 mb-2" /><div className="skeleton h-3 w-full mb-2" /><div className="skeleton h-3 w-2/3" />
              </div>
            )}
            {insight && (
              <div className="rounded-xl bg-teal-pale px-4 py-3">
                <p className="text-sm text-ink leading-relaxed">{insight}</p>
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}

// ── Rebuild Overlap Button ─────────────────────────────────────────────────────

function RebuildOverlapButton() {
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [info, setInfo]     = useState<string | null>(null)

  async function rebuild() {
    setStatus('running')
    setInfo(null)
    try {
      const res  = await fetch('/api/customers/rebuild-overlap', { method: 'POST' })
      const data = await res.json()
      if (!res.ok || data.error) {
        setInfo(data.error ?? 'Request failed')
        setStatus('error')
        return
      }
      setStatus('done')
      setInfo(`${(data.total_customers ?? 0).toLocaleString()} buyers · ${(data._debug?.active_subscriber_emails ?? 0).toLocaleString()} subscribers matched`)
      setTimeout(() => window.location.reload(), 1200)
    } catch {
      setInfo('Network error')
      setStatus('error')
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={rebuild}
        disabled={status === 'running' || status === 'done'}
        className="flex items-center gap-1.5 rounded-lg border border-cream-3 px-3 py-1.5 text-xs font-medium text-ink-2 hover:bg-cream-2 disabled:opacity-50 transition"
      >
        {status === 'running' ? (
          <><span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-ink-3/30 border-t-ink-3" />Rebuilding…</>
        ) : status === 'done' ? 'Done — reloading…' : (
          <><svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 8a6 6 0 1 1 12 0" strokeLinecap="round"/><path d="M2 8l2-2M2 8l-2-2" strokeLinecap="round" strokeLinejoin="round"/></svg>Rebuild Overlap</>
        )}
      </button>
      {info && (
        <p className={`text-[10px] ${status === 'error' ? 'text-red-600' : 'text-ink-3'}`}>{info}</p>
      )}
    </div>
  )
}

// ── Build Profiles Button ──────────────────────────────────────────────────────

function BuildProfilesButton() {
  const [status, setStatus]     = useState<'idle' | 'running' | 'done'>('idle')
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError]       = useState<string | null>(null)

  async function build() {
    setStatus('running')
    setError(null)
    setProgress('Starting…')

    try {
      let totalBatches = 1
      for (let b = 0; b < totalBatches; b++) {
        setProgress(`Processing batch ${b + 1} of ${totalBatches}…`)
        const res  = await fetch(`/api/customers/build-profiles?batch=${b}`, { method: 'POST' })
        const data = await res.json()
        if (!res.ok || data.error) {
          setError(data.error ?? 'Request failed')
          setStatus('idle')
          setProgress(null)
          return
        }
        totalBatches = data.totalBatches ?? 1
      }
      setProgress(null)
      setStatus('done')
      setTimeout(() => window.location.reload(), 800)
    } catch {
      setError('Network error')
      setStatus('idle')
      setProgress(null)
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={build}
        disabled={status !== 'idle'}
        className="flex items-center gap-2 rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-cream hover:bg-charcoal disabled:opacity-50 transition"
      >
        {status === 'running' ? (
          <><span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-cream/30 border-t-cream" />{progress ?? 'Building…'}</>
        ) : status === 'done' ? 'Done — reloading…' : (
          <><svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 1v6l3-3M8 7l-3-3" strokeLinecap="round" strokeLinejoin="round" /><path d="M13.5 8A5.5 5.5 0 1 1 8 2.5" strokeLinecap="round" /></svg>Build Profiles</>
        )}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function CustomerTable({
  buyers,
  page,
  totalPages,
  totalCount,
  segmentCounts,
  overlapData,
  ltvCounts,
  totalRevenueAll,
}: Props) {
  const router                  = useRouter()
  const [selected, setSelected] = useState<BuyerProfile | null>(null)
  const [activeSegment, setActiveSegment] = useState('all')

  const totalProfiled = Object.values(ltvCounts).reduce((s, v) => s + v.count, 0)

  const segmentFiltered = activeSegment === 'all'
    ? buyers
    : buyers.filter((b) => b.segment === activeSegment)

  const { sortedData: filtered, sortColumn, sortDirection, handleSort } = useSortableTable(
    segmentFiltered as unknown as Record<string, unknown>[],
    'total_revenue',
    'desc',
  )

  const today = new Date()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">Customer Intelligence</h1>
          <p className="text-sm text-ink-3 mt-0.5">
            {totalCount.toLocaleString()} unique buyers
            <span className="ml-1.5 text-ink-3/60">· includes guest checkouts and all historical orders</span>
          </p>
        </div>
        <div className="flex items-start gap-2">
          <RebuildOverlapButton />
          <BuildProfilesButton />
        </div>
      </div>

      {/* Overlap Venn */}
      {overlapData && (
        <VennDiagram data={overlapData} onSelectAll={() => setActiveSegment('vip')} />
      )}

      {/* LTV Segments */}
      <LtvSegments ltvCounts={ltvCounts} totalRevenueAll={totalRevenueAll} totalCustomers={totalProfiled} />

      {/* Segment tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {SEGMENTS.map((seg) => {
          const meta  = seg === 'all' ? null : SEGMENT_META[seg]
          const count = seg === 'all' ? totalCount : (segmentCounts[seg] ?? 0)
          return (
            <button
              key={seg}
              onClick={() => setActiveSegment(seg)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                activeSegment === seg ? 'bg-charcoal text-cream' : 'bg-white border border-cream-3 text-ink-2 hover:bg-cream'
              }`}
            >
              {meta && <span className={`inline-block h-1.5 w-1.5 rounded-full ${meta.bg}`} />}
              {meta ? meta.label : 'All'}
              <span className={`font-data ${activeSegment === seg ? 'text-cream/60' : 'text-ink-3'}`}>{count.toLocaleString()}</span>
            </button>
          )
        })}
      </div>

      {/* Ask AI about segment */}
      {activeSegment !== 'all' && SEGMENT_AI_PROMPTS[activeSegment] && (
        <div className="flex items-center gap-2">
          <span className="font-data text-[10px] uppercase tracking-widest text-ink-3">Ask AI</span>
          <button
            onClick={() => router.push(`/dashboard/chat?q=${encodeURIComponent(SEGMENT_AI_PROMPTS[activeSegment])}`)}
            className="inline-flex items-center gap-1.5 rounded-full border border-teal/25 bg-teal/5 px-3 py-1.5 text-xs font-medium text-teal hover:bg-teal hover:text-white transition"
          >
            <svg className="h-3 w-3" viewBox="0 0 12 12" fill="currentColor">
              <path d="M6 1l1.2 3.8H11l-3 2.2 1.2 3.8L6 8.5l-3.2 2.3L4 7 1 4.8h3.8L6 1z" />
            </svg>
            Ask AI about this segment
          </button>
        </div>
      )}

      {/* Table */}
      <section className="rounded-2xl border border-cream-3 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-cream-2 bg-cream/40 text-xs font-medium text-ink-3">
                <th className={`px-5 py-3 text-left ${thCls('email', sortColumn)}`} onClick={() => handleSort('email')}>Buyer<SortIcon column="email" sortColumn={sortColumn} sortDirection={sortDirection} /></th>
                <th className={`px-4 py-3 text-left ${thCls('segment', sortColumn)}`} onClick={() => handleSort('segment')}>Segment<SortIcon column="segment" sortColumn={sortColumn} sortDirection={sortDirection} /></th>
                <th className={`px-4 py-3 text-left hidden md:table-cell ${thCls('ltv_segment', sortColumn)}`} onClick={() => handleSort('ltv_segment')}>LTV Tier<SortIcon column="ltv_segment" sortColumn={sortColumn} sortDirection={sortDirection} /></th>
                <th className="px-4 py-3 text-left hidden lg:table-cell">Platforms</th>
                <th className={`px-4 py-3 text-right ${thCls('total_orders', sortColumn)}`} onClick={() => handleSort('total_orders')}>Orders<SortIcon column="total_orders" sortColumn={sortColumn} sortDirection={sortDirection} /></th>
                <th className={`px-4 py-3 text-right ${thCls('total_revenue', sortColumn)}`} onClick={() => handleSort('total_revenue')}>LTV<SortIcon column="total_revenue" sortColumn={sortColumn} sortDirection={sortDirection} /></th>
                <th className={`px-4 py-3 text-right hidden sm:table-cell ${thCls('avg_order_value', sortColumn)}`} onClick={() => handleSort('avg_order_value')}>AOV<SortIcon column="avg_order_value" sortColumn={sortColumn} sortDirection={sortDirection} /></th>
                <th className="px-4 py-3 text-center hidden xl:table-cell">Engage</th>
                <th className="px-4 py-3 text-center hidden xl:table-cell">Next Order</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-2">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-10 text-center text-sm text-ink-3">No buyers in this segment yet.</td>
                </tr>
              ) : (
                (filtered as unknown as BuyerProfile[]).map((b) => {
                  const seg     = SEGMENT_META[b.segment] ?? SEGMENT_META.active
                  const ltvMeta = b.ltv_segment ? LTV_META[b.ltv_segment] : null
                  const isOverdue = b.predicted_next_order_date
                    ? new Date(b.predicted_next_order_date) < today
                    : false
                  return (
                    <tr key={b.email} className="hover:bg-cream transition-colors cursor-pointer" onClick={() => setSelected(b)}>
                      <td className="px-5 py-3">
                        <p className="font-medium text-ink text-xs truncate max-w-[200px]">{b.email}</p>
                        {b.last_order_at && (
                          <p className="text-[10px] text-ink-3 mt-0.5">Last order {new Date(b.last_order_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${seg.bg} ${seg.text}`}>{seg.label}</span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        {ltvMeta && b.ltv_segment ? (
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ltvMeta.bg} ${ltvMeta.text}`}>{b.ltv_segment}</span>
                        ) : <span className="text-xs text-ink-3">—</span>}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <div className="flex gap-1">
                          {b.is_subscriber && <span className="rounded-full bg-teal-pale px-1.5 py-0.5 text-[10px] font-medium text-teal-deep">Sub</span>}
                          {b.is_loyalty_member && <span className="rounded-full bg-yellow-50 px-1.5 py-0.5 text-[10px] font-medium text-yellow-700">Loyal</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-data text-xs text-ink-2">{b.total_orders}</td>
                      <td className="px-4 py-3 text-right font-data text-xs font-medium text-ink">{fmt(Number(b.total_revenue))}</td>
                      <td className="px-4 py-3 text-right font-data text-xs text-ink-2 hidden sm:table-cell">{fmt(Number(b.avg_order_value))}</td>
                      <td className="px-4 py-3 text-center hidden xl:table-cell">
                        {b.engagement_score != null ? <EngagementBar score={b.engagement_score} /> : <span className="text-xs text-ink-3">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center hidden xl:table-cell">
                        {b.predicted_next_order_date ? (
                          <span className={`text-xs font-medium ${isOverdue ? 'text-red-600' : 'text-ink-2'}`}>
                            {isOverdue ? 'Overdue' : new Date(b.predicted_next_order_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        ) : <span className="text-xs text-ink-3">—</span>}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-cream-2 px-5 py-3">
            <span className="font-data text-xs text-ink-3">Page {page} of {totalPages} — {totalCount.toLocaleString()} unique buyers</span>
            <div className="flex gap-2">
              <Link href={`/dashboard/customers?page=${page - 1}`} className={`rounded-lg border border-cream-3 px-3 py-1.5 text-xs font-medium text-ink-2 hover:bg-cream transition ${page <= 1 ? 'pointer-events-none opacity-40' : ''}`}>Previous</Link>
              <Link href={`/dashboard/customers?page=${page + 1}`} className={`rounded-lg border border-cream-3 px-3 py-1.5 text-xs font-medium text-ink-2 hover:bg-cream transition ${page >= totalPages ? 'pointer-events-none opacity-40' : ''}`}>Next</Link>
            </div>
          </div>
        )}
      </section>

      {/* Detail panel */}
      {selected && (
        <DetailPanel
          buyer={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
