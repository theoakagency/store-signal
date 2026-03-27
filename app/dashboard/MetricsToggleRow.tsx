'use client'

import { useState } from 'react'

interface PeriodData {
  revenue: number
  orders: number
  aov: number
  revDelta: number | null
  orderDelta: number | null
  aovDelta: number | null
}

interface Props {
  data30d: PeriodData
  data7d: PeriodData
  currency: string
  totalCustomers: number | null
  mrr: number | null
}

function fmt(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount)
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

function MetricCard({ label, value, delta, sub, noAnimation }: {
  label: string; value: string; delta: number | null; sub: string; noAnimation?: boolean
}) {
  return (
    <div className="rounded-2xl border border-cream-3 bg-white px-5 py-5 shadow-sm">
      <p className="font-data text-xs uppercase tracking-wider text-ink-3">{label}</p>
      <p className={`mt-2 font-display text-2xl font-semibold text-ink ${noAnimation ? '' : 'animate-count-up'}`}>
        {value}
      </p>
      <div className="mt-1.5 flex items-center gap-1.5">
        <DeltaBadge d={delta} />
        <span className="text-xs text-ink-3">{sub}</span>
      </div>
    </div>
  )
}

export default function MetricsToggleRow({ data30d, data7d, currency, totalCustomers, mrr }: Props) {
  const [period, setPeriod] = useState<'30d' | '7d'>('30d')
  const d = period === '7d' ? data7d : data30d
  const label = period === '7d' ? '7 days' : '30 days'

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-data uppercase tracking-wider text-ink-3">Key Metrics</p>
        <div className="flex items-center rounded-lg border border-cream-3 bg-white p-0.5 shadow-sm">
          {(['7d', '30d'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                period === p ? 'bg-charcoal text-cream shadow-sm' : 'text-ink-3 hover:text-ink-2'
              }`}
            >
              {p === '7d' ? 'Last 7 days' : 'Last 30 days'}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MetricCard label={`Revenue (${label})`} value={fmt(d.revenue, currency)} delta={d.revDelta} sub={`vs prior ${label} · Shopify`} />
        <MetricCard label={`Orders (${label})`} value={d.orders.toLocaleString()} delta={d.orderDelta} sub={`vs prior ${label} · Shopify`} />
        <MetricCard label="Total Customers" value={totalCustomers !== null ? totalCustomers.toLocaleString() : '—'} delta={null} sub="all-time unique buyers · 24mo history" noAnimation />
        <MetricCard label={mrr !== null ? 'MRR' : `AOV (${label})`} value={mrr !== null ? fmt(mrr) : fmt(d.aov, currency)} delta={mrr !== null ? null : d.aovDelta} sub={mrr !== null ? 'current active subscriptions · Recharge' : `per order · ${label}`} />
      </div>
    </div>
  )
}
