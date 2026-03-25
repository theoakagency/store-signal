'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSortableTable, SortIcon, thCls } from '@/hooks/useSortableTable'

// ── Types ─────────────────────────────────────────────────────────────────────

interface PromotionResult {
  campaign_id: string
  campaign_name: string
  started_at: string | null
  ended_at: string | null
  multiplier: number | null
  participants: number
  orders_during: number
  orders_before_14d: number
  lift_pct: number | null
  incremental_orders: number
  verdict: string
}

interface TierRow {
  tier: string
  count: number
  avg_ltv: number
}

interface TopRedeemer {
  email: string
  points_redeemed: number
  ltv: number
  tier: string | null
}

interface Metrics {
  enrolled_customers: number
  active_redeemers_30d: number
  points_issued_30d: number
  points_redeemed_30d: number
  redemption_rate: number
  avg_points_balance: number
  points_liability_value: number
  promotion_response_rate: PromotionResult[]
  tier_breakdown: TierRow[]
  top_redeemers: TopRedeemer[]
  calculated_at: string
}

interface Props {
  connected: boolean
  metrics: Metrics | null
  totalCustomers: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, d = 0) {
  return (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}
function fmtUsd(n: number | null | undefined) { const v = n ?? 0; return '$' + fmt(v, v < 10 ? 2 : 0) }
function fmtPct(n: number | null | undefined) { return ((n ?? 0) * 100).toFixed(1) + '%' }

// ── Sub-components ─────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, warning }: { label: string; value: string; sub?: string; warning?: boolean }) {
  return (
    <div className={`rounded-2xl border bg-white p-5 shadow-sm ${warning ? 'border-amber-200' : 'border-cream-3'}`}>
      <p className="text-xs font-data uppercase tracking-widest text-ink-3">{label}</p>
      <p className={`mt-1.5 font-display text-2xl font-bold ${warning ? 'text-amber-700' : 'text-ink'}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-ink-3">{sub}</p>}
    </div>
  )
}

function NotConnected() {
  return (
    <div className="rounded-2xl border border-cream-3 bg-white p-10 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-cream-2">
        <svg className="h-7 w-7 text-ink-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      <h2 className="font-display text-lg font-semibold text-ink">LoyaltyLion not connected</h2>
      <p className="mt-2 text-sm text-ink-3">Connect your LoyaltyLion account to see loyalty program analytics.</p>
      <Link href="/dashboard/integrations" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-teal px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-dark transition">
        Go to Integrations →
      </Link>
    </div>
  )
}

// ── Main dashboard ─────────────────────────────────────────────────────────────

export default function LoyaltyDashboard({ connected, metrics, totalCustomers }: Props) {
  const [aiInsight, setAiInsight] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState('')
  const [auditing, setAuditing] = useState(false)
  const [auditResult, setAuditResult] = useState<string>('')

  if (!connected) return <NotConnected />

  async function handleSync() {
    setSyncing(true)
    setSyncError('')
    try {
      const res = await fetch('/api/loyaltylion/sync', { method: 'POST' })
      const data = await res.json() as { error?: string; ok?: boolean }
      if (data.error) {
        setSyncError(data.error)
        setSyncing(false)
        return
      }
      window.location.reload()
    } catch {
      setSyncError('Network error — check console')
      setSyncing(false)
    }
  }

  async function runAudit() {
    setAuditing(true)
    setAuditResult('')
    try {
      const res = await fetch('/api/loyaltylion/audit', { method: 'POST' })
      const data = await res.json()
      setAuditResult(JSON.stringify(data, null, 2))
    } catch {
      setAuditResult('Network error — check console')
    } finally {
      setAuditing(false)
    }
  }

  async function generateInsight() {
    if (aiLoading || !metrics) return
    setAiLoading(true)
    setAiInsight('')
    try {
      const res = await fetch('/api/insights/loyalty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metrics }),
      })
      const data = await res.json() as { insight?: string; error?: string }
      setAiInsight(data.insight ?? data.error ?? 'No insight generated.')
    } catch {
      setAiInsight('Error generating insight.')
    } finally {
      setAiLoading(false)
    }
  }

  const m = metrics
  const promos = m?.promotion_response_rate ?? []
  const tiers = m?.tier_breakdown ?? []
  const redeemers = m?.top_redeemers ?? []
  const { sortedData: sortedPromos, sortColumn: promoSort, sortDirection: promoDir, handleSort: promoHandleSort } = useSortableTable(promos as unknown as Record<string, unknown>[], 'lift_pct', 'desc')
  const enrollmentPct = totalCustomers > 0 && m ? (m.enrolled_customers ?? 0) / totalCustomers : 0
  const lowRedemption = m ? (m.redemption_rate ?? 0) < 0.1 : false

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Loyalty Program</h1>
          {m?.calculated_at && (
            <p className="mt-0.5 text-xs text-ink-3">Updated {new Date(m.calculated_at).toLocaleDateString()}</p>
          )}
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="rounded-lg border border-cream-3 px-4 py-2 text-sm font-medium text-ink-2 hover:bg-cream-2 disabled:opacity-50 transition"
        >
          {syncing ? 'Syncing…' : 'Sync Now'}
        </button>
      </div>

      {syncError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Sync error: {syncError}
        </div>
      )}

      {!m ? (
        <div className="rounded-2xl border border-cream-3 bg-white p-10 text-center text-sm text-ink-3">
          No data yet — run a sync to populate loyalty metrics.
        </div>
      ) : (
        <>
          {/* AI Analysis — top of page */}
          <div className="rounded-2xl border border-cream-3 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-display text-base font-semibold text-ink">AI Analysis</h2>
                <p className="mt-0.5 text-xs text-ink-3">Do points promotions work? What is the true program cost?</p>
              </div>
              <button
                onClick={generateInsight}
                disabled={aiLoading}
                className="flex items-center gap-2 rounded-lg bg-charcoal px-4 py-2 text-sm font-semibold text-cream hover:bg-charcoal/80 disabled:opacity-50 transition"
              >
                {aiLoading ? (
                  <><span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-cream/40 border-t-cream" />Analyzing…</>
                ) : (
                  <>Generate Insights</>
                )}
              </button>
            </div>
            {aiInsight ? (
              <div className="rounded-xl bg-cream p-4 text-sm text-ink leading-relaxed whitespace-pre-wrap">{aiInsight}</div>
            ) : (
              <div className="rounded-xl bg-cream p-4 text-sm text-ink-3">
                Click "Generate Insights" to analyze whether your loyalty promotions are driving incremental purchases, the true cost of the program, and simplification opportunities.
              </div>
            )}
          </div>

          {/* Section 1: Health KPIs */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard
              label="Enrolled Customers"
              value={fmt(m.enrolled_customers)}
              sub={`${fmtPct(enrollmentPct)} of customer base`}
            />
            <KpiCard label="Active Redeemers (30d)" value={fmt(m.active_redeemers_30d)} />
            <KpiCard
              label="Redemption Rate"
              value={fmtPct(m.redemption_rate)}
              sub="Points redeemed / issued"
              warning={lowRedemption}
            />
            <KpiCard
              label="Points Liability"
              value={fmtUsd(m.points_liability_value)}
              sub="Unredeemed points value"
              warning={m.points_liability_value > 10000}
            />
          </div>

          {/* Section 2: Points Flow */}
          <div className="rounded-2xl border border-cream-3 bg-white p-6 shadow-sm">
            <h2 className="font-display text-base font-semibold text-ink mb-5">Points Flow — Last 30 Days</h2>
            <div className="flex items-center justify-between gap-4">
              {/* Issued */}
              <div className="flex-1 text-center rounded-xl bg-teal/5 border border-teal/20 p-4">
                <p className="text-xs font-data uppercase tracking-wider text-teal-deep">Issued</p>
                <p className="font-display text-2xl font-bold text-teal-deep">{fmt(m.points_issued_30d)}</p>
                <p className="text-xs text-ink-3">points earned</p>
              </div>

              {/* Arrow + rate */}
              <div className="flex flex-col items-center gap-1">
                <svg className="h-6 w-16 text-cream-3" viewBox="0 0 64 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 12h52M44 4l12 8-12 8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className={`text-xs font-semibold ${lowRedemption ? 'text-amber-600' : 'text-teal'}`}>
                  {fmtPct(m.redemption_rate)} redeemed
                </span>
              </div>

              {/* Balance */}
              <div className="flex-1 text-center rounded-xl bg-cream border border-cream-3 p-4">
                <p className="text-xs font-data uppercase tracking-wider text-ink-3">Avg Balance</p>
                <p className="font-display text-2xl font-bold text-ink">{fmt(m.avg_points_balance, 0)}</p>
                <p className="text-xs text-ink-3">pts per enrolled member</p>
              </div>

              {/* Arrow */}
              <div className="flex flex-col items-center gap-1">
                <svg className="h-6 w-16 text-cream-3" viewBox="0 0 64 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 12h52M44 4l12 8-12 8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className="text-xs text-ink-3">spent</span>
              </div>

              {/* Redeemed */}
              <div className="flex-1 text-center rounded-xl bg-cream border border-cream-3 p-4">
                <p className="text-xs font-data uppercase tracking-wider text-ink-3">Redeemed</p>
                <p className="font-display text-2xl font-bold text-ink">{fmt(m.points_redeemed_30d)}</p>
                <p className="text-xs text-ink-3">points spent</p>
              </div>
            </div>

            {lowRedemption && (
              <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800">
                <strong>Low redemption rate detected.</strong> Only {fmtPct(m.redemption_rate)} of issued points are being redeemed. Members may not be aware of rewards or find them unappealing. Consider simplifying the reward catalog or sending redeemable-balance reminders.
              </div>
            )}
          </div>

          {/* Section 3: Promotion Response Analysis */}
          {promos.length > 0 && (
            <div className="rounded-2xl border border-cream-3 bg-white p-6 shadow-sm">
              <div className="mb-4">
                <h2 className="font-display text-base font-semibold text-ink">Points Multiplier Campaign Performance</h2>
                <p className="mt-0.5 text-xs text-ink-3">Did points promotions actually drive incremental purchases?</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-cream-2 text-left">
                      <th className={`pb-2 pr-4 text-xs font-data font-medium uppercase tracking-wider text-ink-3 ${thCls('campaign_name', promoSort)}`} onClick={() => promoHandleSort('campaign_name')}>Campaign<SortIcon column="campaign_name" sortColumn={promoSort} sortDirection={promoDir} /></th>
                      <th className={`pb-2 pr-3 text-xs font-data font-medium uppercase tracking-wider text-ink-3 text-right ${thCls('multiplier', promoSort)}`} onClick={() => promoHandleSort('multiplier')}>Multiplier<SortIcon column="multiplier" sortColumn={promoSort} sortDirection={promoDir} /></th>
                      <th className={`pb-2 pr-3 text-xs font-data font-medium uppercase tracking-wider text-ink-3 text-right ${thCls('participants', promoSort)}`} onClick={() => promoHandleSort('participants')}>Participants<SortIcon column="participants" sortColumn={promoSort} sortDirection={promoDir} /></th>
                      <th className={`pb-2 pr-3 text-xs font-data font-medium uppercase tracking-wider text-ink-3 text-right ${thCls('orders_during', promoSort)}`} onClick={() => promoHandleSort('orders_during')}>Orders During<SortIcon column="orders_during" sortColumn={promoSort} sortDirection={promoDir} /></th>
                      <th className={`pb-2 pr-3 text-xs font-data font-medium uppercase tracking-wider text-ink-3 text-right ${thCls('orders_before_14d', promoSort)}`} onClick={() => promoHandleSort('orders_before_14d')}>Orders Before<SortIcon column="orders_before_14d" sortColumn={promoSort} sortDirection={promoDir} /></th>
                      <th className={`pb-2 pr-3 text-xs font-data font-medium uppercase tracking-wider text-ink-3 text-right ${thCls('lift_pct', promoSort)}`} onClick={() => promoHandleSort('lift_pct')}>Lift<SortIcon column="lift_pct" sortColumn={promoSort} sortDirection={promoDir} /></th>
                      <th className={`pb-2 text-xs font-data font-medium uppercase tracking-wider text-ink-3 ${thCls('verdict', promoSort)}`} onClick={() => promoHandleSort('verdict')}>Verdict<SortIcon column="verdict" sortColumn={promoSort} sortDirection={promoDir} /></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cream-2">
                    {(sortedPromos as unknown as PromotionResult[]).map((p, i) => {
                      const positiveLift = p.lift_pct !== null && p.lift_pct > 10
                      const negativeLift = p.lift_pct !== null && p.lift_pct < -10
                      return (
                        <tr key={i} className="hover:bg-cream/50 transition">
                          <td className="py-2.5 pr-4">
                            <p className="font-medium text-ink truncate max-w-[160px]">{p.campaign_name}</p>
                            {p.started_at && (
                              <p className="text-[10px] text-ink-3">{new Date(p.started_at).toLocaleDateString()}{p.ended_at ? ` – ${new Date(p.ended_at).toLocaleDateString()}` : ''}</p>
                            )}
                          </td>
                          <td className="py-2.5 pr-3 text-right font-medium text-ink">{p.multiplier}×</td>
                          <td className="py-2.5 pr-3 text-right text-ink-2">{fmt(p.participants)}</td>
                          <td className="py-2.5 pr-3 text-right text-ink-2">{fmt(p.orders_during)}</td>
                          <td className="py-2.5 pr-3 text-right text-ink-2">{fmt(p.orders_before_14d)}</td>
                          <td className="py-2.5 pr-3 text-right">
                            {p.lift_pct !== null ? (
                              <span className={`font-semibold ${positiveLift ? 'text-teal-deep' : negativeLift ? 'text-red-600' : 'text-ink-2'}`}>
                                {p.lift_pct > 0 ? '+' : ''}{p.lift_pct.toFixed(1)}%
                              </span>
                            ) : <span className="text-ink-3">—</span>}
                          </td>
                          <td className="py-2.5">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              positiveLift ? 'bg-teal-pale text-teal-deep' :
                              negativeLift ? 'bg-red-50 text-red-700' :
                              'bg-cream-2 text-ink-3'
                            }`}>
                              {p.verdict}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Section 4: Tier Breakdown */}
          {tiers.length > 0 && (
            <div className="rounded-2xl border border-cream-3 bg-white p-6 shadow-sm">
              <h2 className="font-display text-base font-semibold text-ink mb-4">Tier Breakdown</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {tiers.map((tier, i) => (
                  <div key={i} className="rounded-xl border border-cream-3 p-4 bg-cream">
                    <p className="text-xs font-data uppercase tracking-wider text-ink-3">{tier.tier}</p>
                    <p className="mt-1 font-display text-xl font-bold text-ink">{fmt(tier.count)}</p>
                    <p className="text-xs text-ink-3">Avg LTV: <span className="text-ink-2 font-medium">{fmtUsd(tier.avg_ltv)}</span></p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 5: Top Redeemers */}
          {redeemers.length > 0 && (
            <div className="rounded-2xl border border-cream-3 bg-white p-6 shadow-sm">
              <h2 className="font-display text-base font-semibold text-ink mb-4">Top Redeemers</h2>
              <div className="space-y-2">
                {redeemers.slice(0, 10).map((r, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg bg-cream px-3 py-2 text-xs">
                    <span className="font-medium text-ink truncate max-w-[180px]">{r.email}</span>
                    <span className="mx-2 text-ink-3">{r.tier ?? 'No Tier'}</span>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-ink-2">{fmt(r.points_redeemed)} pts redeemed</span>
                      <span className="font-medium text-ink">{fmtUsd(r.ltv)} LTV</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TEMPORARY: Cross-merchant audit */}
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="font-display text-base font-semibold text-amber-900">Data Scope Audit (Temporary)</h2>
                <p className="mt-0.5 text-xs text-amber-700">Fetches all raw LoyaltyLion data and stores it for investigation. Check Supabase tables <code className="font-mono bg-amber-100 px-1 rounded">ll_audit_customers</code> and <code className="font-mono bg-amber-100 px-1 rounded">ll_audit_activities</code> after running.</p>
              </div>
              <button
                onClick={runAudit}
                disabled={auditing}
                className="shrink-0 rounded-lg border border-amber-400 bg-white px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50 transition"
              >
                {auditing ? 'Running…' : 'Run Audit'}
              </button>
            </div>
            {auditResult && (
              <pre className="mt-2 overflow-x-auto rounded-lg bg-white border border-amber-200 p-3 text-xs text-amber-900 whitespace-pre-wrap">{auditResult}</pre>
            )}
          </div>

        </>
      )}
    </div>
  )
}
