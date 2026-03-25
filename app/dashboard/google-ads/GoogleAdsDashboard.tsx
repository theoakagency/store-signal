'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSortableTable, SortIcon, thCls } from '@/hooks/useSortableTable'

interface Campaign {
  id: string
  name: string
  status: string
  campaign_type: string
  spend: number
  impressions: number
  clicks: number
  ctr: number
  avg_cpc: number
  conversions: number
  conversion_value: number
  roas: number
  impression_share: number | null
}

interface Props {
  connected: boolean
  campaigns: Campaign[]
  metrics: Record<string, number>
  dataSource?: 'google_ads' | 'ga4'
}

const CAMPAIGN_TYPE_LABEL: Record<string, string> = {
  SEARCH: 'Search',
  SHOPPING: 'Shopping',
  PERFORMANCE_MAX: 'PMax',
  DISPLAY: 'Display',
  VIDEO: 'Video',
  SMART: 'Smart',
  UNKNOWN: '—',
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

function MetricCard({ label, value, sub, alert }: { label: string; value: string; sub?: string; alert?: boolean }) {
  return (
    <div className={`rounded-2xl border px-5 py-5 shadow-sm ${alert ? 'border-red-200 bg-red-50' : 'border-cream-3 bg-white'}`}>
      <p className="font-data text-xs uppercase tracking-wider text-ink-3">{label}</p>
      <p className={`mt-2 font-display text-3xl font-semibold ${alert ? 'text-red-600' : 'text-ink'}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-ink-3">{sub}</p>}
    </div>
  )
}

function ConnectPrompt() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="mb-4 h-12 w-12 rounded-xl bg-[#4285F4] flex items-center justify-center">
        <svg className="h-7 w-7 text-white" viewBox="0 0 48 48" fill="none">
          <path d="M24 4L4 44h9.5l2.5-7h16l2.5 7H44L24 4z" fill="white"/>
          <path d="M24 17l5 14H19l5-14z" fill="#4285F4"/>
        </svg>
      </div>
      <h2 className="font-display text-lg font-semibold text-ink">Connect Google Ads</h2>
      <p className="mt-2 max-w-sm text-sm text-ink-3">
        Link your Google Ads account to track campaign spend, ROAS, and conversion performance.
      </p>
      <Link href="/dashboard/integrations" className="mt-5 inline-flex items-center rounded-lg bg-[#4285F4] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#3367d6] transition">
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
    <div className="mt-4 space-y-2">
      {top.map((c) => {
        const pct = (c.roas / max) * 100
        const color = c.roas >= 2 ? '#4BBFAD' : c.roas >= 1 ? '#F59E0B' : '#EF4444'
        return (
          <div key={c.id} className="flex items-center gap-3">
            <div className="w-36 shrink-0 text-xs text-ink-2 truncate" title={c.name}>{c.name}</div>
            <div className="w-16 shrink-0">
              <span className="text-[10px] font-medium uppercase tracking-wider px-1 py-0.5 rounded bg-cream-2 text-ink-3">
                {CAMPAIGN_TYPE_LABEL[c.campaign_type] ?? c.campaign_type}
              </span>
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

// ── Campaign type breakdown ────────────────────────────────────────────────────

function TypeBreakdown({ campaigns }: { campaigns: Campaign[] }) {
  const typeMap: Record<string, { spend: number; conversions: number; roas: number; count: number }> = {}
  for (const c of campaigns) {
    const t = CAMPAIGN_TYPE_LABEL[c.campaign_type] ?? 'Other'
    if (!typeMap[t]) typeMap[t] = { spend: 0, conversions: 0, roas: 0, count: 0 }
    typeMap[t].spend += c.spend
    typeMap[t].conversions += c.conversions
    typeMap[t].count += 1
  }
  // Compute ROAS per type
  for (const t of Object.values(typeMap)) {
    t.roas = t.spend > 0 ? campaigns.filter((c) => (CAMPAIGN_TYPE_LABEL[c.campaign_type] ?? 'Other') === Object.keys(typeMap).find((k) => typeMap[k] === t)).reduce((s, c) => s + c.conversion_value, 0) / t.spend : 0
  }
  const entries = Object.entries(typeMap).sort((a, b) => b[1].spend - a[1].spend)
  if (entries.length === 0) return null

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mt-4">
      {entries.map(([type, stats]) => (
        <div key={type} className="rounded-xl border border-cream-2 bg-cream px-4 py-3">
          <p className="font-data text-xs uppercase tracking-wider text-ink-3">{type}</p>
          <p className="mt-1 font-data text-lg font-semibold text-ink">{fmt(stats.spend)}</p>
          <p className="text-xs text-ink-3">{stats.conversions.toFixed(0)} conversions</p>
        </div>
      ))}
    </div>
  )
}

export default function GoogleAdsDashboard({ connected, campaigns, metrics, dataSource = 'google_ads' }: Props) {
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const { sortedData: sortedCampaigns, sortColumn, sortDirection, handleSort } = useSortableTable(
    campaigns as unknown as Record<string, unknown>[],
    'spend',
    'desc',
  )

  if (!connected) return <ConnectPrompt />

  const m = (k: string) => metrics[k] ?? 0
  const belowOne = campaigns.filter((c) => c.spend > 0 && c.roas < 1)
  const totalSpendAll = campaigns.reduce((s, c) => s + c.spend, 0)

  async function handleSync() {
    setSyncing(true)
    setSyncMsg('')
    try {
      const res = await fetch('/api/google-ads/sync', { method: 'POST' })
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
          <h1 className="font-display text-2xl font-bold text-ink">Google Ads</h1>
          <p className="text-sm text-ink-3 mt-0.5">Search, Shopping & Performance Max campaign performance</p>
        </div>
        <button onClick={handleSync} disabled={syncing} className="inline-flex items-center gap-2 rounded-lg border border-cream-3 bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-cream disabled:opacity-50 transition">
          {syncing ? <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-cream-3 border-t-teal" /> : (
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M14 8A6 6 0 1 1 8 2" strokeLinecap="round"/>
              <path d="M14 2v4h-4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
          {syncing ? 'Syncing…' : 'Sync Now'}
        </button>
      </div>
      {syncMsg && <p className="text-sm text-ink-2">{syncMsg}</p>}

      {/* GA4 fallback notice */}
      {dataSource === 'ga4' && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 5zm0 7a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/>
          </svg>
          <div>
            <p className="text-sm font-semibold text-amber-800">Campaign data sourced from Google Analytics</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Conversions and revenue shown. Spend and ROAS are unavailable until the Google Ads API Developer Token is approved.
              Connect GA4 in Integrations to keep this data current.
            </p>
          </div>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {dataSource === 'ga4' ? (
          <>
            <MetricCard label="Ad Spend (90d)" value="—" sub="pending API approval" />
            <MetricCard label="ROAS (90d)" value="—" sub="pending API approval" />
            <MetricCard label="Conversions (90d)" value={campaigns.reduce((s, c) => s + c.conversions, 0).toFixed(0)} sub="from Google Analytics" />
            <MetricCard label="Revenue (90d)" value={fmt(campaigns.reduce((s, c) => s + c.conversion_value, 0))} sub="from Google Analytics" />
          </>
        ) : (
          <>
            <MetricCard label="Ad Spend (30d)" value={fmt(m('total_ad_spend_30d'))} sub="total spend" />
            <MetricCard label="ROAS (30d)" value={`${fmt(m('total_roas_30d'), false)}×`} sub="return on ad spend" />
            <MetricCard label="Cost Per Conversion" value={m('cost_per_conversion_30d') > 0 ? fmt(m('cost_per_conversion_30d')) : '—'} sub="30-day avg" />
            <MetricCard label="Conversions (30d)" value={m('total_conversions_30d').toFixed(0)} sub="attributed" />
          </>
        )}
      </div>

      {/* Underperformer alert */}
      {belowOne.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <svg className="mt-0.5 h-4 w-4 shrink-0 text-red-500" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 5zm0 7a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/>
          </svg>
          <div>
            <p className="text-sm font-semibold text-red-800">{belowOne.length} campaign{belowOne.length !== 1 ? 's' : ''} with ROAS below 1× — losing money</p>
            <p className="text-xs text-red-600 mt-0.5">Wasted spend: {fmt(belowOne.reduce((s, c) => s + c.spend, 0))} in the last 90 days.</p>
          </div>
        </div>
      )}

      {/* ROAS chart */}
      <section className="rounded-2xl border border-cream-3 bg-white p-6 shadow-sm">
        <h2 className="font-display text-base font-semibold text-ink">Campaign ROAS Ranking</h2>
        <p className="text-xs text-ink-3 mt-0.5">Last 90 days — sorted best to worst</p>
        <RoasBarChart campaigns={campaigns} />
      </section>

      {/* Campaign type breakdown */}
      <section className="rounded-2xl border border-cream-3 bg-white p-6 shadow-sm">
        <h2 className="font-display text-base font-semibold text-ink">By Campaign Type</h2>
        <TypeBreakdown campaigns={campaigns} />
      </section>

      {/* Campaign table */}
      <section className="rounded-2xl border border-cream-3 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-cream-2 px-5 py-3.5">
          <h2 className="font-display text-sm font-semibold text-ink">All Campaigns</h2>
          <span className="font-data text-xs text-ink-3">Total spend: {fmt(totalSpendAll)} · 90 days</span>
        </div>
        {campaigns.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-ink-3">No campaigns found — run a sync to import data.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-cream-2 text-xs font-medium text-ink-3 bg-cream">
                  <th className="px-5 py-2.5 text-left">Campaign</th>
                  <th className="px-4 py-2.5 text-left">Type</th>
                  <th className="px-4 py-2.5 text-left">Status</th>
                  <th className={`px-4 py-2.5 text-right ${thCls('spend', sortColumn)}`} onClick={() => handleSort('spend')}>Spend<SortIcon column="spend" sortColumn={sortColumn} sortDirection={sortDirection} /></th>
                  <th className={`px-4 py-2.5 text-right ${thCls('clicks', sortColumn)}`} onClick={() => handleSort('clicks')}>Clicks<SortIcon column="clicks" sortColumn={sortColumn} sortDirection={sortDirection} /></th>
                  <th className={`px-4 py-2.5 text-right ${thCls('ctr', sortColumn)}`} onClick={() => handleSort('ctr')}>CTR<SortIcon column="ctr" sortColumn={sortColumn} sortDirection={sortDirection} /></th>
                  <th className={`px-4 py-2.5 text-right ${thCls('conversions', sortColumn)}`} onClick={() => handleSort('conversions')}>Conv.<SortIcon column="conversions" sortColumn={sortColumn} sortDirection={sortDirection} /></th>
                  <th className={`px-4 py-2.5 text-right ${thCls('roas', sortColumn)}`} onClick={() => handleSort('roas')}>ROAS<SortIcon column="roas" sortColumn={sortColumn} sortDirection={sortDirection} /></th>
                  <th className="px-4 py-2.5 text-left">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-2">
                {(sortedCampaigns as unknown as Campaign[]).map((c) => (
                  <tr key={c.id} className={`hover:bg-cream transition-colors ${c.spend > 0 && c.roas < 1 ? 'bg-red-50/50' : ''}`}>
                    <td className="px-5 py-2.5 max-w-48">
                      <p className="text-xs font-medium text-ink truncate" title={c.name}>{c.name}</p>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-cream-2 text-ink-3">
                        {CAMPAIGN_TYPE_LABEL[c.campaign_type] ?? c.campaign_type}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded ${c.status === 'ENABLED' ? 'bg-teal-pale text-teal-deep' : 'bg-cream-2 text-ink-3'}`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-data text-xs">{fmt(c.spend)}</td>
                    <td className="px-4 py-2.5 text-right font-data text-xs">{c.clicks.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right font-data text-xs">{c.ctr > 0 ? `${c.ctr.toFixed(2)}%` : '—'}</td>
                    <td className="px-4 py-2.5 text-right font-data text-xs">{c.conversions.toFixed(1)}</td>
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
