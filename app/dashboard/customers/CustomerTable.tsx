'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

const SEGMENT_AI_PROMPTS: Record<string, string> = {
  vip:     'Tell me about my VIP customers and what I can do to maximize their lifetime value',
  active:  'Tell me about my active customers and how I can increase their purchase frequency',
  at_risk: 'Tell me about my at-risk customers and what win-back tactics would work best for them',
  lapsed:  'Tell me about my lapsed customers and the best way to re-engage them',
  new:     'Tell me about my new customers and how I can convert them into repeat buyers',
}

interface Customer {
  id: string
  shopify_customer_id: number
  email: string | null
  first_name: string | null
  last_name: string | null
  phone: string | null
  orders_count: number
  total_spent: number
  tags: string[]
  updated_at: string
  segment: string
}

interface Props {
  customers: Customer[]
  page: number
  totalPages: number
  totalCount: number
  segmentCounts: Record<string, number>
}

const SEGMENT_META: Record<string, { label: string; bg: string; text: string }> = {
  vip:      { label: 'VIP',      bg: 'bg-teal-pale',  text: 'text-teal-deep' },
  active:   { label: 'Active',   bg: 'bg-green-50',   text: 'text-green-700' },
  at_risk:  { label: 'At Risk',  bg: 'bg-orange-50',  text: 'text-orange-700' },
  lapsed:   { label: 'Lapsed',   bg: 'bg-cream-2',    text: 'text-ink-3' },
  new:      { label: 'New',      bg: 'bg-blue-50',    text: 'text-blue-700' },
}

const SEGMENTS = ['all', 'vip', 'active', 'at_risk', 'lapsed', 'new']

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n)
}

// ── Detail panel ──────────────────────────────────────────────────────────────

function DetailPanel({
  customer,
  onClose,
}: {
  customer: Customer
  onClose: () => void
}) {
  const [insight, setInsight] = useState('')
  const [loading, setLoading] = useState(false)

  const fullName = [customer.first_name, customer.last_name].filter(Boolean).join(' ') || 'Guest'
  const seg = SEGMENT_META[customer.segment] ?? SEGMENT_META.active

  async function loadInsight() {
    if (insight) return
    setLoading(true)
    try {
      const res = await fetch('/api/customers/insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopify_customer_id: customer.shopify_customer_id }),
      })
      const data = await res.json()
      setInsight(data.insight ?? data.error ?? 'Unable to load insight.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-charcoal/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <aside className="relative z-50 w-full max-w-md bg-white shadow-2xl animate-slide-in-right overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-cream-2 px-6 py-5">
          <div>
            <h3 className="font-display text-xl font-semibold text-ink">{fullName}</h3>
            <p className="text-sm text-ink-3 mt-0.5">{customer.email ?? 'No email'}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 hover:bg-cream-2 transition text-ink-3"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 0 1 1.414 0L10 8.586l4.293-4.293a1 1 0 1 1 1.414 1.414L11.414 10l4.293 4.293a1 1 0 0 1-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 0 1-1.414-1.414L8.586 10 4.293 5.707a1 1 0 0 1 0-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Segment badge */}
          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${seg.bg} ${seg.text}`}>
            {seg.label}
          </span>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-cream px-4 py-3">
              <p className="font-data text-xs text-ink-3 mb-1">Lifetime Value</p>
              <p className="font-display text-2xl font-semibold text-ink">{fmt(customer.total_spent)}</p>
            </div>
            <div className="rounded-xl bg-cream px-4 py-3">
              <p className="font-data text-xs text-ink-3 mb-1">Total Orders</p>
              <p className="font-display text-2xl font-semibold text-ink">{customer.orders_count}</p>
            </div>
          </div>

          {customer.phone && (
            <div>
              <p className="font-data text-xs text-ink-3 mb-1">Phone</p>
              <p className="text-sm text-ink">{customer.phone}</p>
            </div>
          )}

          {customer.tags.length > 0 && (
            <div>
              <p className="font-data text-xs text-ink-3 mb-2">Tags</p>
              <div className="flex flex-wrap gap-1.5">
                {customer.tags.map((t) => (
                  <span key={t} className="rounded-full bg-cream-2 px-2 py-0.5 text-xs text-ink-2">{t}</span>
                ))}
              </div>
            </div>
          )}

          {/* AI Insight */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="font-data text-xs text-ink-3">AI Insight</p>
              {!insight && (
                <button
                  onClick={loadInsight}
                  disabled={loading}
                  className="text-xs text-teal hover:text-teal-dark font-medium transition disabled:opacity-50"
                >
                  {loading ? 'Loading…' : 'Generate insight'}
                </button>
              )}
            </div>
            {loading && (
              <div className="rounded-xl bg-cream px-4 py-3">
                <div className="skeleton h-3 w-3/4 mb-2" />
                <div className="skeleton h-3 w-full mb-2" />
                <div className="skeleton h-3 w-2/3" />
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

// ── Main table component ───────────────────────────────────────────────────────

export default function CustomerTable({
  customers,
  page,
  totalPages,
  totalCount,
  segmentCounts,
}: Props) {
  const router = useRouter()
  const [selected, setSelected] = useState<Customer | null>(null)
  const [activeSegment, setActiveSegment] = useState('all')

  const filtered = activeSegment === 'all'
    ? customers
    : customers.filter((c) => c.segment === activeSegment)

  return (
    <div className="space-y-4">
      {/* Segment tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {SEGMENTS.map((seg) => {
          const meta = seg === 'all' ? null : SEGMENT_META[seg]
          const count = seg === 'all' ? totalCount : (segmentCounts[seg] ?? 0)
          return (
            <button
              key={seg}
              onClick={() => setActiveSegment(seg)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                activeSegment === seg
                  ? 'bg-charcoal text-cream'
                  : 'bg-white border border-cream-3 text-ink-2 hover:bg-cream'
              }`}
            >
              {meta ? (
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${meta.bg.replace('bg-', 'bg-')}`} />
              ) : null}
              {meta ? meta.label : 'All'}
              <span className={`font-data ${activeSegment === seg ? 'text-cream/60' : 'text-ink-3'}`}>{count}</span>
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
              <tr className="border-b border-cream-2 text-xs font-medium text-ink-3">
                <th className="px-5 py-3 text-left">Customer</th>
                <th className="px-5 py-3 text-left">Segment</th>
                <th className="px-5 py-3 text-right">Orders</th>
                <th className="px-5 py-3 text-right">LTV</th>
                <th className="px-5 py-3 text-right">AOV</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-2">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-sm text-ink-3">
                    No customers in this segment yet.
                  </td>
                </tr>
              ) : (
                filtered.map((c) => {
                  const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Guest'
                  const aov = c.orders_count > 0 ? c.total_spent / c.orders_count : 0
                  const seg = SEGMENT_META[c.segment] ?? SEGMENT_META.active
                  return (
                    <tr
                      key={c.id}
                      className="hover:bg-cream transition-colors cursor-pointer"
                      onClick={() => setSelected(c)}
                    >
                      <td className="px-5 py-3">
                        <p className="font-medium text-ink">{name}</p>
                        <p className="text-xs text-ink-3">{c.email ?? 'No email'}</p>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${seg.bg} ${seg.text}`}>
                          {seg.label}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right font-data text-xs text-ink-2">{c.orders_count}</td>
                      <td className="px-5 py-3 text-right font-data text-xs font-medium text-ink">{fmt(c.total_spent)}</td>
                      <td className="px-5 py-3 text-right font-data text-xs text-ink-2">{fmt(aov)}</td>
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
            <span className="font-data text-xs text-ink-3">
              Page {page} of {totalPages} — {totalCount.toLocaleString()} customers
            </span>
            <div className="flex gap-2">
              <Link
                href={`/dashboard/customers?page=${page - 1}`}
                className={`rounded-lg border border-cream-3 px-3 py-1.5 text-xs font-medium text-ink-2 hover:bg-cream transition ${page <= 1 ? 'pointer-events-none opacity-40' : ''}`}
              >
                Previous
              </Link>
              <Link
                href={`/dashboard/customers?page=${page + 1}`}
                className={`rounded-lg border border-cream-3 px-3 py-1.5 text-xs font-medium text-ink-2 hover:bg-cream transition ${page >= totalPages ? 'pointer-events-none opacity-40' : ''}`}
              >
                Next
              </Link>
            </div>
          </div>
        )}
      </section>

      {/* Detail panel */}
      {selected && (
        <DetailPanel customer={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}
