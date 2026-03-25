'use client'

import Link from 'next/link'

export interface PlatformCard {
  id: string
  name: string
  connected: boolean
  href: string
  connectHref?: string
  metric1Label: string
  metric1Value: string
  metric2Label?: string
  metric2Value?: string
  trend?: 'up' | 'down' | 'neutral'
  trendValue?: string
  color: string       // badge background
  textColor: string   // badge text
  icon: React.ReactNode
}

function TrendArrow({ trend, value }: { trend: 'up' | 'down' | 'neutral'; value?: string }) {
  if (trend === 'up') return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-teal-deep">
      <svg className="h-2.5 w-2.5" viewBox="0 0 10 10" fill="currentColor"><path d="M5 2L9 8H1L5 2z"/></svg>
      {value}
    </span>
  )
  if (trend === 'down') return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-red-500">
      <svg className="h-2.5 w-2.5" viewBox="0 0 10 10" fill="currentColor"><path d="M5 8L1 2H9L5 8z"/></svg>
      {value}
    </span>
  )
  return null
}

function Card({ platform }: { platform: PlatformCard }) {
  if (!platform.connected) {
    return (
      <div className="flex min-w-[160px] max-w-[200px] shrink-0 flex-col gap-2 rounded-xl border border-dashed border-cream-3 bg-cream p-3.5 opacity-60">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <div className="h-5 w-5 text-ink-3">{platform.icon}</div>
            <span className="text-xs font-medium text-ink-3">{platform.name}</span>
          </div>
        </div>
        <p className="text-[10px] text-ink-3">Not connected</p>
        {platform.connectHref && (
          <Link href={platform.connectHref} className="text-[10px] font-medium text-teal-deep hover:underline">
            Connect →
          </Link>
        )}
      </div>
    )
  }

  return (
    <Link
      href={platform.href}
      className="group flex min-w-[160px] max-w-[200px] shrink-0 flex-col gap-2.5 rounded-xl border border-cream-3 bg-white p-3.5 shadow-sm hover:shadow-md hover:border-teal/30 transition-all"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <div className="h-5 w-5" style={{ color: platform.textColor }}>{platform.icon}</div>
          <span className="text-xs font-medium text-ink">{platform.name}</span>
        </div>
        <span className="h-1.5 w-1.5 rounded-full bg-teal shrink-0" title="Connected" />
      </div>
      <div>
        <p className="font-data text-[10px] uppercase tracking-wider text-ink-3">{platform.metric1Label}</p>
        <div className="flex items-baseline gap-1.5 mt-0.5">
          <p className="font-display text-base font-semibold text-ink">{platform.metric1Value}</p>
          {platform.trend && <TrendArrow trend={platform.trend} value={platform.trendValue} />}
        </div>
      </div>
      {platform.metric2Label && (
        <div>
          <p className="font-data text-[10px] uppercase tracking-wider text-ink-3">{platform.metric2Label}</p>
          <p className="font-data text-xs font-medium text-ink-2 mt-0.5">{platform.metric2Value}</p>
        </div>
      )}
    </Link>
  )
}

export default function PlatformHealthRow({ platforms }: { platforms: PlatformCard[] }) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
      {platforms.map((p) => (
        <Card key={p.id} platform={p} />
      ))}
    </div>
  )
}
