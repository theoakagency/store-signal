'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSortableTable, SortIcon, thCls } from '@/hooks/useSortableTable'

interface Campaign {
  id: string
  name: string
  status: string
  objective: string
  spend: number
  impressions: number
  clicks: number
  ctr: number
  cpc: number
  purchases: number
  purchase_value: number
  roas: number
  date_start: string | null
  date_stop: string | null
}

interface Props {
  connected: boolean
  campaigns: Campaign[]
  metrics: Record<string, number>
}

interface AiInsights {
  paused_analysis: string
  budget_reallocation: string
  funnel_analysis: string
}

function fmt(n: number, currency = true) {
  if (currency) return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n)
}

function RoasBadge({ roas }: { roas: number }) {
  if (roas >= 2) return <span className="inline-flex items-center rounded-full bg-teal-pale px-2 py-0.5 text-xs font-medium text-teal-deep">Good</span>
  if (roas >= 1) return <span className="inline-flex items-center rounded-full bg-yellow-50 px-2 py-0.5 text-xs font-medium text-yellow-700">Marginal</span>
  return <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">Negative</span>
}

function MetricCard({ label, value, sub, note, alert }: { label: string; value: string; sub?: string; note?: string; alert?: boolean }) {
  return (
    <div className={`rounded-2xl border px-5 py-5 shadow-sm ${alert ? 'border-red-200 bg-red-50' : 'border-cream-3 bg-white'}`}>
      <p className="font-data text-xs uppercase tracking-wider text-ink-3">{label}</p>
      <p className={`mt-2 font-display text-3xl font-semibold ${alert ? 'text-red-600' : 'text-ink'}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-ink-3">{sub}</p>}
      {note && <p className="mt-1.5 text-[10px] text-amber-600 font-medium">{note}</p>}
    </div>
  )
}

function SmallStatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-cream-2 bg-cream px-4 py-3">
      <p className="font-data text-[10px] uppercase tracking-wider text-ink-3">{label}</p>
      <p className="mt-1 font-data text-sm font-semibold text-ink">{value}</p>
      {sub && <p className="text-[10px] text-ink-3 mt-0.5 truncate" title={sub}>{sub}</p>}
    </div>
  )
}

function ConnectPrompt() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="mb-4 h-12 w-12 rounded-xl bg-[#1877F2] flex items-center justify-center">
        <svg className="h-7 w-7 text-white" viewBox="0 0 24 24" fill="currentColor">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
        </svg>
      </div>
      <h2 className="font-display text-lg font-semibold text-ink">Connect Meta Ads</h2>
      <p className="mt-2 max-w-sm text-sm text-ink-3">
        Link your Facebook/Instagram ad account to track spend, ROAS, and campaign performance.
      </p>
      <Link href="/dashboard/integrations" className="mt-5 inline-flex items-center rounded-lg bg-[#1877F2] px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition">
        Connect in Integrations →
      </Link>
    </div>
  )
}

function RoasBarChart({ campaigns }: { campaigns: Campaign[] }) {
  const top = [...campaigns].filter((c) => c.spend > 0).sort((a, b) => b.roas - a.roas).slice(0, 8)
  if (top.length === 0) return null
  const max = Math.max(...top.map((c) => c.roas), 1)

  return (
    <div className="mt-4 space-y-3">
      {top.map((c) => {
        const pct = (c.roas / max) * 100
        const color = c.roas >= 2 ? '#4BBFAD' : c.roas >= 1 ? '#F59E0B' : '#EF4444'
        return (
          <div key={c.id} className="flex items-center gap-3">
            <div className="w-40 shrink-0">
              <p className="text-xs text-ink-2 truncate leading-tight" title={c.name}>{c.name}</p>
              <p className="text-[10px] text-ink-3 mt-0.5 font-data">{fmt(c.spend)} · {c.status === 'PAUSED' ? <span className="text-amber-500">paused</span> : <span className="text-teal-deep">active</span>}</p>
            </div>
            <div className="flex-1 h-4 bg-cream-2 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
            </div>
            <div className="w-14 text-right font-data text-xs font-medium text-ink shrink-0">{fmt(c.roas, false)}×</div>
          </div>
        )
      })}
    </div>
  )
}

function AiInsightsPanel() {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [insights, setInsights] = useState<AiInsights | null>(null)
  const [errMsg, setErrMsg] = useState('')

  async function generate() {
    setState('loading')
    setErrMsg('')
    try {
      const res = await fetch('/api/meta/insights', { method: 'POST' })
      const data = await res.json() as AiInsights & { error?: string }
      if (data.error) { setState('error'); setErrMsg(data.error); return }
      setInsights(data)
      setState('done')
    } catch {
      setState('error')
      setErrMsg('Network error — try again')
    }
  }

  const sections: { key: keyof AiInsights; label: string; icon: string }[] = [
    { key: 'paused_analysis',    label: 'Why Are High-ROAS Campaigns Paused?', icon: '⏸' },
    { key: 'budget_reallocation', label: 'Budget Reallocation Impact',          icon: '↗' },
    { key: 'funnel_analysis',    label: 'Funnel Structure Assessment',           icon: '◎' },
  ]

  return (
    <section className="rounded-2xl border border-cream-3 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-display text-base font-semibold text-ink">AI Campaign Analysis</h2>
          <p className="text-xs text-ink-3 mt-0.5">Claude analyzes your paused campaigns, budget allocation, and funnel structure</p>
        </div>
        <button
          onClick={generate}
          disabled={state === 'loading'}
          className="inline-flex items-center gap-1.5 rounded-lg bg-charcoal px-3 py-2 text-xs font-semibold text-cream hover:bg-charcoal/90 disabled:opacity-50 transition"
        >
          {state === 'loading' ? (
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-cream/30 border-t-cream" />
          ) : (
            <svg className="h-3 w-3" viewBox="0 0 12 12" fill="currentColor">
              <path d="M6 1l1.2 3.8H11l-3 2.2 1.2 3.8L6 8.5l-3.2 2.3L4 7 1 4.8h3.8L6 1z"/>
            </svg>
          )}
          {state === 'loading' ? 'Analyzing…' : state === 'done' ? 'Regenerate' : 'Analyze Campaigns'}
        </button>
      </div>

      {state === 'error' && (
        <div className="mt-4 rounded-lg bg-red-50 border border-red-100 px-4 py-3 text-xs text-red-700">{errMsg}</div>
      )}

      {state === 'loading' && (
        <div className="mt-5 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-cream-2 bg-cream p-4 animate-pulse">
              <div className="h-3 w-40 bg-cream-3 rounded mb-2" />
              <div className="h-3 w-full bg-cream-3 rounded mb-1" />
              <div className="h-3 w-4/5 bg-cream-3 rounded" />
            </div>
          ))}
        </div>
      )}

      {state === 'done' && insights && (
        <div className="mt-5 space-y-3">
          {sections.map(({ key, label, icon }) => (
            <div key={key} className="rounded-xl border border-cream-2 bg-cream px-5 py-4">
              <p className="text-xs font-semibold text-ink flex items-center gap-1.5">
                <span className="text-sm">{icon}</span>
                {label}
              </p>
              <p className="mt-2 text-xs text-ink-2 leading-relaxed">{insights[key]}</p>
            </div>
          ))}
        </div>
      )}

      {state === 'idle' && (
        <div className="mt-4 rounded-xl border border-dashed border-cream-3 bg-cream px-5 py-6 text-center">
          <p className="text-sm text-ink-3">Click &quot;Analyze Campaigns&quot; to get insights on paused campaigns, budget reallocation, and funnel gaps.</p>
        </div>
      )}
    </section>
  )
}

export default function MetaDashboard({ connected, campaigns, metrics }: Props) {
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const { sortedData: sortedCampaigns, sortColumn, sortDirection, handleSort } = useSortableTable(
    campaigns as unknown as Record<string, unknown>[],
    'spend',
    'desc',
  )

  if (!connected) return <ConnectPrompt />

  // ── Compute 90d metrics directly from campaign data ──────────────────────
  const totalSpend90   = campaigns.reduce((s, c) => s + c.spend, 0)
  const totalPurchases90 = campaigns.reduce((s, c) => s + c.purchases, 0)
  const totalPurchaseValue90 = campaigns.reduce((s, c) => s + c.purchase_value, 0)
  const roas90  = totalSpend90 > 0 ? totalPurchaseValue90 / totalSpend90 : 0
  const cpp90   = totalPurchases90 > 0 ? totalSpend90 / totalPurchases90 : 0

  const noRecentSpend = (metrics['total_ad_spend_30d'] ?? 0) === 0 && totalSpend90 > 0

  const activeCampaigns = campaigns.filter((c) => c.status === 'ACTIVE')
  const pausedCampaigns = campaigns.filter((c) => c.status === 'PAUSED' && c.spend > 0)
  const bestRoas = [...campaigns].filter((c) => c.spend > 0).sort((a, b) => b.roas - a.roas)[0]

  const belowOne = campaigns.filter((c) => c.spend > 0 && c.roas < 1)

  async function handleSync() {
    setSyncing(true)
    setSyncMsg('')
    try {
      const res = await fetch('/api/meta/sync', { method: 'POST' })
      const data = await res.json() as { synced?: number; error?: string }
      setSyncMsg(data.error ? `Error: ${data.error}` : `Synced ${data.synced ?? 0} campaigns`)
      if (!data.error) window.location.reload()
    } catch {
      setSyncMsg('Network error')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Meta Ads</h1>
          <p className="text-sm text-ink-3 mt-0.5">Facebook &amp; Instagram advertising — last 90 days</p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="inline-flex items-center gap-2 rounded-lg border border-cream-3 bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-cream disabled:opacity-50 transition"
        >
          {syncing ? (
            <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-cream-3 border-t-teal" />
          ) : (
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M14 8A6 6 0 1 1 8 2" strokeLinecap="round"/>
              <path d="M14 2v4h-4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
          {syncing ? 'Syncing…' : 'Sync Now'}
        </button>
      </div>
      {syncMsg && <p className="text-sm text-ink-2">{syncMsg}</p>}

      {/* No-recent-spend notice */}
      {noRecentSpend && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 5zm0 7a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/>
          </svg>
          <p className="text-xs text-amber-800">
            No spend in the last 30 days — all metrics below reflect the full 90-day window to match the campaign table.
            Campaigns may have been paused or budgets exhausted.
          </p>
        </div>
      )}

      {/* Primary KPI cards — 90d */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          label="Ad Spend (90d)"
          value={fmt(totalSpend90)}
          sub="total across all campaigns"
          note={noRecentSpend ? '$0 in last 30 days' : undefined}
        />
        <MetricCard
          label="ROAS (90d)"
          value={totalSpend90 > 0 ? `${fmt(roas90, false)}×` : '—'}
          sub="purchase value / spend"
          note={noRecentSpend ? 'No recent data' : undefined}
        />
        <MetricCard
          label="Cost Per Purchase"
          value={cpp90 > 0 ? fmt(cpp90) : '—'}
          sub="90-day avg"
          note={noRecentSpend ? 'No recent data' : undefined}
        />
        <MetricCard
          label="Purchases (90d)"
          value={totalPurchases90.toLocaleString()}
          sub="attributed purchases"
          note={noRecentSpend ? 'No recent data' : undefined}
        />
      </div>

      {/* Secondary stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SmallStatCard
          label="Active Campaigns"
          value={activeCampaigns.length.toString()}
          sub={activeCampaigns.length > 0 ? `${activeCampaigns.map((c) => c.name).slice(0, 2).join(', ')}${activeCampaigns.length > 2 ? '…' : ''}` : 'None active'}
        />
        <SmallStatCard
          label="Paused (with spend)"
          value={pausedCampaigns.length.toString()}
          sub={pausedCampaigns.length > 0 ? `${fmt(pausedCampaigns.reduce((s, c) => s + c.spend, 0))} total` : 'None'}
        />
        <SmallStatCard
          label="Best ROAS Campaign"
          value={bestRoas ? `${fmt(bestRoas.roas, false)}×` : '—'}
          sub={bestRoas?.name ?? 'No data'}
        />
        <SmallStatCard
          label="Flagged Campaigns"
          value={belowOne.length.toString()}
          sub={belowOne.length > 0 ? 'ROAS below 1× — losing money' : 'None — all profitable'}
        />
      </div>

      {/* Underperformer alert */}
      {belowOne.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <svg className="mt-0.5 h-4 w-4 shrink-0 text-red-500" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 5zm0 7a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/>
          </svg>
          <div>
            <p className="text-sm font-semibold text-red-800">{belowOne.length} campaign{belowOne.length > 1 ? 's' : ''} with ROAS below 1× — losing money</p>
            <p className="text-xs text-red-600 mt-0.5">
              Estimated wasted spend: {fmt(belowOne.reduce((s, c) => s + c.spend, 0))} in the last 90 days. Consider pausing or restructuring these.
            </p>
          </div>
        </div>
      )}

      {/* ROAS chart */}
      <section className="rounded-2xl border border-cream-3 bg-white p-6 shadow-sm">
        <h2 className="font-display text-base font-semibold text-ink">Campaign ROAS Ranking</h2>
        <p className="text-xs text-ink-3 mt-0.5">Last 90 days — sorted best to worst · spend and status shown below each name</p>
        <RoasBarChart campaigns={campaigns} />
      </section>

      {/* AI Insights */}
      <AiInsightsPanel />

      {/* Campaign table */}
      <section className="rounded-2xl border border-cream-3 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-cream-2 px-5 py-3.5">
          <h2 className="font-display text-sm font-semibold text-ink">All Campaigns</h2>
          <span className="font-data text-xs text-ink-3">Total spend: {fmt(totalSpend90)} · 90 days</span>
        </div>
        {campaigns.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-ink-3">No campaigns found — run a sync to import data.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-cream-2 text-xs font-medium text-ink-3 bg-cream">
                  <th className="px-5 py-2.5 text-left">Campaign</th>
                  <th className="px-4 py-2.5 text-left">Status</th>
                  <th className={`px-4 py-2.5 text-right ${thCls('spend', sortColumn)}`} onClick={() => handleSort('spend')}>Spend<SortIcon column="spend" sortColumn={sortColumn} sortDirection={sortDirection} /></th>
                  <th className={`px-4 py-2.5 text-right ${thCls('impressions', sortColumn)}`} onClick={() => handleSort('impressions')}>Impr.<SortIcon column="impressions" sortColumn={sortColumn} sortDirection={sortDirection} /></th>
                  <th className={`px-4 py-2.5 text-right ${thCls('clicks', sortColumn)}`} onClick={() => handleSort('clicks')}>Clicks<SortIcon column="clicks" sortColumn={sortColumn} sortDirection={sortDirection} /></th>
                  <th className={`px-4 py-2.5 text-right ${thCls('ctr', sortColumn)}`} onClick={() => handleSort('ctr')}>CTR<SortIcon column="ctr" sortColumn={sortColumn} sortDirection={sortDirection} /></th>
                  <th className={`px-4 py-2.5 text-right ${thCls('purchases', sortColumn)}`} onClick={() => handleSort('purchases')}>Purchases<SortIcon column="purchases" sortColumn={sortColumn} sortDirection={sortDirection} /></th>
                  <th className={`px-4 py-2.5 text-right ${thCls('roas', sortColumn)}`} onClick={() => handleSort('roas')}>ROAS<SortIcon column="roas" sortColumn={sortColumn} sortDirection={sortDirection} /></th>
                  <th className="px-4 py-2.5 text-left">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-2">
                {(sortedCampaigns as unknown as Campaign[]).map((c) => (
                  <tr
                    key={c.id}
                    className={`hover:bg-cream transition-colors ${c.spend > 0 && c.roas < 1 ? 'bg-red-50/50' : ''}`}
                  >
                    <td className="px-5 py-2.5 max-w-48">
                      <p className="text-xs font-medium text-ink truncate" title={c.name}>{c.name}</p>
                      <p className="text-[10px] text-ink-3">{c.objective}</p>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded ${c.status === 'ACTIVE' ? 'bg-teal-pale text-teal-deep' : 'bg-cream-2 text-ink-3'}`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-data text-xs">{fmt(c.spend)}</td>
                    <td className="px-4 py-2.5 text-right font-data text-xs">{c.impressions.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right font-data text-xs">{c.clicks.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right font-data text-xs">{c.ctr > 0 ? `${c.ctr.toFixed(2)}%` : '—'}</td>
                    <td className="px-4 py-2.5 text-right font-data text-xs">{c.purchases}</td>
                    <td className="px-4 py-2.5 text-right font-data text-xs font-medium">
                      {c.spend > 0 ? `${fmt(c.roas, false)}×` : '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      {c.spend > 0 ? <RoasBadge roas={c.roas} /> : <span className="text-xs text-ink-3">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
