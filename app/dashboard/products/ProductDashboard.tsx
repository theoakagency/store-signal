'use client'

import { useState } from 'react'
import { useSortableTable, SortIcon, thCls } from '@/hooks/useSortableTable'

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

function liftBadge(lift: number) {
  if (lift >= 3) return 'bg-teal-pale text-teal-deep'
  if (lift >= 2) return 'bg-yellow-50 text-yellow-700'
  return 'bg-cream-2 text-ink-3'
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

  const subGap = Number(product.repeat_purchase_rate) - Number(product.subscription_conversion_rate)
  const hasSubOpportunity = subGap > 0.2 && !product.is_subscribable

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div
        className="w-full max-w-md h-full bg-white border-l border-cream-3 overflow-y-auto shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-cream-3">
          <div>
            <h2 className="text-ink font-semibold text-sm leading-tight">{product.product_title}</h2>
            {product.variant_title && (
              <p className="text-ink-3 text-xs mt-0.5">{product.variant_title}</p>
            )}
          </div>
          <button onClick={onClose} className="text-ink-3 hover:text-ink transition-colors p-1">
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Revenue breakdown */}
          <section>
            <h3 className="text-ink-3 text-[10px] font-data uppercase tracking-widest mb-3">Revenue</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'All Time', value: fmt(product.total_revenue) },
                { label: 'Last 12 Months', value: fmt(product.revenue_12m) },
                { label: 'Last 90 Days', value: fmt(product.revenue_90d) },
                { label: 'Last 30 Days', value: fmt(product.revenue_30d) },
              ].map(({ label, value }) => (
                <div key={label} className="bg-cream rounded-lg p-3">
                  <p className="text-ink-3 text-[10px] mb-1">{label}</p>
                  <p className="text-ink font-data text-sm font-semibold">{value}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Customer metrics */}
          <section>
            <h3 className="text-ink-3 text-[10px] font-data uppercase tracking-widest mb-3">Customer Behavior</h3>
            <div className="space-y-0.5">
              {[
                { label: 'Unique Buyers', value: product.unique_customers.toLocaleString() },
                { label: 'Total Orders', value: product.total_orders.toLocaleString() },
                { label: 'Avg Basket Value', value: fmt(product.avg_order_value_with_product) },
                { label: 'Repeat Purchase Rate', value: pct(product.repeat_purchase_rate) },
                {
                  label: 'Avg Days to Repurchase',
                  value: product.avg_days_to_repurchase
                    ? Math.round(Number(product.avg_days_to_repurchase)) + ' days'
                    : '—',
                },
                { label: 'Subscription Conversion', value: pct(product.subscription_conversion_rate) },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between items-center py-2 border-b border-cream-2">
                  <span className="text-ink-3 text-xs">{label}</span>
                  <span className="text-ink text-xs font-data font-medium">{value}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Subscription opportunity */}
          {hasSubOpportunity && (
            <section className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <svg className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm-.75 4h1.5v4.5h-1.5V5zm0 5.5h1.5V12h-1.5v-1.5z"/>
                </svg>
                <div>
                  <p className="text-yellow-700 text-xs font-semibold">Subscription Opportunity</p>
                  <p className="text-yellow-700/80 text-xs mt-1">
                    {pct(product.repeat_purchase_rate)} of buyers repurchase but only {pct(product.subscription_conversion_rate)} subscribe.
                    {product.avg_days_to_repurchase
                      ? ` Customers reorder every ~${Math.round(Number(product.avg_days_to_repurchase))} days.`
                      : ''}
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* Affinity partners */}
          {related.length > 0 && (
            <section>
              <h3 className="text-ink-3 text-[10px] font-data uppercase tracking-widest mb-3">Frequently Bought With</h3>
              <div className="space-y-0.5">
                {related.map((r) => (
                  <div key={r.partner} className="flex items-center gap-3 py-2 border-b border-cream-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-ink text-xs truncate">{r.partner}</p>
                      <p className="text-ink-3 text-[10px]">{r.count} co-purchases</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${liftBadge(r.lift)}`}>
                        {r.lift.toFixed(1)}× lift
                      </span>
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
  const { sortedData: sortedProducts, sortColumn, sortDirection, handleSort } = useSortableTable(
    products as unknown as Record<string, unknown>[],
    'total_revenue',
    'desc',
  )

  const HEADERS: [string, string][] = [
    ['Product', ''],
    ['Total Revenue', 'total_revenue'],
    ['12M Revenue', 'revenue_12m'],
    ['Buyers', 'unique_customers'],
    ['Repeat Rate', 'repeat_purchase_rate'],
    ['Reorder Cycle', 'avg_days_to_repurchase'],
    ['Sub Conv.', 'subscription_conversion_rate'],
  ]

  return (
    <>
      <div className="overflow-x-auto rounded-2xl border border-cream-3 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-cream-3 bg-cream">
              {HEADERS.map(([h, field]) => (
                <th
                  key={h}
                  className={`text-left py-3 px-4 text-ink-3 text-[10px] font-data uppercase tracking-widest font-normal whitespace-nowrap ${field ? thCls(field, sortColumn) : ''}`}
                  onClick={field ? () => handleSort(field) : undefined}
                >
                  {h}{field && <SortIcon column={field} sortColumn={sortColumn} sortDirection={sortDirection} />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(sortedProducts as unknown as ProductStat[]).map((p) => (
              <tr
                key={`${p.product_title}__${p.variant_title}`}
                className="border-b border-cream-2 hover:bg-cream cursor-pointer transition-colors"
                onClick={() => setSelected(p)}
              >
                <td className="py-3 px-4">
                  <p className="text-ink text-xs font-medium leading-tight">{p.product_title}</p>
                  {p.variant_title && <p className="text-ink-3 text-[10px]">{p.variant_title}</p>}
                </td>
                <td className="py-3 px-4 text-ink font-data text-xs font-medium">{fmt(p.total_revenue)}</td>
                <td className="py-3 px-4 text-ink-2 font-data text-xs">{fmt(p.revenue_12m)}</td>
                <td className="py-3 px-4 text-ink-2 font-data text-xs">{p.unique_customers.toLocaleString()}</td>
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-cream-2 rounded-full max-w-[60px]">
                      <div
                        className="h-1.5 rounded-full bg-teal-deep"
                        style={{ width: `${Math.min(100, Number(p.repeat_purchase_rate) * 100)}%` }}
                      />
                    </div>
                    <span className="text-ink-2 font-data text-xs">{pct(p.repeat_purchase_rate)}</span>
                  </div>
                </td>
                <td className="py-3 px-4 text-ink-2 font-data text-xs">
                  {p.avg_days_to_repurchase ? Math.round(Number(p.avg_days_to_repurchase)) + 'd' : '—'}
                </td>
                <td className="py-3 px-4">
                  <span className={`text-xs font-data ${Number(p.subscription_conversion_rate) > 0.1 ? 'text-teal-deep font-semibold' : 'text-ink-3'}`}>
                    {pct(p.subscription_conversion_rate)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {products.length === 0 && (
          <div className="text-center py-16 text-ink-3">
            <p className="text-sm">No product data yet.</p>
            <p className="text-xs mt-1">Click "Run Product Analysis" above to populate this table.</p>
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
  const seen = new Set<string>()
  const deduped = affinities.filter((a) => {
    const key = [a.product_a, a.product_b].sort().join('|||')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const { sortedData: sortedDeduped, sortColumn: afSort, sortDirection: afDir, handleSort: afHandleSort } = useSortableTable(deduped as unknown as Record<string, unknown>[], 'lift', 'desc')

  const bundles = deduped.filter((a) => a.lift >= 2 && a.co_purchase_count >= 10).slice(0, 3)

  return (
    <div className="space-y-6">
      {bundles.length > 0 && (
        <div>
          <h3 className="font-display text-sm font-semibold text-ink mb-3">Bundle Opportunities</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {bundles.map((b) => (
              <div key={`${b.product_a}+${b.product_b}`} className="bg-teal-pale border border-teal/20 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <svg className="h-4 w-4 text-teal-deep flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M3 2h10a1 1 0 011 1v1H2V3a1 1 0 011-1zM2 5h12v8a1 1 0 01-1 1H3a1 1 0 01-1-1V5zm4 3a1 1 0 000 2h4a1 1 0 000-2H6z"/>
                  </svg>
                  <span className="text-teal-deep text-[10px] font-data uppercase tracking-wider font-semibold">Bundle Idea</span>
                </div>
                <p className="text-ink text-xs font-medium leading-snug">{b.product_a}</p>
                <p className="text-ink-3 text-xs my-1">+ {b.product_b}</p>
                <div className="flex items-center gap-3 mt-3 pt-3 border-t border-teal/15">
                  <div>
                    <p className="text-[10px] text-ink-3">Lift</p>
                    <p className="text-teal-deep font-data text-sm font-bold">{b.lift.toFixed(1)}×</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-ink-3">Co-purchases</p>
                    <p className="text-ink font-data text-sm font-semibold">{b.co_purchase_count}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-ink-3">Confidence</p>
                    <p className="text-ink font-data text-sm font-semibold">{pct(b.confidence)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="font-display text-sm font-semibold text-ink mb-3">All Affinity Pairs</h3>
        <div className="overflow-x-auto rounded-2xl border border-cream-3 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-cream-3 bg-cream">
                {([['Product A', ''], ['Product B', ''], ['Co-purchases', 'co_purchase_count'], ['Co-purchase Rate', 'co_purchase_rate'], ['Confidence', 'confidence'], ['Lift', 'lift']] as [string, string][]).map(([h, field]) => (
                  <th key={h} className={`text-left py-3 px-4 text-ink-3 text-[10px] font-data uppercase tracking-widest font-normal whitespace-nowrap ${field ? thCls(field, afSort) : ''}`} onClick={field ? () => afHandleSort(field) : undefined}>
                    {h}{field && <SortIcon column={field} sortColumn={afSort} sortDirection={afDir} />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(sortedDeduped as unknown as AffinityPair[]).map((a) => (
                <tr key={`${a.product_a}|||${a.product_b}`} className="border-b border-cream-2">
                  <td className="py-3 px-4 text-ink text-xs max-w-[200px] truncate">{a.product_a}</td>
                  <td className="py-3 px-4 text-ink text-xs max-w-[200px] truncate">{a.product_b}</td>
                  <td className="py-3 px-4 text-ink-2 font-data text-xs">{a.co_purchase_count}</td>
                  <td className="py-3 px-4 text-ink-2 font-data text-xs">{(Number(a.co_purchase_rate) * 100).toFixed(1)}%</td>
                  <td className="py-3 px-4 text-ink-2 font-data text-xs">{pct(a.confidence)}</td>
                  <td className="py-3 px-4">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${liftBadge(a.lift)}`}>
                      {a.lift.toFixed(1)}×
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {deduped.length === 0 && (
            <div className="text-center py-16 text-ink-3">
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
      <p className="text-ink-3 text-xs">
        First-to-second purchase transitions within 90 days, ranked by customer lifetime value.
      </p>

      <div className="space-y-3">
        {sequences.map((s, i) => (
          <div key={`${s.first_product}→${s.second_product}`} className="bg-white border border-cream-3 rounded-2xl p-4 shadow-sm">
            <div className="flex items-start gap-4">
              <span className="text-ink-3 font-data text-base font-bold w-6 flex-shrink-0 mt-0.5">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-ink text-xs font-medium bg-cream rounded px-2 py-0.5 max-w-[200px] truncate">
                    {s.first_product}
                  </span>
                  <svg className="h-3 w-3 text-teal-deep flex-shrink-0" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M2 6h8M7 3l3 3-3 3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span className="text-teal-deep text-xs font-medium bg-teal-pale rounded px-2 py-0.5 max-w-[200px] truncate">
                    {s.second_product}
                  </span>
                </div>
                <div className="flex items-center gap-6 mt-3">
                  <div>
                    <p className="text-[10px] text-ink-3">Customers</p>
                    <p className="text-ink font-data text-sm font-semibold">{s.sequence_count}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-ink-3">Avg Days Between</p>
                    <p className="text-ink font-data text-sm font-semibold">{Math.round(Number(s.avg_days_between))}d</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-ink-3">Avg Customer LTV</p>
                    <p className="text-teal-deep font-data text-sm font-bold">{fmt(s.ltv_of_customers_in_sequence)}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}

        {sequences.length === 0 && (
          <div className="text-center py-16 text-ink-3">
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
  const subOpps = products
    .filter((p) => Number(p.repeat_purchase_rate) > 0.3 && Number(p.subscription_conversion_rate) < 0.1)
    .sort((a, b) => Number(b.repeat_purchase_rate) - Number(a.repeat_purchase_rate))

  const fastReorder = products
    .filter((p) => p.avg_days_to_repurchase && Number(p.avg_days_to_repurchase) < 45 && Number(p.unique_customers) >= 5)
    .sort((a, b) => Number(a.avg_days_to_repurchase) - Number(b.avg_days_to_repurchase))
    .slice(0, 8)

  const { sortedData: sortedFastReorder, sortColumn: rrSort, sortDirection: rrDir, handleSort: rrHandleSort } = useSortableTable(fastReorder as unknown as Record<string, unknown>[], 'avg_days_to_repurchase', 'asc')

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-baseline gap-2 mb-4">
          <h3 className="font-display text-sm font-semibold text-ink">Subscription Opportunities</h3>
          <span className="text-[10px] text-ink-3">High repeat rate, low subscription conversion</span>
        </div>

        {subOpps.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {subOpps.slice(0, 6).map((p) => {
              const gap = (Number(p.repeat_purchase_rate) - Number(p.subscription_conversion_rate)) * 100
              return (
                <div key={p.product_title} className="bg-white border border-yellow-200 rounded-2xl p-4 shadow-sm">
                  <p className="text-ink text-xs font-medium leading-tight mb-3">{p.product_title}</p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-cream rounded-lg py-2">
                      <p className="text-[10px] text-ink-3">Repeat Rate</p>
                      <p className="text-yellow-700 font-data text-sm font-bold">{pct(p.repeat_purchase_rate)}</p>
                    </div>
                    <div className="bg-cream rounded-lg py-2">
                      <p className="text-[10px] text-ink-3">Subscribe Rate</p>
                      <p className="text-ink-2 font-data text-sm">{pct(p.subscription_conversion_rate)}</p>
                    </div>
                    <div className="bg-cream rounded-lg py-2">
                      <p className="text-[10px] text-ink-3">Gap</p>
                      <p className="text-yellow-700 font-data text-sm font-bold">+{gap.toFixed(0)}pp</p>
                    </div>
                  </div>
                  {p.avg_days_to_repurchase && (
                    <p className="text-ink-3 text-[10px] mt-3">
                      Suggest every {Math.round(Number(p.avg_days_to_repurchase))} day subscription
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-ink-3 text-sm text-center py-8">No subscription opportunities identified yet.</p>
        )}
      </div>

      {fastReorder.length > 0 && (
        <div>
          <h3 className="font-display text-sm font-semibold text-ink mb-4">Fastest Reorder Cycle</h3>
          <div className="overflow-x-auto rounded-2xl border border-cream-3 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-cream-3 bg-cream">
                  {([['Product', ''], ['Avg Days to Reorder', 'avg_days_to_repurchase'], ['Repeat Rate', 'repeat_purchase_rate'], ['Subscription Conv.', 'subscription_conversion_rate'], ['Unique Buyers', 'unique_customers']] as [string, string][]).map(([h, field]) => (
                    <th key={h} className={`text-left py-3 px-4 text-ink-3 text-[10px] font-data uppercase tracking-widest font-normal whitespace-nowrap ${field ? thCls(field, rrSort) : ''}`} onClick={field ? () => rrHandleSort(field) : undefined}>
                      {h}{field && <SortIcon column={field} sortColumn={rrSort} sortDirection={rrDir} />}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(sortedFastReorder as unknown as ProductStat[]).map((p) => (
                  <tr key={p.product_title} className="border-b border-cream-2">
                    <td className="py-3 px-4 text-ink text-xs max-w-[200px]">
                      <p className="truncate">{p.product_title}</p>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-teal-deep font-data text-xs font-bold">
                        {Math.round(Number(p.avg_days_to_repurchase))}d
                      </span>
                    </td>
                    <td className="py-3 px-4 text-ink-2 font-data text-xs">{pct(p.repeat_purchase_rate)}</td>
                    <td className="py-3 px-4 text-ink-2 font-data text-xs">{pct(p.subscription_conversion_rate)}</td>
                    <td className="py-3 px-4 text-ink-2 font-data text-xs">{p.unique_customers}</td>
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
        <p className="text-ink-2 text-xs leading-relaxed max-w-xl">
          Claude analyzes your product stats, affinity pairs, purchase sequences, and subscription gaps
          to answer 6 targeted merchandising questions.
        </p>
        <button
          onClick={generate}
          disabled={loading}
          className="flex-shrink-0 px-4 py-2 bg-ink text-cream text-xs font-semibold rounded-lg hover:bg-ink/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Analyzing…' : 'Generate Insights'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-xs">
          {error}
        </div>
      )}

      {insight && (
        <div className="bg-white border border-cream-3 rounded-2xl p-6 shadow-sm">
          {insight.split('\n').map((line, i) => {
            if (!line.trim()) return <br key={i} />
            const numbered = line.match(/^(\d+)\.\s+(.*)/)
            if (numbered) {
              return (
                <div key={i} className="mb-4 flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-teal-pale text-teal-deep rounded-full flex items-center justify-center text-[10px] font-bold">
                    {numbered[1]}
                  </span>
                  <p className="text-ink-2 text-xs leading-relaxed">{numbered[2]}</p>
                </div>
              )
            }
            return <p key={i} className="text-ink-3 text-xs leading-relaxed mb-2">{line}</p>
          })}
        </div>
      )}

      {!insight && !loading && !error && (
        <div className="text-center py-16 text-ink-3">
          <svg className="h-10 w-10 mx-auto mb-3 opacity-20" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="20" cy="20" r="16" />
            <path d="M14 20c0-3.3 2.7-6 6-6s6 2.7 6 6c0 3.3-2.7 6-6 6" strokeLinecap="round"/>
            <path d="M20 28v2" strokeLinecap="round"/>
          </svg>
          <p className="text-sm">Click Generate Insights to run Claude's analysis</p>
        </div>
      )}
    </div>
  )
}

// ── Analyze Button ────────────────────────────────────────────────────────────

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
      setResult(`${data.products_analyzed} products · ${data.affinity_pairs} pairs · ${data.sequences} sequences`)
      setTimeout(() => window.location.reload(), 1500)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      {result && <span className="text-teal-deep text-xs font-medium">{result}</span>}
      {error && <span className="text-red-600 text-xs">{error}</span>}
      <button
        onClick={run}
        disabled={loading}
        className="px-4 py-2 border border-cream-3 text-ink-2 text-xs rounded-lg hover:border-ink-3 hover:text-ink disabled:opacity-50 disabled:cursor-not-allowed transition-colors bg-white shadow-sm"
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-bold text-ink">Product Intelligence</h1>
          <p className="text-ink-3 text-xs mt-1">
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
              label: 'Products',
              value: productStats.length.toLocaleString(),
              sub: 'unique SKUs analyzed',
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
            <div key={label} className="rounded-2xl border border-cream-3 bg-white p-4 shadow-sm">
              <p className="text-ink-3 text-[10px] font-data uppercase tracking-widest">{label}</p>
              <p className="text-ink font-display text-2xl font-bold mt-1">{value}</p>
              <p className="text-ink-3 text-[10px] mt-0.5">{sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div>
        <div className="flex gap-0 border-b border-cream-3 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-xs whitespace-nowrap transition-colors border-b-2 -mb-px font-medium ${
                activeTab === tab
                  ? 'border-teal-deep text-teal-deep'
                  : 'border-transparent text-ink-3 hover:text-ink-2'
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
