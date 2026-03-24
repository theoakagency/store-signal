'use client'

import { useState } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ProductStat {
  product_title: string
  variant_title: string | null
  total_revenue: number
  total_orders: number
  unique_customers: number
  repeat_purchase_rate: number
  avg_days_to_repurchase: number | null
  subscription_conversion_rate: number
  is_subscribable: boolean
  revenue_30d: number
  revenue_90d: number
  revenue_12m: number
  avg_order_value_with_product: number
  calculated_at: string | null
}

export interface AffinityPair {
  product_a: string
  product_b: string
  co_purchase_count: number
  co_purchase_rate: number
  confidence: number
  lift: number
}

export interface PurchaseSequence {
  first_product: string
  second_product: string
  sequence_count: number
  avg_days_between: number
  ltv_of_customers_in_sequence: number
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function pct(n: number) {
  return (Number(n) * 100).toFixed(0) + '%'
}

function liftColor(lift: number) {
  if (lift >= 3) return 'text-teal'
  if (lift >= 2) return 'text-amber-400'
  return 'text-cream/50'
}

// ── Detail Panel ───────────────────────────────────────────────────────────────

function ProductDetailPanel({
  product,
  onClose,
  affinities,
}: {
  product: ProductStat
  onClose: () => void
  affinities: AffinityPair[]
}) {
  const related = affinities
    .filter((a) => a.product_a === product.product_title || a.product_b === product.product_title)
    .map((a) => ({
      partner: a.product_a === product.product_title ? a.product_b : a.product_a,
      count: a.co_purchase_count,
      lift: a.lift,
      confidence: a.confidence,
    }))
    .sort((a, b) => b.lift - a.lift)
    .slice(0, 5)

  const subGap = product.repeat_purchase_rate - product.subscription_conversion_rate
  const hasSubOpportunity = subGap > 0.2 && !product.is_subscribable

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div
        className="w-full max-w-md h-full bg-charcoal border-l border-cream/10 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-cream/10">
          <div>
            <h2 className="text-cream font-semibold text-sm leading-tight">{product.product_title}</h2>
            {product.variant_title && (
              <p className="text-cream/40 text-xs mt-0.5">{product.variant_title}</p>
            )}
          </div>
          <button onClick={onClose} className="text-cream/40 hover:text-cream transition-colors p-1">
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Revenue breakdown */}
          <section>
            <h3 className="text-cream/50 text-[10px] font-data uppercase tracking-widest mb-3">Revenue</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'All Time', value: fmt(product.total_revenue) },
                { label: 'Last 12 Months', value: fmt(product.revenue_12m) },
                { label: 'Last 90 Days', value: fmt(product.revenue_90d) },
                { label: 'Last 30 Days', value: fmt(product.revenue_30d) },
              ].map(({ label, value }) => (
                <div key={label} className="bg-cream/5 rounded-lg p-3">
                  <p className="text-cream/40 text-[10px] mb-1">{label}</p>
                  <p className="text-cream font-data text-sm">{value}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Customer metrics */}
          <section>
            <h3 className="text-cream/50 text-[10px] font-data uppercase tracking-widest mb-3">Customer Behavior</h3>
            <div className="space-y-2">
              {[
                { label: 'Unique Buyers', value: product.unique_customers.toLocaleString() },
                { label: 'Total Orders', value: product.total_orders.toLocaleString() },
                { label: 'Avg Order Value (basket)', value: fmt(product.avg_order_value_with_product) },
                { label: 'Repeat Purchase Rate', value: pct(product.repeat_purchase_rate) },
                {
                  label: 'Avg Days to Repurchase',
                  value: product.avg_days_to_repurchase
                    ? Math.round(product.avg_days_to_repurchase) + ' days'
                    : '—',
                },
                { label: 'Subscription Conversion', value: pct(product.subscription_conversion_rate) },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between items-center py-1.5 border-b border-cream/5">
                  <span className="text-cream/50 text-xs">{label}</span>
                  <span className="text-cream text-xs font-data">{value}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Subscription opportunity */}
          {hasSubOpportunity && (
            <section className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <svg className="h-4 w-4 text-amber-400 mt-0.5 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 12A5 5 0 118 3a5 5 0 010 10zm-.75-7.5h1.5v4h-1.5v-4zm0 5h1.5v1.5h-1.5V10.5z"/>
                </svg>
                <div>
                  <p className="text-amber-400 text-xs font-semibold">Subscription Opportunity</p>
                  <p className="text-cream/60 text-xs mt-1">
                    {pct(product.repeat_purchase_rate)} of buyers repurchase but only {pct(product.subscription_conversion_rate)} subscribe.
                    {product.avg_days_to_repurchase
                      ? ` Customers reorder every ~${Math.round(product.avg_days_to_repurchase)} days — a natural subscription cadence.`
                      : ''}
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* Affinity partners */}
          {related.length > 0 && (
            <section>
              <h3 className="text-cream/50 text-[10px] font-data uppercase tracking-widest mb-3">Frequently Bought With</h3>
              <div className="space-y-2">
                {related.map((r) => (
                  <div key={r.partner} className="flex items-center gap-3 py-1.5 border-b border-cream/5">
                    <div className="flex-1 min-w-0">
                      <p className="text-cream text-xs truncate">{r.partner}</p>
                      <p className="text-cream/40 text-[10px]">{r.count} co-purchases</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`text-xs font-data font-semibold ${liftColor(r.lift)}`}>{r.lift.toFixed(1)}× lift</p>
                      <p className="text-cream/40 text-[10px]">{pct(r.confidence)} conf</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Tab 1: Product Performance ────────────────────────────────────────────────

function ProductPerformanceTab({
  products,
  affinities,
}: {
  products: ProductStat[]
  affinities: AffinityPair[]
}) {
  const [selected, setSelected] = useState<ProductStat | null>(null)

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-cream/10">
              {['Product', 'Total Revenue', '12M Revenue', 'Buyers', 'Repeat Rate', 'Reorder Cycle', 'Sub Conv.'].map((h) => (
                <th key={h} className="text-left py-3 px-4 text-cream/40 text-[10px] font-data uppercase tracking-widest font-normal whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr
                key={`${p.product_title}__${p.variant_title}`}
                className="border-b border-cream/5 hover:bg-cream/5 cursor-pointer transition-colors"
                onClick={() => setSelected(p)}
              >
                <td className="py-3 px-4">
                  <p className="text-cream text-xs font-medium leading-tight">{p.product_title}</p>
                  {p.variant_title && <p className="text-cream/40 text-[10px]">{p.variant_title}</p>}
                </td>
                <td className="py-3 px-4 text-cream font-data text-xs">{fmt(p.total_revenue)}</td>
                <td className="py-3 px-4 text-cream/70 font-data text-xs">{fmt(p.revenue_12m)}</td>
                <td className="py-3 px-4 text-cream/70 font-data text-xs">{p.unique_customers.toLocaleString()}</td>
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1 bg-cream/10 rounded-full max-w-[60px]">
                      <div
                        className="h-1 rounded-full bg-teal"
                        style={{ width: `${Math.min(100, Number(p.repeat_purchase_rate) * 100)}%` }}
                      />
                    </div>
                    <span className="text-cream/70 font-data text-xs">{pct(p.repeat_purchase_rate)}</span>
                  </div>
                </td>
                <td className="py-3 px-4 text-cream/70 font-data text-xs">
                  {p.avg_days_to_repurchase ? Math.round(Number(p.avg_days_to_repurchase)) + 'd' : '—'}
                </td>
                <td className="py-3 px-4">
                  <span className={`text-xs font-data ${Number(p.subscription_conversion_rate) > 0.1 ? 'text-teal' : 'text-cream/50'}`}>
                    {pct(p.subscription_conversion_rate)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {products.length === 0 && (
          <div className="text-center py-16 text-cream/30">
            <p className="text-sm">No product data yet.</p>
            <p className="text-xs mt-1">Run Product Analysis to populate this table.</p>
          </div>
        )}
      </div>

      {selected && (
        <ProductDetailPanel
          product={selected}
          onClose={() => setSelected(null)}
          affinities={affinities}
        />
      )}
    </>
  )
}

// ── Tab 2: Market Basket ──────────────────────────────────────────────────────

function MarketBasketTab({ affinities }: { affinities: AffinityPair[] }) {
  // Deduplicate — only show canonical pairs (A < B alphabetically)
  const seen = new Set<string>()
  const deduped = affinities.filter((a) => {
    const key = [a.product_a, a.product_b].sort().join('|||')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // Bundle opportunities: high lift + high co-purchase count
  const bundles = deduped.filter((a) => a.lift >= 2 && a.co_purchase_count >= 10).slice(0, 3)

  return (
    <div className="space-y-6">
      {/* Bundle opportunity cards */}
      {bundles.length > 0 && (
        <div>
          <h3 className="text-cream/50 text-[10px] font-data uppercase tracking-widest mb-3">Bundle Opportunities</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {bundles.map((b) => (
              <div key={`${b.product_a}+${b.product_b}`} className="bg-teal/10 border border-teal/20 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <svg className="h-4 w-4 text-teal flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M3 2h10a1 1 0 011 1v1H2V3a1 1 0 011-1zM2 5h12v8a1 1 0 01-1 1H3a1 1 0 01-1-1V5zm4 3a1 1 0 000 2h4a1 1 0 000-2H6z"/>
                  </svg>
                  <span className="text-teal text-[10px] font-data uppercase tracking-wider">Bundle Idea</span>
                </div>
                <p className="text-cream text-xs font-medium leading-snug">{b.product_a}</p>
                <p className="text-cream/40 text-xs my-1">+ {b.product_b}</p>
                <div className="flex items-center gap-3 mt-3 pt-3 border-t border-teal/20">
                  <div>
                    <p className="text-[10px] text-cream/40">Lift</p>
                    <p className="text-teal font-data text-sm font-semibold">{b.lift.toFixed(1)}×</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-cream/40">Co-purchases</p>
                    <p className="text-cream font-data text-sm">{b.co_purchase_count}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-cream/40">Confidence</p>
                    <p className="text-cream font-data text-sm">{pct(b.confidence)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Affinity table */}
      <div>
        <h3 className="text-cream/50 text-[10px] font-data uppercase tracking-widest mb-3">All Affinity Pairs</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-cream/10">
                {['Product A', 'Product B', 'Co-purchases', 'Co-purchase Rate', 'Confidence', 'Lift'].map((h) => (
                  <th key={h} className="text-left py-3 px-4 text-cream/40 text-[10px] font-data uppercase tracking-widest font-normal whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {deduped.map((a) => (
                <tr key={`${a.product_a}|||${a.product_b}`} className="border-b border-cream/5">
                  <td className="py-3 px-4 text-cream text-xs max-w-[180px] truncate">{a.product_a}</td>
                  <td className="py-3 px-4 text-cream text-xs max-w-[180px] truncate">{a.product_b}</td>
                  <td className="py-3 px-4 text-cream/70 font-data text-xs">{a.co_purchase_count}</td>
                  <td className="py-3 px-4 text-cream/70 font-data text-xs">{(Number(a.co_purchase_rate) * 100).toFixed(1)}%</td>
                  <td className="py-3 px-4 text-cream/70 font-data text-xs">{pct(a.confidence)}</td>
                  <td className="py-3 px-4">
                    <span className={`font-data text-xs font-semibold ${liftColor(a.lift)}`}>{a.lift.toFixed(1)}×</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {deduped.length === 0 && (
            <div className="text-center py-16 text-cream/30">
              <p className="text-sm">No affinity data yet.</p>
              <p className="text-xs mt-1">Run Product Analysis to discover product pairs.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Tab 3: Purchase Sequences ─────────────────────────────────────────────────

function PurchaseSequencesTab({ sequences }: { sequences: PurchaseSequence[] }) {
  return (
    <div className="space-y-4">
      <p className="text-cream/40 text-xs">
        First-to-second purchase transitions within 90 days, ranked by customer lifetime value.
        These reveal your most valuable customer journeys.
      </p>

      <div className="space-y-3">
        {sequences.map((s, i) => (
          <div key={`${s.first_product}→${s.second_product}`} className="bg-cream/5 border border-cream/10 rounded-lg p-4">
            <div className="flex items-start gap-4">
              <span className="text-cream/20 font-data text-lg font-bold w-6 flex-shrink-0 mt-0.5">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-cream text-xs font-medium bg-cream/10 rounded px-2 py-0.5 max-w-[200px] truncate">
                    {s.first_product}
                  </span>
                  <svg className="h-3 w-3 text-teal flex-shrink-0" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M2 6h8M7 3l3 3-3 3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span className="text-cream text-xs font-medium bg-teal/10 border border-teal/20 text-teal rounded px-2 py-0.5 max-w-[200px] truncate">
                    {s.second_product}
                  </span>
                </div>
                <div className="flex items-center gap-4 mt-3">
                  <div>
                    <p className="text-[10px] text-cream/40">Customers</p>
                    <p className="text-cream font-data text-sm">{s.sequence_count}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-cream/40">Avg Days Between</p>
                    <p className="text-cream font-data text-sm">{Math.round(Number(s.avg_days_between))}d</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-cream/40">Avg Customer LTV</p>
                    <p className="text-teal font-data text-sm font-semibold">{fmt(s.ltv_of_customers_in_sequence)}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}

        {sequences.length === 0 && (
          <div className="text-center py-16 text-cream/30">
            <p className="text-sm">No sequence data yet.</p>
            <p className="text-xs mt-1">Run Product Analysis to discover purchase journeys.</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Tab 4: Repurchase Intelligence ────────────────────────────────────────────

function RepurchaseIntelligenceTab({ products }: { products: ProductStat[] }) {
  // Products with high repeat rate (>30%) but low subscription conversion (<10%)
  const subOpps = products
    .filter((p) => Number(p.repeat_purchase_rate) > 0.3 && Number(p.subscription_conversion_rate) < 0.1)
    .sort((a, b) => Number(b.repeat_purchase_rate) - Number(a.repeat_purchase_rate))

  // Fast repurchasers: avg days < 45
  const fastReorder = products
    .filter((p) => p.avg_days_to_repurchase && Number(p.avg_days_to_repurchase) < 45 && Number(p.unique_customers) >= 5)
    .sort((a, b) => Number(a.avg_days_to_repurchase) - Number(b.avg_days_to_repurchase))
    .slice(0, 8)

  return (
    <div className="space-y-8">
      {/* Subscription opportunities */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-cream/50 text-[10px] font-data uppercase tracking-widest">Subscription Opportunities</h3>
          <span className="text-[10px] text-cream/30">High repeat rate, low subscription conversion</span>
        </div>

        {subOpps.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {subOpps.slice(0, 6).map((p) => {
              const gap = (Number(p.repeat_purchase_rate) - Number(p.subscription_conversion_rate)) * 100
              return (
                <div key={p.product_title} className="bg-amber-500/5 border border-amber-500/15 rounded-lg p-4">
                  <p className="text-cream text-xs font-medium leading-tight mb-3">{p.product_title}</p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-[10px] text-cream/40">Repeat Rate</p>
                      <p className="text-amber-400 font-data text-sm font-semibold">{pct(p.repeat_purchase_rate)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-cream/40">Subscribe Rate</p>
                      <p className="text-cream/60 font-data text-sm">{pct(p.subscription_conversion_rate)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-cream/40">Opportunity Gap</p>
                      <p className="text-amber-400 font-data text-sm font-semibold">+{gap.toFixed(0)}pp</p>
                    </div>
                  </div>
                  {p.avg_days_to_repurchase && (
                    <p className="text-cream/40 text-[10px] mt-3">
                      Suggest every {Math.round(Number(p.avg_days_to_repurchase))} day subscription
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-cream/30 text-sm text-center py-8">No subscription opportunities identified yet.</p>
        )}
      </div>

      {/* Fast reorder products */}
      {fastReorder.length > 0 && (
        <div>
          <h3 className="text-cream/50 text-[10px] font-data uppercase tracking-widest mb-4">Fastest Reorder Cycle</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-cream/10">
                  {['Product', 'Avg Days to Reorder', 'Repeat Rate', 'Subscription Conv.', 'Unique Buyers'].map((h) => (
                    <th key={h} className="text-left py-3 px-4 text-cream/40 text-[10px] font-data uppercase tracking-widest font-normal whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fastReorder.map((p) => (
                  <tr key={p.product_title} className="border-b border-cream/5">
                    <td className="py-3 px-4 text-cream text-xs max-w-[200px]">
                      <p className="truncate">{p.product_title}</p>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-teal font-data text-xs font-semibold">
                        {Math.round(Number(p.avg_days_to_repurchase))}d
                      </span>
                    </td>
                    <td className="py-3 px-4 text-cream/70 font-data text-xs">{pct(p.repeat_purchase_rate)}</td>
                    <td className="py-3 px-4 text-cream/70 font-data text-xs">{pct(p.subscription_conversion_rate)}</td>
                    <td className="py-3 px-4 text-cream/70 font-data text-xs">{p.unique_customers}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tab 5: AI Product Insights ────────────────────────────────────────────────

function AiInsightsTab() {
  const [insight, setInsight] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function generate() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/insights/products', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      setInsight(data.insight)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-cream/60 text-xs leading-relaxed">
            Claude analyzes your product stats, affinity pairs, purchase sequences, and subscription gaps
            to answer 6 targeted merchandising questions.
          </p>
        </div>
        <button
          onClick={generate}
          disabled={loading}
          className="flex-shrink-0 px-4 py-2 bg-teal text-charcoal text-xs font-semibold rounded-lg hover:bg-teal/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Analyzing…' : 'Generate Insights'}
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-400 text-xs">
          {error}
        </div>
      )}

      {insight && (
        <div className="bg-cream/5 border border-cream/10 rounded-lg p-6">
          <div className="prose prose-sm max-w-none">
            {insight.split('\n').map((line, i) => {
              if (!line.trim()) return <br key={i} />
              const numbered = line.match(/^(\d+)\.\s+(.*)/)
              if (numbered) {
                return (
                  <div key={i} className="mb-4">
                    <div className="flex gap-3">
                      <span className="flex-shrink-0 w-6 h-6 bg-teal/20 text-teal rounded-full flex items-center justify-center text-[10px] font-bold">
                        {numbered[1]}
                      </span>
                      <p className="text-cream/80 text-xs leading-relaxed">{numbered[2]}</p>
                    </div>
                  </div>
                )
              }
              return <p key={i} className="text-cream/70 text-xs leading-relaxed mb-2">{line}</p>
            })}
          </div>
        </div>
      )}

      {!insight && !loading && !error && (
        <div className="text-center py-16 text-cream/20">
          <svg className="h-12 w-12 mx-auto mb-4 opacity-30" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="24" cy="24" r="20" />
            <path d="M17 24c0-3.9 3.1-7 7-7s7 3.1 7 7c0 3.9-3.1 7-7 7" strokeLinecap="round"/>
            <path d="M24 33v2" strokeLinecap="round"/>
          </svg>
          <p className="text-sm">Click Generate Insights to get Claude's analysis</p>
        </div>
      )}
    </div>
  )
}

// ── Analyze button ────────────────────────────────────────────────────────────

function AnalyzeButton() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setLoading(true)
    setResult(null)
    setError(null)
    try {
      const res = await fetch('/api/products/analyze', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Analysis failed')
      setResult(`Analyzed ${data.products_analyzed} products, ${data.affinity_pairs} pairs, ${data.sequences} sequences`)
      setTimeout(() => window.location.reload(), 1500)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      {result && <span className="text-teal text-xs">{result}</span>}
      {error && <span className="text-red-400 text-xs">{error}</span>}
      <button
        onClick={run}
        disabled={loading}
        className="px-4 py-2 border border-cream/20 text-cream/70 text-xs rounded-lg hover:border-cream/40 hover:text-cream disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Analyzing…' : 'Run Product Analysis'}
      </button>
    </div>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

const TABS = [
  'Product Performance',
  'Market Basket',
  'Purchase Sequences',
  'Repurchase Intelligence',
  'AI Insights',
] as const

type Tab = typeof TABS[number]

export default function ProductDashboard({
  productStats,
  affinities,
  sequences,
}: {
  productStats: ProductStat[]
  affinities: AffinityPair[]
  sequences: PurchaseSequence[]
}) {
  const [activeTab, setActiveTab] = useState<Tab>('Product Performance')

  const calculatedAt = productStats[0]?.calculated_at
    ? new Date(productStats[0].calculated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-cream text-xl font-semibold">Product Intelligence</h1>
          <p className="text-cream/40 text-xs mt-1">
            {productStats.length > 0
              ? `${productStats.length} products analyzed${calculatedAt ? ` · Last updated ${calculatedAt}` : ''}`
              : 'No product data yet — run analysis to get started'}
          </p>
        </div>
        <AnalyzeButton />
      </div>

      {/* Summary cards */}
      {productStats.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            {
              label: 'Total Products',
              value: productStats.length.toLocaleString(),
              sub: 'unique SKUs',
            },
            {
              label: 'Avg Repeat Rate',
              value: pct(productStats.reduce((s, p) => s + Number(p.repeat_purchase_rate), 0) / productStats.length),
              sub: 'across all products',
            },
            {
              label: 'Affinity Pairs',
              value: Math.round(affinities.length / 2).toLocaleString(),
              sub: 'frequently co-purchased',
            },
            {
              label: 'Purchase Sequences',
              value: sequences.length.toLocaleString(),
              sub: 'first→second transitions',
            },
          ].map(({ label, value, sub }) => (
            <div key={label} className="bg-cream/5 border border-cream/10 rounded-lg p-4">
              <p className="text-cream/40 text-[10px] font-data uppercase tracking-widest">{label}</p>
              <p className="text-cream text-2xl font-data mt-1">{value}</p>
              <p className="text-cream/30 text-[10px] mt-0.5">{sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div>
        <div className="flex gap-0 border-b border-cream/10 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-xs whitespace-nowrap transition-colors border-b-2 -mb-px ${
                activeTab === tab
                  ? 'border-teal text-teal'
                  : 'border-transparent text-cream/40 hover:text-cream/70'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="pt-6">
          {activeTab === 'Product Performance' && (
            <ProductPerformanceTab products={productStats} affinities={affinities} />
          )}
          {activeTab === 'Market Basket' && (
            <MarketBasketTab affinities={affinities} />
          )}
          {activeTab === 'Purchase Sequences' && (
            <PurchaseSequencesTab sequences={sequences} />
          )}
          {activeTab === 'Repurchase Intelligence' && (
            <RepurchaseIntelligenceTab products={productStats} />
          )}
          {activeTab === 'AI Insights' && <AiInsightsTab />}
        </div>
      </div>
    </div>
  )
}
