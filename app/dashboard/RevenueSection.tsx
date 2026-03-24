'use client'

import { useState } from 'react'

interface MonthlyData {
  month: string
  revenue: number
}

interface ChannelData {
  channel_name: string
  revenue: number
  order_count: number
  avg_order_value: number
}

interface Props {
  monthlyData: MonthlyData[]
  channelData30d: ChannelData[]
}

const CHANNEL_COLORS: Record<string, string> = {
  'Online Store':   '#4BBFAD',
  'Instagram':      '#8B5CF6',
  'Facebook':       '#3B82F6',
  'Point of Sale':  '#F59E0B',
  'Draft Orders':   '#F97316',
  'Shop App':       '#0EA5E9',
  'Other':          '#9CA3AF',
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n)
}

function MonthlyBarChart({ data }: { data: MonthlyData[] }) {
  const max = Math.max(...data.map((d) => d.revenue), 1)
  const chartH = 120
  const barW = 24
  const gap = 8
  const totalW = data.length * (barW + gap) - gap

  return (
    <div className="mt-4 overflow-x-auto pb-2">
      <svg
        width={totalW}
        height={chartH + 28}
        viewBox={`0 0 ${totalW} ${chartH + 28}`}
        className="min-w-full"
        aria-label="Monthly revenue bar chart"
      >
        {data.map((d, i) => {
          const barH = Math.max(4, (d.revenue / max) * chartH)
          const x = i * (barW + gap)
          const y = chartH - barH
          return (
            <g key={d.month}>
              <rect x={x} y={y} width={barW} height={barH} rx={4} fill="#4BBFAD" opacity={i === data.length - 1 ? 0.5 : 1} />
              <text x={x + barW / 2} y={chartH + 16} textAnchor="middle" fontSize={9} fill="#888888" fontFamily="DM Mono, monospace">
                {d.month}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function ChannelChart({ data }: { data: ChannelData[] }) {
  const sorted = [...data].sort((a, b) => b.revenue - a.revenue)
  const total = sorted.reduce((s, c) => s + c.revenue, 0)
  if (total === 0) {
    return <p className="mt-6 text-sm text-ink-3 text-center">No channel data yet — run a metrics refresh after syncing orders.</p>
  }

  return (
    <div className="mt-5 space-y-3">
      {sorted.map((ch) => {
        const pct = total > 0 ? (ch.revenue / total) * 100 : 0
        const color = CHANNEL_COLORS[ch.channel_name] ?? '#9CA3AF'
        return (
          <div key={ch.channel_name} className="flex items-center gap-3">
            <div
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: color }}
            />
            <div className="w-28 shrink-0 text-xs text-ink-2 truncate">{ch.channel_name}</div>
            <div className="flex-1 h-4 bg-cream-2 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, backgroundColor: color }}
              />
            </div>
            <div className="w-20 text-right font-data text-xs font-medium text-ink shrink-0">{fmt(ch.revenue)}</div>
            <div className="w-10 text-right font-data text-xs text-ink-3 shrink-0">{pct.toFixed(0)}%</div>
          </div>
        )
      })}

      {/* Legend summary */}
      <div className="mt-3 pt-3 border-t border-cream-2 grid grid-cols-3 gap-2">
        {sorted.slice(0, 3).map((ch) => (
          <div key={ch.channel_name} className="text-center">
            <p className="font-data text-[10px] uppercase tracking-wider text-ink-3">{ch.channel_name}</p>
            <p className="mt-0.5 font-data text-xs font-medium text-ink">{ch.order_count} orders</p>
            <p className="font-data text-[10px] text-ink-3">{fmt(ch.avg_order_value)} AOV</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function RevenueSection({ monthlyData, channelData30d }: Props) {
  const [tab, setTab] = useState<'monthly' | 'channels'>('monthly')

  return (
    <section className="rounded-2xl border border-cream-3 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="font-display text-base font-semibold text-ink">Revenue</h2>
        <div className="flex items-center gap-1 rounded-lg bg-cream p-1">
          <button
            onClick={() => setTab('monthly')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
              tab === 'monthly' ? 'bg-white shadow-sm text-ink' : 'text-ink-3 hover:text-ink'
            }`}
          >
            Monthly Trend
          </button>
          <button
            onClick={() => setTab('channels')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
              tab === 'channels' ? 'bg-white shadow-sm text-ink' : 'text-ink-3 hover:text-ink'
            }`}
          >
            By Channel
          </button>
        </div>
        <span className="font-data text-xs text-ink-3">
          {tab === 'monthly' ? 'Last 12 months' : 'Last 30 days'}
        </span>
      </div>

      {tab === 'monthly' ? (
        <MonthlyBarChart data={monthlyData} />
      ) : (
        <ChannelChart data={channelData30d} />
      )}
    </section>
  )
}
