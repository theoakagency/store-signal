'use client'

import { useState } from 'react'
import { useSortableTable, SortIcon as HookSortIcon, thCls } from '@/hooks/useSortableTable'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Order {
  id: string
  order_number: string
  email: string | null
  financial_status: string | null
  fulfillment_status: string | null
  total_price: number
  processed_at: string | null
}

interface Customer {
  shopify_customer_id: number
  email: string | null
  first_name: string | null
  last_name: string | null
  orders_count: number
  total_spent: number
  segment?: string | null
}

interface ChannelData {
  channel_name: string
  revenue: number
  order_count: number
  avg_order_value: number
}

interface MonthlyData {
  month: string
  revenue: number
}

interface ShopifyInsight {
  title: string
  description: string
  action: string
  impact: 'Low' | 'Medium' | 'High'
  category: 'Revenue' | 'Retention' | 'Channel' | 'Operations'
}

interface Metrics {
  revenue30d: number
  revDelta: number | null
  orders30d: number
  ordersDelta: number | null
  aov30d: number
  aovDelta: number | null
  newCustomers30d: number
  returningRate: number
  currency: string
  refundAmount30d: number
  refundRate: number
}

interface Props {
  metrics: Metrics
  orders: Order[]
  customers: Customer[]
  channels: ChannelData[]
  chartData: MonthlyData[]
  cachedInsights: ShopifyInsight[] | null
  insightsCalculatedAt: string | null
  storeName: string
  storeDomain: string | null
  lastSyncedAt: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(d))
}

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 2) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function DeltaBadge({ d }: { d: number | null }) {
  if (d === null) return null
  const isPos = d >= 0
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${isPos ? 'text-teal-deep' : 'text-red-500'}`}>
      <svg className="h-3 w-3" viewBox="0 0 12 12" fill="currentColor">
        {isPos ? <path d="M6 2l4 6H2l4-6z" /> : <path d="M6 10L2 4h8l-4 6z" />}
      </svg>
      {Math.abs(d).toFixed(1)}%
    </span>
  )
}

function StatusBadge({ status, type }: { status: string | null; type: 'payment' | 'fulfillment' }) {
  if (!status) return <span className="text-xs text-ink-3">—</span>
  const paymentMap: Record<string, string> = {
    paid: 'bg-teal-pale text-teal-deep',
    pending: 'bg-yellow-50 text-yellow-700',
    refunded: 'bg-red-50 text-red-700',
    voided: 'bg-cream-2 text-ink-3',
    partially_refunded: 'bg-orange-50 text-orange-700',
  }
  const fulfillmentMap: Record<string, string> = {
    fulfilled: 'bg-blue-50 text-blue-700',
    unfulfilled: 'bg-cream-2 text-ink-3',
    partial: 'bg-orange-50 text-orange-700',
    restocked: 'bg-cream-2 text-ink-3',
  }
  const map = type === 'payment' ? paymentMap : fulfillmentMap
  const cls = map[status] ?? 'bg-cream-2 text-ink-3'
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

// ── Order Value Distribution ──────────────────────────────────────────────────

const ORDER_BUCKETS = [
  { label: '<$25',    min: 0,   max: 25  },
  { label: '$25–50',  min: 25,  max: 50  },
  { label: '$50–100', min: 50,  max: 100 },
  { label: '$100–200',min: 100, max: 200 },
  { label: '$200–500',min: 200, max: 500 },
  { label: '$500+',   min: 500, max: Infinity },
]

function OrderDistribution({ orders }: { orders: Order[] }) {
  const paid = orders.filter((o) => o.financial_status === 'paid')
  if (paid.length === 0) return null

  const buckets = ORDER_BUCKETS.map((b) => ({
    ...b,
    count: paid.filter((o) => Number(o.total_price) >= b.min && Number(o.total_price) < b.max).length,
  }))
  const maxCount = Math.max(...buckets.map((b) => b.count), 1)

  return (
    <section className="rounded-2xl border border-cream-3 bg-white p-5 shadow-sm">
      <h2 className="font-display text-sm font-semibold text-ink">Order Value Distribution</h2>
      <p className="text-[10px] text-ink-3 mt-0.5">Last {paid.length} paid orders</p>
      <div className="mt-4 flex items-end gap-2 h-24">
        {buckets.map((b) => {
          const pct = maxCount > 0 ? (b.count / maxCount) * 100 : 0
          return (
            <div key={b.label} className="flex-1 flex flex-col items-center gap-1">
              <span className="font-data text-[10px] text-ink-2 font-medium">{b.count > 0 ? b.count : ''}</span>
              <div className="w-full rounded-t" style={{ height: `${Math.max(pct, b.count > 0 ? 4 : 0)}%`, backgroundColor: b.count > 0 ? '#4BBFAD' : '#E8E6E1' }} />
            </div>
          )
        })}
      </div>
      <div className="flex gap-2 mt-1">
        {buckets.map((b) => (
          <div key={b.label} className="flex-1 text-center font-data text-[9px] text-ink-3">{b.label}</div>
        ))}
      </div>
    </section>
  )
}

// ── Bar Chart ─────────────────────────────────────────────────────────────────

function MonthlyBarChart({ data }: { data: MonthlyData[] }) {
  const max = Math.max(...data.map((d) => d.revenue), 1)
  const chartH = 100
  const barW = 24
  const gap = 6
  const totalW = data.length * (barW + gap) - gap
  const hasData = data.some((d) => d.revenue > 0)

  function monthLabel(m: string) {
    if (/^\d{4}-\d{2}$/.test(m)) return new Date(m + '-15').toLocaleString('en-US', { month: 'short' })
    return m
  }

  if (!hasData) return <p className="mt-4 text-sm text-center text-ink-3">No revenue data cached — run a metrics refresh.</p>

  return (
    <div className="mt-4 overflow-x-auto pb-2">
      <svg width={totalW} height={chartH + 24} viewBox={`0 0 ${totalW} ${chartH + 24}`} className="min-w-full">
        {data.map((d, i) => {
          const barH = d.revenue > 0 ? Math.max(4, (d.revenue / max) * chartH) : 2
          const x = i * (barW + gap)
          const y = chartH - barH
          return (
            <g key={d.month}>
              <rect x={x} y={y} width={barW} height={barH} rx={4} fill={d.revenue > 0 ? '#4BBFAD' : '#E8E6E1'} opacity={i === data.length - 1 ? 0.55 : 1} />
              <text x={x + barW / 2} y={chartH + 16} textAnchor="middle" fontSize={9} fill="#888" fontFamily="DM Mono, monospace">{monthLabel(d.month)}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ── AI Insights ───────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  Revenue:    'bg-teal-pale text-teal-deep',
  Retention:  'bg-blue-50 text-blue-700',
  Channel:    'bg-purple-50 text-purple-700',
  Operations: 'bg-orange-50 text-orange-700',
}
const IMPACT_COLORS: Record<string, string> = {
  High:   'bg-teal-pale text-teal-deep',
  Medium: 'bg-yellow-50 text-yellow-700',
  Low:    'bg-cream-2 text-ink-3',
}

function AiInsightsSection({ cachedInsights, calculatedAt }: { cachedInsights: ShopifyInsight[] | null; calculatedAt: string | null }) {
  const [insights, setInsights] = useState<ShopifyInsight[]>(cachedInsights ?? [])
  const [ts, setTs] = useState(calculatedAt)
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [errMsg, setErrMsg] = useState('')

  async function generate() {
    setState('loading')
    setErrMsg('')
    try {
      const res = await fetch('/api/insights/shopify', { method: 'POST' })
      const data = await res.json() as { insights?: ShopifyInsight[]; calculated_at?: string; error?: string }
      if (data.error) { setState('error'); setErrMsg(data.error); return }
      setInsights(data.insights ?? [])
      setTs(data.calculated_at ?? null)
      setState('idle')
    } catch {
      setState('error')
      setErrMsg('Network error — try again')
    }
  }

  return (
    <section className="rounded-2xl border border-cream-3 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-base font-semibold text-ink">AI Shopify Intelligence</h2>
            <span className="inline-flex items-center rounded-full bg-[#96BF48]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#4a6b1a]">Shopify</span>
          </div>
          <p className="text-xs text-ink-3 mt-0.5">{ts ? `Last analyzed ${timeAgo(ts)}` : 'Not yet generated'} · Revenue trends, retention, channel performance</p>
        </div>
        <button onClick={generate} disabled={state === 'loading'} className="inline-flex items-center gap-1.5 rounded-lg border border-cream-3 bg-cream px-3 py-1.5 text-xs font-medium text-ink-2 hover:bg-cream-2 disabled:opacity-50 transition">
          {state === 'loading' ? <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-cream-3 border-t-teal" /> : <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11 6A5 5 0 1 1 6 1" strokeLinecap="round"/><path d="M11 1v3H8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
          {state === 'loading' ? 'Analyzing…' : insights.length ? 'Refresh' : 'Generate Insights'}
        </button>
      </div>

      {state === 'error' && <div className="mt-4 rounded-lg bg-red-50 border border-red-100 px-4 py-3 text-xs text-red-700">{errMsg}</div>}

      {state === 'loading' && insights.length === 0 && (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[1,2,3,4].map((i) => <div key={i} className="rounded-xl border border-cream-2 bg-cream p-4 animate-pulse"><div className="h-3 w-20 bg-cream-3 rounded mb-2"/><div className="h-4 w-full bg-cream-3 rounded mb-1.5"/><div className="h-3 w-2/3 bg-cream-3 rounded"/></div>)}
        </div>
      )}

      {insights.length > 0 && (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {insights.map((ins, i) => (
            <div key={i} className="rounded-xl border border-cream-2 bg-white p-4">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${CATEGORY_COLORS[ins.category] ?? 'bg-cream-2 text-ink-3'}`}>{ins.category}</span>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${IMPACT_COLORS[ins.impact]}`}>{ins.impact} impact</span>
              </div>
              <h3 className="mt-2 text-sm font-semibold text-ink">{ins.title}</h3>
              <p className="mt-1 text-xs text-ink-2 leading-relaxed">{ins.description}</p>
              <div className="mt-2 flex items-start gap-1.5">
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal" />
                <p className="text-xs text-teal-deep font-medium leading-relaxed">{ins.action}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {!insights.length && state !== 'loading' && (
        <div className="mt-4 rounded-xl border border-dashed border-cream-3 bg-cream px-6 py-8 text-center">
          <p className="text-sm text-ink-2 font-medium">No Shopify insights yet</p>
          <p className="mt-1 text-xs text-ink-3">Click Generate Insights to analyze your store data with AI.</p>
        </div>
      )}
    </section>
  )
}

// ── Sync Button ───────────────────────────────────────────────────────────────

function SyncButton() {
  const [syncing, setSyncing] = useState(false)
  const [done, setDone] = useState(false)

  async function sync() {
    setSyncing(true)
    try {
      await fetch('/api/shopify/sync', { method: 'POST' })
      setDone(true)
      setTimeout(() => window.location.reload(), 1500)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <button onClick={sync} disabled={syncing} className="inline-flex items-center gap-1.5 rounded-lg border border-cream-3 bg-cream px-3 py-1.5 text-xs font-medium text-ink-2 hover:bg-cream-2 disabled:opacity-50 transition">
      {syncing ? <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-cream-3 border-t-teal" /> : <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11 6A5 5 0 1 1 6 1" strokeLinecap="round"/><path d="M11 1v3H8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
      {syncing ? 'Syncing…' : done ? 'Done!' : 'Sync Now'}
    </button>
  )
}

// ── Channel Bar Chart ─────────────────────────────────────────────────────────

const CHANNEL_COLORS: Record<string, string> = {
  'Online Store': '#4BBFAD',
  'Instagram': '#8B5CF6',
  'Facebook': '#3B82F6',
  'Point of Sale': '#F59E0B',
  'Draft Orders': '#F97316',
  'Shop App': '#0EA5E9',
  'Other': '#9CA3AF',
}

function ChannelBreakdown({ channels }: { channels: ChannelData[] }) {
  const sorted = [...channels].sort((a, b) => b.revenue - a.revenue)
  const total = sorted.reduce((s, c) => s + c.revenue, 0)

  if (total === 0) return <p className="text-sm text-ink-3 text-center py-4">No channel data — run a metrics refresh.</p>

  return (
    <div className="space-y-3 mt-4">
      {sorted.map((ch) => {
        const pct = total > 0 ? (ch.revenue / total) * 100 : 0
        const color = CHANNEL_COLORS[ch.channel_name] ?? '#9CA3AF'
        return (
          <div key={ch.channel_name} className="flex items-center gap-3">
            <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
            <div className="w-32 shrink-0 text-xs text-ink-2 truncate">{ch.channel_name}</div>
            <div className="flex-1 h-3 bg-cream-2 rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
            </div>
            <div className="w-20 text-right font-data text-xs font-medium text-ink shrink-0">{fmt(ch.revenue)}</div>
            <div className="w-10 text-right font-data text-xs text-ink-3 shrink-0">{pct.toFixed(0)}%</div>
          </div>
        )
      })}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ShopifyDashboard({
  metrics, orders, customers, channels, chartData,
  cachedInsights, insightsCalculatedAt,
  storeName, storeDomain, lastSyncedAt,
}: Props) {
  const [ordersPage, setOrdersPage] = useState(0)
  const [customersPage, setCustomersPage] = useState(0)
  const [orderSearch, setOrderSearch] = useState('')
  const PAGE = 20

  const { sortedData: sortedOrders, sortColumn: orderSort, sortDirection: orderDir, handleSort: orderHandleSort } =
    useSortableTable(orders as unknown as Record<string, unknown>[], 'processed_at', 'desc')
  const { sortedData: sortedCustomers, sortColumn: custSort, sortDirection: custDir, handleSort: custHandleSort } =
    useSortableTable(customers as unknown as Record<string, unknown>[], 'total_spent', 'desc')

  const filteredOrders = (sortedOrders as unknown as Order[]).filter(
    (o) => !orderSearch || [o.order_number, o.email, o.financial_status, o.fulfillment_status]
      .some((v) => v?.toLowerCase().includes(orderSearch.toLowerCase()))
  )

  const pagedOrders = filteredOrders.slice(ordersPage * PAGE, (ordersPage + 1) * PAGE)
  const pagedCustomers = (sortedCustomers as unknown as Customer[]).slice(customersPage * PAGE, (customersPage + 1) * PAGE)
  const totalOrderPages = Math.ceil(filteredOrders.length / PAGE)
  const totalCustPages  = Math.ceil(customers.length / PAGE)

  function exportCSV(data: Record<string, unknown>[], filename: string) {
    if (!data.length) return
    const cols = Object.keys(data[0])
    const rows = [cols.join(','), ...data.map((row) => cols.map((c) => JSON.stringify(row[c] ?? '')).join(','))]
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename
    a.click()
  }

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-xl font-semibold text-ink">{storeName}</h1>
            <span className="inline-flex items-center gap-1 rounded-full bg-teal-pale px-2 py-0.5 text-[10px] font-semibold text-teal-deep">
              <span className="h-1.5 w-1.5 rounded-full bg-teal animate-pulse" />
              Live
            </span>
          </div>
          {storeDomain && (
            <a href={`https://${storeDomain}`} target="_blank" rel="noopener noreferrer" className="text-xs text-teal-deep hover:underline mt-0.5 inline-flex items-center gap-1">
              {storeDomain}
              <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7 1h4v4M11 1 5 7M3 2H1v9h9V9" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </a>
          )}
          <p className="text-[10px] text-ink-3 mt-1">{lastSyncedAt ? `Last synced ${timeAgo(lastSyncedAt)}` : 'Never synced'}</p>
        </div>
        <SyncButton />
      </div>

      {/* AI Insights (TOP) */}
      <AiInsightsSection cachedInsights={cachedInsights} calculatedAt={insightsCalculatedAt} />

      {/* Metrics Row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[
          { label: 'Revenue (30d)', value: fmt(metrics.revenue30d, metrics.currency), delta: metrics.revDelta, sub: 'vs prior 30d' },
          { label: 'Orders (30d)',  value: metrics.orders30d.toLocaleString(), delta: metrics.ordersDelta, sub: 'vs prior 30d' },
          { label: 'AOV (30d)',     value: fmt(metrics.aov30d, metrics.currency), delta: metrics.aovDelta, sub: 'vs prior 30d' },
          { label: 'New Customers', value: metrics.newCustomers30d.toLocaleString(), delta: null, sub: 'last 30 days' },
          { label: 'Returning Rate', value: `${(metrics.returningRate * 100).toFixed(1)}%`, delta: null, sub: 'of 30d orders' },
        ].map((m) => (
          <div key={m.label} className="rounded-2xl border border-cream-3 bg-white px-4 py-4 shadow-sm">
            <p className="font-data text-xs uppercase tracking-wider text-ink-3">{m.label}</p>
            <p className="mt-1.5 font-display text-xl font-semibold text-ink">{m.value}</p>
            <div className="mt-1 flex items-center gap-1.5">
              <DeltaBadge d={m.delta} />
              <span className="text-[10px] text-ink-3">{m.sub}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Revenue Chart + Channel Breakdown */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-cream-3 bg-white p-5 shadow-sm">
          <h2 className="font-display text-sm font-semibold text-ink">Revenue Trend</h2>
          <p className="text-[10px] text-ink-3 mt-0.5">Last 12 months</p>
          <MonthlyBarChart data={chartData} />
        </section>
        <section className="rounded-2xl border border-cream-3 bg-white p-5 shadow-sm">
          <h2 className="font-display text-sm font-semibold text-ink">Sales Channel Breakdown</h2>
          <p className="text-[10px] text-ink-3 mt-0.5">Last 30 days revenue by channel</p>
          <ChannelBreakdown channels={channels} />
        </section>
      </div>

      {/* Order Value Distribution */}
      <OrderDistribution orders={orders} />

      {/* Refunds */}
      {metrics.refundAmount30d > 0 && (
        <section className="rounded-2xl border border-cream-3 bg-white p-5 shadow-sm">
          <h2 className="font-display text-sm font-semibold text-ink mb-3">Refunds & Returns (30d)</h2>
          <div className="flex gap-6">
            <div>
              <p className="font-data text-xs uppercase tracking-wider text-ink-3">Total Refunded</p>
              <p className="mt-1 font-display text-xl font-semibold text-red-600">{fmt(metrics.refundAmount30d, metrics.currency)}</p>
            </div>
            <div>
              <p className="font-data text-xs uppercase tracking-wider text-ink-3">Refund Rate</p>
              <p className="mt-1 font-display text-xl font-semibold text-ink">{(metrics.refundRate * 100).toFixed(1)}%</p>
              <p className="text-[10px] text-ink-3">of revenue</p>
            </div>
          </div>
        </section>
      )}

      {/* Top Customers */}
      <section className="rounded-2xl border border-cream-3 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-cream-2 px-5 py-3.5">
          <h2 className="font-display text-sm font-semibold text-ink">Top Customers</h2>
          <div className="flex items-center gap-2">
            <span className="font-data text-xs text-ink-3">by lifetime value</span>
            <button onClick={() => exportCSV(customers.map((c, i) => ({ rank: i + 1, email: c.email, orders: c.orders_count, ltv: c.total_spent })), `customers_${new Date().toISOString().slice(0,10)}.csv`)} className="inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium text-ink-3 hover:bg-cream-2 transition">
              <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 1v7M3 5l3 3 3-3M1 9v1a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V9" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Export CSV
            </button>
          </div>
        </div>
        {customers.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-ink-3">No customer data — sync Shopify to import customers.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-cream-2 text-xs font-medium text-ink-3">
                    <th className="px-5 py-2.5 text-left w-8">#</th>
                    <th className={`px-5 py-2.5 text-left ${thCls('email', custSort)}`} onClick={() => custHandleSort('email')}>Email <HookSortIcon column="email" sortColumn={custSort} sortDirection={custDir} /></th>
                    <th className={`px-5 py-2.5 text-right ${thCls('orders_count', custSort)}`} onClick={() => custHandleSort('orders_count')}>Orders <HookSortIcon column="orders_count" sortColumn={custSort} sortDirection={custDir} /></th>
                    <th className={`px-5 py-2.5 text-right ${thCls('total_spent', custSort)}`} onClick={() => custHandleSort('total_spent')}>Lifetime Value <HookSortIcon column="total_spent" sortColumn={custSort} sortDirection={custDir} /></th>
                    <th className="px-5 py-2.5 text-right">AOV</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cream-2">
                  {pagedCustomers.map((c, i) => (
                    <tr key={c.shopify_customer_id} className="hover:bg-cream transition-colors">
                      <td className="px-5 py-2.5 font-data text-xs text-ink-3">{customersPage * PAGE + i + 1}</td>
                      <td className="px-5 py-2.5 text-xs text-ink max-w-xs truncate">
                        <div>
                          <span className="font-medium">{c.first_name || c.last_name ? `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() : c.email ?? 'Guest'}</span>
                          {(c.first_name || c.last_name) && c.email && <span className="block text-[10px] text-ink-3">{c.email}</span>}
                        </div>
                      </td>
                      <td className="px-5 py-2.5 text-right font-data text-xs text-ink">{c.orders_count}</td>
                      <td className="px-5 py-2.5 text-right font-data text-sm font-semibold text-ink">{fmt(c.total_spent)}</td>
                      <td className="px-5 py-2.5 text-right font-data text-xs text-ink-2">{c.orders_count > 0 ? fmt(c.total_spent / c.orders_count) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalCustPages > 1 && (
              <div className="flex items-center justify-between border-t border-cream-2 px-5 py-3">
                <span className="text-xs text-ink-3">Showing {customersPage * PAGE + 1}–{Math.min((customersPage + 1) * PAGE, customers.length)} of {customers.length}</span>
                <div className="flex gap-1">
                  <button disabled={customersPage === 0} onClick={() => setCustomersPage(p => p - 1)} className="rounded px-2 py-1 text-xs text-ink-2 hover:bg-cream-2 disabled:opacity-40 transition">← Prev</button>
                  <button disabled={customersPage >= totalCustPages - 1} onClick={() => setCustomersPage(p => p + 1)} className="rounded px-2 py-1 text-xs text-ink-2 hover:bg-cream-2 disabled:opacity-40 transition">Next →</button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* Recent Orders */}
      <section className="rounded-2xl border border-cream-3 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-cream-2 px-5 py-3.5 flex-wrap gap-2">
          <h2 className="font-display text-sm font-semibold text-ink">Recent Orders</h2>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Search orders…"
              value={orderSearch}
              onChange={(e) => { setOrderSearch(e.target.value); setOrdersPage(0) }}
              className="rounded-lg border border-cream-3 bg-cream px-2.5 py-1 text-xs text-ink placeholder:text-ink-3 focus:outline-none focus:ring-1 focus:ring-teal/40"
            />
            <button onClick={() => exportCSV(filteredOrders.map((o) => ({ order: o.order_number, date: o.processed_at, email: o.email, payment: o.financial_status, fulfillment: o.fulfillment_status, total: o.total_price })), `orders_${new Date().toISOString().slice(0,10)}.csv`)} className="inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium text-ink-3 hover:bg-cream-2 transition">
              <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 1v7M3 5l3 3 3-3M1 9v1a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V9" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Export CSV
            </button>
          </div>
        </div>
        {orderSearch && <div className="px-5 py-2 text-[10px] text-ink-3 border-b border-cream-2">Showing {filteredOrders.length} of {orders.length} results</div>}
        {orders.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-ink-3">No orders yet — sync Shopify to import order history.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-cream-2 bg-cream/50 text-xs font-medium text-ink-3">
                    {([['order_number','Order #'], ['processed_at','Date'], ['email','Customer'], ['financial_status','Payment'], ['fulfillment_status','Fulfillment'], ['total_price','Total']] as [string, string][]).map(([field, label]) => (
                      <th key={field} className={`px-5 py-2.5 text-left cursor-pointer select-none ${thCls(field, orderSort)} ${field === 'total_price' ? 'text-right' : ''}`} onClick={() => orderHandleSort(field)}>
                        <span className="flex items-center gap-1 justify-between">
                          {label}
                          <HookSortIcon column={field} sortColumn={orderSort} sortDirection={orderDir} />
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-cream-2">
                  {pagedOrders.map((order) => (
                    <tr key={order.id} className="hover:bg-cream transition-colors">
                      <td className="px-5 py-2.5 font-data font-medium text-ink text-xs">{order.order_number}</td>
                      <td className="px-5 py-2.5 text-xs text-ink-2 whitespace-nowrap">{fmtDate(order.processed_at)}</td>
                      <td className="px-5 py-2.5 text-xs text-ink-2 max-w-[180px] truncate">{order.email ?? '—'}</td>
                      <td className="px-5 py-2.5"><StatusBadge status={order.financial_status} type="payment" /></td>
                      <td className="px-5 py-2.5"><StatusBadge status={order.fulfillment_status} type="fulfillment" /></td>
                      <td className="px-5 py-2.5 text-right font-data text-xs font-medium text-ink">{fmt(order.total_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalOrderPages > 1 && (
              <div className="flex items-center justify-between border-t border-cream-2 px-5 py-3">
                <span className="text-xs text-ink-3">Showing {ordersPage * PAGE + 1}–{Math.min((ordersPage + 1) * PAGE, filteredOrders.length)} of {filteredOrders.length}</span>
                <div className="flex gap-1">
                  <button disabled={ordersPage === 0} onClick={() => setOrdersPage(p => p - 1)} className="rounded px-2 py-1 text-xs text-ink-2 hover:bg-cream-2 disabled:opacity-40 transition">← Prev</button>
                  <button disabled={ordersPage >= totalOrderPages - 1} onClick={() => setOrdersPage(p => p + 1)} className="rounded px-2 py-1 text-xs text-ink-2 hover:bg-cream-2 disabled:opacity-40 transition">Next →</button>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}
