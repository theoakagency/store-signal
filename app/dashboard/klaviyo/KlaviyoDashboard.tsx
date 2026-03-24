'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Campaign {
  id: string
  name: string
  subject: string | null
  channel: string
  status: string
  send_time: string | null
  recipient_count: number
  open_rate: number | null
  click_rate: number | null
  revenue_attributed: number
  unsubscribe_count: number
  created_at: string | null
}

interface Flow {
  id: string
  name: string
  channel: string
  status: string
  trigger_type: string | null
  recipient_count: number
  open_rate: number | null
  click_rate: number | null
  conversion_rate: number | null
  revenue_attributed: number
  created_at: string | null
}

interface MetricEntry {
  value: number
  metadata: Record<string, unknown>
}

interface Props {
  connected: boolean
  campaigns: Campaign[]
  flows: Flow[]
  metrics: Record<string, MetricEntry>
}

interface Insight {
  type: 'Opportunity' | 'Risk' | 'Win'
  title: string
  description: string
  action: string
}

interface FlowInsight {
  priority: number
  title: string
  category: 'inactive_flows' | 'zero_revenue_flows' | 'winback_gap'
  revenue_opportunity: string
  action: string
  rationale: string
}

// ── Formatters ────────────────────────────────────────────────────────────────

function usd(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n)
}

function pct(n: number | null) {
  if (n == null) return '—'
  return `${(n * 100).toFixed(1)}%`
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(d))
}

// ── Metric card ───────────────────────────────────────────────────────────────

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-cream-3 bg-white px-5 py-5 shadow-sm">
      <p className="font-data text-xs uppercase tracking-wider text-ink-3">{label}</p>
      <p className="mt-2 font-display text-3xl font-semibold text-ink">{value}</p>
      {sub && <p className="mt-1 text-xs text-ink-3">{sub}</p>}
    </div>
  )
}

// ── ROI score badge ───────────────────────────────────────────────────────────

function ROIBadge({ roi }: { roi: number }) {
  if (roi > 0.2) return <span className="rounded-full bg-teal-pale px-2 py-0.5 text-xs font-semibold text-teal-deep">Good</span>
  if (roi > 0) return <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">Marginal</span>
  return <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">Negative</span>
}

// ── Channel badge ─────────────────────────────────────────────────────────────

function ChannelBadge({ channel }: { channel: string }) {
  if (channel === 'sms') {
    return <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-xs font-semibold text-violet-700">SMS</span>
  }
  if (channel === 'multi') {
    return <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-xs font-semibold text-sky-700">Multi</span>
  }
  return <span className="rounded-full bg-teal-pale px-1.5 py-0.5 text-xs font-semibold text-teal-deep">Email</span>
}

// ── Campaign detail panel ─────────────────────────────────────────────────────

function CampaignPanel({ campaign, onClose }: { campaign: Campaign; onClose: () => void }) {
  const estCost = campaign.recipient_count * 0.002
  const roi = estCost > 0 ? (campaign.revenue_attributed - estCost) / estCost : 0

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-charcoal/40 backdrop-blur-sm" onClick={onClose} />
      <aside className="relative z-50 w-full max-w-md bg-white shadow-2xl overflow-y-auto animate-slide-in-right">
        <div className="flex items-start justify-between border-b border-cream-2 px-6 py-5">
          <div className="pr-4">
            <h3 className="font-display text-lg font-semibold text-ink leading-snug">{campaign.name}</h3>
            {campaign.subject && <p className="mt-1 text-sm text-ink-3 italic">"{campaign.subject}"</p>}
          </div>
          <button onClick={onClose} className="shrink-0 rounded-lg p-1.5 hover:bg-cream-2 transition text-ink-3">
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 0 1 1.414 0L10 8.586l4.293-4.293a1 1 0 1 1 1.414 1.414L11.414 10l4.293 4.293a1 1 0 0 1-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 0 1-1.414-1.414L8.586 10 4.293 5.707a1 1 0 0 1 0-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Revenue', value: usd(campaign.revenue_attributed) },
              { label: 'Recipients', value: campaign.recipient_count.toLocaleString() },
              { label: 'Open Rate', value: pct(campaign.open_rate) },
              { label: 'Click Rate', value: pct(campaign.click_rate) },
              { label: 'Unsubscribes', value: campaign.unsubscribe_count.toLocaleString() },
              { label: 'Send Date', value: fmtDate(campaign.send_time) },
            ].map((s) => (
              <div key={s.label} className="rounded-xl bg-cream px-4 py-3">
                <p className="font-data text-xs text-ink-3 mb-1">{s.label}</p>
                <p className="font-display text-xl font-semibold text-ink">{s.value}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-cream-3 px-4 py-3 space-y-2">
            <p className="font-data text-xs uppercase tracking-wider text-ink-3">ROI Estimate</p>
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink-2">Est. send cost</span>
              <span className="font-data text-sm text-ink">{usd(estCost)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink-2">Attributed revenue</span>
              <span className="font-data text-sm text-ink">{usd(campaign.revenue_attributed)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-cream-2 pt-2">
              <span className="text-sm font-semibold text-ink">Net ROI</span>
              <span className={`font-data text-sm font-semibold ${roi >= 0 ? 'text-teal-deep' : 'text-red-500'}`}>
                {roi >= 0 ? '+' : ''}{usd(campaign.revenue_attributed - estCost)}
              </span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  )
}

// ── Insight card ──────────────────────────────────────────────────────────────

function InsightCard({ insight }: { insight: Insight }) {
  const colors = {
    Opportunity: { border: 'border-teal', badge: 'bg-teal-pale text-teal-deep' },
    Risk: { border: 'border-red-400', badge: 'bg-red-50 text-red-700' },
    Win: { border: 'border-amber-400', badge: 'bg-amber-50 text-amber-700' },
  }
  const c = colors[insight.type]

  return (
    <div className={`rounded-xl border-l-4 ${c.border} bg-white px-5 py-4 shadow-sm border border-cream-3`}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <h4 className="font-display text-base font-semibold text-ink leading-tight">{insight.title}</h4>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${c.badge}`}>{insight.type}</span>
      </div>
      <p className="text-sm text-ink-2 leading-relaxed mb-3">{insight.description}</p>
      <div className="flex items-start gap-2">
        <svg className="h-4 w-4 text-teal shrink-0 mt-0.5" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm.75 4.25a.75.75 0 0 0-1.5 0v3.5l2 2a.75.75 0 0 0 1.06-1.06L8.75 8.19V5.25z" />
        </svg>
        <p className="text-xs text-ink-3 leading-relaxed">{insight.action}</p>
      </div>
    </div>
  )
}

// ── Not connected state ───────────────────────────────────────────────────────

function NotConnected() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="mb-4 h-14 w-14 rounded-2xl bg-[#FF6200]/10 flex items-center justify-center">
        <span className="text-xl font-bold text-[#FF6200]">K</span>
      </div>
      <h2 className="font-display text-2xl font-semibold text-ink mb-2">Connect Klaviyo</h2>
      <p className="text-sm text-ink-3 max-w-sm leading-relaxed mb-6">
        Connect your Klaviyo account to unlock campaign ROI analysis, flow performance tracking, and AI-powered email insights.
      </p>
      <Link
        href="/dashboard/integrations"
        className="inline-flex items-center rounded-lg bg-[#FF6200] px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 transition"
      >
        Connect in Integrations →
      </Link>
    </div>
  )
}

// ── Main dashboard component ──────────────────────────────────────────────────

const PAGE_SIZE = 25

export default function KlaviyoDashboard({ connected, campaigns, flows, metrics }: Props) {
  const router = useRouter()
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null)
  const [insights, setInsights] = useState<Insight[]>([])
  const [insightsState, setInsightsState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [syncing, setSyncing] = useState(false)
  const [activeTab, setActiveTab] = useState<'campaigns' | 'flows'>('campaigns')
  const [page, setPage] = useState(0)
  const [flowInsights, setFlowInsights] = useState<FlowInsight[]>([])
  const [flowInsightsState, setFlowInsightsState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')

  const noData = campaigns.length === 0 && flows.length === 0

  useEffect(() => {
    if (connected && !noData && insightsState === 'idle') {
      loadInsights()
    }
  }, [connected, noData])

  async function loadInsights() {
    setInsightsState('loading')
    try {
      const res = await fetch('/api/klaviyo/insights')
      const data = await res.json()
      setInsights(data.insights ?? [])
      setInsightsState('done')
    } catch {
      setInsightsState('error')
    }
  }

  async function loadFlowInsights() {
    setFlowInsightsState('loading')
    try {
      const res = await fetch('/api/klaviyo/flow-analysis')
      const data = await res.json()
      setFlowInsights(data.insights ?? [])
      setFlowInsightsState('done')
    } catch {
      setFlowInsightsState('error')
    }
  }

  async function handleSync() {
    setSyncing(true)
    try {
      await fetch('/api/klaviyo/sync', { method: 'POST' })
      window.location.reload()
    } finally {
      setSyncing(false)
    }
  }

  if (!connected) return <NotConnected />

  // Aggregate stats
  const m = (key: string) => metrics[key]?.value ?? 0
  const totalEmailRevenue = m('email_revenue_total') || (m('total_campaign_revenue') + m('total_flow_revenue'))
  const emailVsTotal = m('email_revenue_vs_total')
  const avgOpenRate = m('avg_campaign_open_rate')
  const avgClickRate = m('avg_campaign_click_rate')
  const estUnsubCost = m('estimated_unsubscribe_cost')

  // Per-channel RPR for 4-way breakdown
  const emailCampaignRevenue = m('total_email_campaign_revenue') || m('total_campaign_revenue')
  const emailCampaignRecip = m('total_email_campaign_recipients') || m('total_campaign_recipients') || campaigns.filter(c => (c.channel ?? 'email') !== 'sms').reduce((s, c) => s + c.recipient_count, 0)
  const smsCampaignRevenue = m('total_sms_campaign_revenue')
  const smsCampaignRecip = m('total_sms_campaign_recipients')
  const emailFlowRevenue = m('total_email_flow_revenue') || m('total_flow_revenue')
  const emailFlowRecip = m('total_email_flow_recipients') || m('total_flow_recipients') || flows.filter(f => f.channel !== 'sms').reduce((s, f) => s + f.recipient_count, 0)
  const smsFlowRevenue = m('total_sms_flow_revenue')
  const smsFlowRecip = m('total_sms_flow_recipients')

  const emailCampaignRPR = emailCampaignRecip > 0 ? emailCampaignRevenue / emailCampaignRecip : 0
  const smsCampaignRPR = smsCampaignRecip > 0 ? smsCampaignRevenue / smsCampaignRecip : 0
  const emailFlowRPR = emailFlowRecip > 0 ? emailFlowRevenue / emailFlowRecip : 0
  const smsFlowRPR = smsFlowRecip > 0 ? smsFlowRevenue / smsFlowRecip : 0

  // Legacy 2-col values (used in multiplier text)
  const broadcastRevenue = m('total_campaign_revenue')
  const flowRevenue = m('total_flow_revenue')
  const totalCampaignRecip = m('total_campaign_recipients') || campaigns.reduce((s, c) => s + c.recipient_count, 0)
  const totalFlowRecip = m('total_flow_recipients') || flows.reduce((s, f) => s + f.recipient_count, 0)

  // Flow health buckets
  const activeEarningFlows = flows.filter(f => f.recipient_count > 0 && f.revenue_attributed > 0)
  const activeNoRevenueFlows = flows.filter(f => f.recipient_count > 0 && f.revenue_attributed <= 0)
  const inactiveFlows = flows.filter(f => f.recipient_count === 0)
  const broadcastRPR = totalCampaignRecip > 0 ? broadcastRevenue / totalCampaignRecip : 0
  const flowRPR = totalFlowRecip > 0 ? flowRevenue / totalFlowRecip : 0
  const rprMultiplier = broadcastRPR > 0 && flowRPR > 0
    ? (flowRPR > broadcastRPR ? flowRPR / broadcastRPR : broadcastRPR / flowRPR)
    : null
  const flowsWin = flowRPR > broadcastRPR

  // 4-way breakdown data — filter out SMS columns if no SMS data
  const hasSmsData = m('sms_campaign_count') > 0 || m('sms_flow_count') > 0
  const maxRPR = Math.max(emailCampaignRPR, smsCampaignRPR, emailFlowRPR, smsFlowRPR, 0.001)

  return (
    <div className="space-y-6">
      {/* Header actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded bg-[#FF6200] flex items-center justify-center">
            <span className="text-xs font-bold text-white">K</span>
          </div>
          <span className="font-data text-xs text-ink-3">Klaviyo · Email Intelligence</span>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-1.5 rounded-lg border border-cream-3 bg-white px-3 py-1.5 text-xs font-medium text-ink-2 shadow-sm hover:bg-cream disabled:opacity-50 transition"
        >
          {syncing ? (
            <><span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-cream-3 border-t-teal" />Syncing…</>
          ) : (
            <><svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M13.5 2.5A6.5 6.5 0 1 1 7 1M13.5 2.5V6M13.5 2.5H10" strokeLinecap="round" strokeLinejoin="round" /></svg>Sync Klaviyo</>
          )}
        </button>
      </div>

      {/* Empty state if no data yet */}
      {noData && (
        <div className="rounded-2xl border border-cream-3 bg-white px-6 py-12 text-center shadow-sm">
          <p className="text-sm text-ink-3 mb-3">No Klaviyo data synced yet.</p>
          <button onClick={handleSync} className="inline-flex items-center rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-dark transition">
            Run first sync
          </button>
        </div>
      )}

      {!noData && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Total Email Revenue"
              value={usd(totalEmailRevenue)}
              sub="campaigns + flows"
            />
            <MetricCard
              label="Avg Open Rate"
              value={pct(avgOpenRate)}
              sub="across all campaigns"
            />
            <MetricCard
              label="Avg Click Rate"
              value={pct(avgClickRate)}
              sub="across all campaigns"
            />
            <MetricCard
              label="Est. Unsubscribe Cost"
              value={usd(estUnsubCost)}
              sub={`unsubs × avg LTV`}
            />
          </div>

          {/* SMS Performance section — only when SMS data exists */}
          {m('sms_campaign_count') > 0 && (() => {
            const emailCampaignRPR = m('total_email_campaign_recipients') > 0
              ? m('total_email_campaign_revenue') / m('total_email_campaign_recipients')
              : 0
            const smsCampaignRPR = m('total_sms_campaign_recipients') > 0
              ? m('total_sms_campaign_revenue') / m('total_sms_campaign_recipients')
              : 0
            const smsVsEmail = emailCampaignRPR > 0 && smsCampaignRPR > 0
              ? `${(smsCampaignRPR / emailCampaignRPR).toFixed(1)}× vs email RPR`
              : null
            return (
              <section className="rounded-2xl border border-violet-200 bg-white shadow-sm overflow-hidden">
                <div className="flex items-center gap-2 px-5 pt-5 pb-3 border-b border-violet-100">
                  <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700">SMS</span>
                  <h2 className="font-display text-base font-semibold text-ink">SMS Performance</h2>
                </div>
                <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl border border-cream-3 bg-cream px-5 py-5">
                    <p className="font-data text-xs uppercase tracking-wider text-ink-3">Total SMS Revenue</p>
                    <p className="mt-2 font-display text-3xl font-semibold text-ink">{usd(m('total_sms_revenue'))}</p>
                    <p className="mt-1 text-xs text-ink-3">campaigns + flows</p>
                  </div>
                  <div className="rounded-2xl border border-cream-3 bg-cream px-5 py-5">
                    <p className="font-data text-xs uppercase tracking-wider text-ink-3">SMS Click Rate</p>
                    <p className="mt-2 font-display text-3xl font-semibold text-ink">{pct(m('avg_sms_click_rate'))}</p>
                    <p className="mt-1 text-xs text-ink-3">
                      vs {pct(avgClickRate)} email click rate
                      {m('avg_sms_click_rate') > 0 && avgClickRate > 0 && (
                        <span className={`ml-1 font-semibold ${m('avg_sms_click_rate') > avgClickRate ? 'text-teal-deep' : 'text-red-500'}`}>
                          ({m('avg_sms_click_rate') > avgClickRate ? '↑' : '↓'}{Math.abs(((m('avg_sms_click_rate') - avgClickRate) / avgClickRate) * 100).toFixed(0)}%)
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-cream-3 bg-cream px-5 py-5">
                    <p className="font-data text-xs uppercase tracking-wider text-ink-3">SMS Opt-out Cost</p>
                    <p className="mt-2 font-display text-3xl font-semibold text-ink">{usd(m('estimated_sms_optout_cost'))}</p>
                    <p className="mt-1 text-xs text-ink-3">{m('sms_optout_count').toLocaleString()} opt-outs × avg LTV</p>
                  </div>
                  <div className="rounded-2xl border border-cream-3 bg-cream px-5 py-5">
                    <p className="font-data text-xs uppercase tracking-wider text-ink-3">SMS Rev / Recipient</p>
                    <p className="mt-2 font-display text-3xl font-semibold text-ink">{usd(smsCampaignRPR)}</p>
                    <p className="mt-1 text-xs text-ink-3">{smsVsEmail ?? 'per SMS recipient'}</p>
                  </div>
                </div>
              </section>
            )
          })()}

          {/* Tabbed campaigns / flows table */}
          <section className="rounded-2xl border border-cream-3 bg-white shadow-sm overflow-hidden">
            {/* Tab bar */}
            <div className="flex items-center gap-1 border-b border-cream-2 px-4 pt-3">
              {(['campaigns', 'flows'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => { setActiveTab(tab); setPage(0) }}
                  className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                    activeTab === tab
                      ? 'bg-white border border-b-white border-cream-2 -mb-px text-ink'
                      : 'text-ink-3 hover:text-ink-2'
                  }`}
                >
                  {tab === 'campaigns' ? `Campaigns (${campaigns.length})` : `Flows (${flows.length})`}
                </button>
              ))}
            </div>

            {/* Campaigns tab */}
            {activeTab === 'campaigns' && (() => {
              const totalPages = Math.ceil(campaigns.length / PAGE_SIZE)
              const paginated = campaigns.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
              return (
                <>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-cream-2 text-xs font-medium text-ink-3">
                          <th className="px-5 py-2.5 text-left">Campaign</th>
                          <th className="px-5 py-2.5 text-left">Ch.</th>
                          <th className="px-5 py-2.5 text-left">Date</th>
                          <th className="px-5 py-2.5 text-right">Recipients</th>
                          <th className="px-5 py-2.5 text-right">Open</th>
                          <th className="px-5 py-2.5 text-right">Click</th>
                          <th className="px-5 py-2.5 text-right">Revenue</th>
                          <th className="px-5 py-2.5 text-right">Est. Cost</th>
                          <th className="px-5 py-2.5 text-right">Net ROI</th>
                          <th className="px-5 py-2.5 text-center">Score</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-cream-2">
                        {paginated.map((c) => {
                          const estCost = c.recipient_count * 0.002
                          const netROI = c.revenue_attributed - estCost
                          const roiRatio = estCost > 0 ? netROI / estCost : 0
                          return (
                            <tr
                              key={c.id}
                              className="hover:bg-cream transition-colors cursor-pointer"
                              onClick={() => setSelectedCampaign(c)}
                            >
                              <td className="px-5 py-3 max-w-[180px]">
                                <p className="font-medium text-ink truncate">{c.name}</p>
                                {c.subject && <p className="text-xs text-ink-3 truncate italic">{c.subject}</p>}
                              </td>
                              <td className="px-5 py-3 whitespace-nowrap"><ChannelBadge channel={c.channel ?? 'email'} /></td>
                              <td className="px-5 py-3 font-data text-xs text-ink-2 whitespace-nowrap">{fmtDate(c.send_time)}</td>
                              <td className="px-5 py-3 font-data text-xs text-right text-ink-2">{c.recipient_count.toLocaleString()}</td>
                              <td className="px-5 py-3 font-data text-xs text-right text-ink-2">{pct(c.open_rate)}</td>
                              <td className="px-5 py-3 font-data text-xs text-right text-ink-2">{pct(c.click_rate)}</td>
                              <td className="px-5 py-3 font-data text-xs text-right font-medium text-ink">{usd(c.revenue_attributed)}</td>
                              <td className="px-5 py-3 font-data text-xs text-right text-ink-3">{usd(estCost)}</td>
                              <td className={`px-5 py-3 font-data text-xs text-right font-semibold ${netROI >= 0 ? 'text-teal-deep' : 'text-red-500'}`}>
                                {netROI >= 0 ? '+' : ''}{usd(netROI)}
                              </td>
                              <td className="px-5 py-3 text-center"><ROIBadge roi={roiRatio} /></td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between border-t border-cream-2 px-5 py-3">
                      <span className="font-data text-xs text-ink-3">
                        {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, campaigns.length)} of {campaigns.length}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setPage(p => Math.max(0, p - 1))}
                          disabled={page === 0}
                          className="rounded-lg border border-cream-3 px-3 py-1.5 text-xs font-medium text-ink-2 hover:bg-cream disabled:opacity-40 transition"
                        >
                          ← Prev
                        </button>
                        <span className="px-2 font-data text-xs text-ink-3">{page + 1} / {totalPages}</span>
                        <button
                          onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                          disabled={page === totalPages - 1}
                          className="rounded-lg border border-cream-3 px-3 py-1.5 text-xs font-medium text-ink-2 hover:bg-cream disabled:opacity-40 transition"
                        >
                          Next →
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )
            })()}

            {/* Flows tab */}
            {activeTab === 'flows' && (
              <>
                {/* Flow Health Analysis */}
                <div className="border-b border-cream-2 px-5 py-4">
                  <h3 className="font-display text-sm font-semibold text-ink mb-3">Flow Health Analysis</h3>
                  <div className="grid grid-cols-3 gap-3">
                    {/* Active & Earning */}
                    <div className="rounded-xl bg-teal-pale border border-teal/20 px-4 py-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <span className="h-2 w-2 rounded-full bg-teal shrink-0" />
                        <p className="font-data text-xs text-teal-deep font-medium uppercase tracking-wide">Active & Earning</p>
                      </div>
                      <p className="font-display text-2xl font-semibold text-ink">{activeEarningFlows.length}</p>
                      <p className="font-data text-xs text-ink-3 mt-0.5">
                        {usd(activeEarningFlows.reduce((s, f) => s + f.revenue_attributed, 0))} total
                      </p>
                    </div>

                    {/* Active, No Revenue */}
                    <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <span className="h-2 w-2 rounded-full bg-amber-400 shrink-0" />
                        <p className="font-data text-xs text-amber-700 font-medium uppercase tracking-wide">Active, No Revenue</p>
                      </div>
                      <p className="font-display text-2xl font-semibold text-ink">{activeNoRevenueFlows.length}</p>
                      <p className="font-data text-xs text-ink-3 mt-0.5">receiving traffic</p>
                    </div>

                    {/* Inactive */}
                    <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-1.5 py-0.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
                          <span className="font-data text-xs text-red-600 font-medium uppercase tracking-wide">Inactive</span>
                        </span>
                      </div>
                      <p className="font-display text-2xl font-semibold text-ink">{inactiveFlows.length}</p>
                      <p className="font-data text-xs text-ink-3 mt-0.5">zero recipients</p>
                    </div>
                  </div>

                  {/* AI Flow Insights */}
                  <div className="mt-4">
                    {flowInsightsState === 'idle' && (
                      <button
                        onClick={loadFlowInsights}
                        className="w-full rounded-xl border border-dashed border-cream-3 bg-cream px-4 py-3 text-sm text-ink-3 hover:bg-cream-2 hover:text-ink-2 transition text-left"
                      >
                        <span className="font-medium text-teal-deep">Analyze flow opportunities →</span>
                        <span className="ml-2 text-xs">AI identifies top 3 recovery actions</span>
                      </button>
                    )}
                    {flowInsightsState === 'loading' && (
                      <div className="rounded-xl border border-cream-3 bg-cream px-4 py-4 space-y-2">
                        {[1, 2, 3].map(i => (
                          <div key={i} className="flex gap-3 items-start">
                            <div className="skeleton h-5 w-5 rounded-full shrink-0 mt-0.5" />
                            <div className="flex-1 space-y-1.5">
                              <div className="skeleton h-3 w-2/5" />
                              <div className="skeleton h-3 w-full" />
                              <div className="skeleton h-3 w-3/4" />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {flowInsightsState === 'done' && flowInsights.length > 0 && (
                      <div className="rounded-xl border border-cream-3 bg-white divide-y divide-cream-2 overflow-hidden">
                        {flowInsights.map((insight, i) => {
                          const catColors = {
                            inactive_flows: { dot: 'bg-red-400', badge: 'bg-red-50 text-red-700' },
                            zero_revenue_flows: { dot: 'bg-amber-400', badge: 'bg-amber-50 text-amber-700' },
                            winback_gap: { dot: 'bg-teal', badge: 'bg-teal-pale text-teal-deep' },
                          }
                          const c = catColors[insight.category] ?? catColors.inactive_flows
                          return (
                            <div key={i} className="px-4 py-3.5">
                              <div className="flex items-start gap-3">
                                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${c.dot}`} />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap mb-1">
                                    <span className="font-semibold text-sm text-ink">{insight.title}</span>
                                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${c.badge}`}>
                                      {insight.revenue_opportunity}
                                    </span>
                                  </div>
                                  <p className="text-xs text-ink-2 leading-relaxed mb-1.5">{insight.rationale}</p>
                                  <p className="text-xs font-medium text-teal-deep">→ {insight.action}</p>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                        <div className="px-4 py-2 bg-cream flex justify-end">
                          <button onClick={loadFlowInsights} className="text-xs text-ink-3 hover:text-ink transition">Regenerate</button>
                        </div>
                      </div>
                    )}
                    {flowInsightsState === 'error' && (
                      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
                        Failed to generate analysis. Check your ANTHROPIC_API_KEY.
                      </div>
                    )}
                  </div>
                </div>

                {/* Flows table */}
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-cream-2 text-xs font-medium text-ink-3">
                        <th className="px-5 py-2.5 text-left">Flow Name</th>
                        <th className="px-5 py-2.5 text-left">Ch.</th>
                        <th className="px-5 py-2.5 text-left">Trigger</th>
                        <th className="px-5 py-2.5 text-right">Recipients</th>
                        <th className="px-5 py-2.5 text-right">Open Rate</th>
                        <th className="px-5 py-2.5 text-right">Click Rate</th>
                        <th className="px-5 py-2.5 text-right">Revenue</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-cream-2">
                      {flows.map((f) => {
                        const isInactive = f.recipient_count === 0
                        return (
                          <tr key={f.id} className={`transition-colors ${isInactive ? 'opacity-50 hover:opacity-75' : 'hover:bg-cream'}`}>
                            <td className="px-5 py-3 font-medium text-ink">
                              <div className="flex items-center gap-2">
                                {isInactive && <span className="h-1.5 w-1.5 rounded-full bg-red-400 shrink-0" />}
                                {f.name}
                              </div>
                            </td>
                            <td className="px-5 py-3 whitespace-nowrap"><ChannelBadge channel={f.channel ?? 'email'} /></td>
                            <td className="px-5 py-3 text-xs text-ink-3 capitalize">{f.trigger_type?.replace(/_/g, ' ') ?? '—'}</td>
                            <td className="px-5 py-3 font-data text-xs text-right text-ink-2">{f.recipient_count.toLocaleString()}</td>
                            <td className="px-5 py-3 font-data text-xs text-right text-ink-2">{pct(f.open_rate)}</td>
                            <td className="px-5 py-3 font-data text-xs text-right text-ink-2">{pct(f.click_rate)}</td>
                            <td className="px-5 py-3 font-data text-xs text-right font-medium text-ink">{usd(f.revenue_attributed)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          {/* Broadcast vs Automated — hero comparison */}
          <section className="rounded-2xl bg-charcoal overflow-hidden shadow-lg">
            <div className="px-6 pt-6 pb-2">
              <p className="font-data text-xs uppercase tracking-widest text-white/40 mb-1">Channel Efficiency</p>
              <h2 className="font-display text-xl font-semibold text-white">Broadcast vs Automated</h2>
            </div>

            {/* Central multiplier callout */}
            {rprMultiplier !== null && (
              <div className="flex flex-col items-center py-6 border-y border-white/10 mx-6 my-4">
                <p className="font-display text-7xl font-bold text-teal leading-none">
                  {rprMultiplier.toFixed(1)}×
                </p>
                <p className="mt-2 text-sm text-white/70 text-center max-w-xs">
                  {flowsWin
                    ? 'more revenue per recipient from automated flows vs broadcast campaigns'
                    : 'more revenue per recipient from broadcast campaigns vs automated flows'}
                </p>
              </div>
            )}

            {/* Channel breakdown — 4 columns when SMS data present, 2 otherwise */}
            {(() => {
              const cols = [
                { label: 'Email Campaigns', revenue: emailCampaignRevenue, rpr: emailCampaignRPR, badge: 'Email', color: 'bg-teal-pale text-teal-deep', show: true },
                { label: 'SMS Campaigns', revenue: smsCampaignRevenue, rpr: smsCampaignRPR, badge: 'SMS', color: 'bg-violet-100 text-violet-300', show: hasSmsData },
                { label: 'Email Flows', revenue: emailFlowRevenue, rpr: emailFlowRPR, badge: 'Email', color: 'bg-teal-pale text-teal-deep', show: true },
                { label: 'SMS Flows', revenue: smsFlowRevenue, rpr: smsFlowRPR, badge: 'SMS', color: 'bg-violet-100 text-violet-300', show: hasSmsData },
              ].filter((c) => c.show)
              const bestRPR = Math.max(...cols.map((c) => c.rpr))
              return (
                <div className={`grid gap-px bg-white/10 mx-6 mb-6 rounded-xl overflow-hidden ${cols.length === 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2'}`}>
                  {cols.map((s) => {
                    const isWinner = s.rpr > 0 && s.rpr === bestRPR
                    return (
                      <div key={s.label} className={`px-4 py-4 ${isWinner ? 'bg-teal/20' : 'bg-white/5'}`}>
                        <div className="flex items-center gap-1.5 mb-3">
                          {isWinner && <span className="h-1.5 w-1.5 rounded-full bg-teal shrink-0" />}
                          <p className="font-data text-xs text-white/50 uppercase tracking-wider">{s.label}</p>
                        </div>
                        <p className="font-display text-xl font-semibold text-white mb-0.5">{usd(s.revenue)}</p>
                        <p className={`font-data text-sm font-semibold mb-3 ${isWinner ? 'text-teal' : 'text-white/40'}`}>
                          {usd(s.rpr)}<span className="font-normal text-xs"> / recipient</span>
                        </p>
                        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${isWinner ? 'bg-teal' : 'bg-white/30'}`}
                            style={{ width: `${Math.min(100, (s.rpr / maxRPR) * 100)}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })()}

            <p className="px-6 pb-5 text-xs text-white/40 leading-relaxed">
              {flowsWin
                ? `Flows convert at ${usd(flowRPR)}/recipient vs ${usd(broadcastRPR)}/recipient for broadcasts. Every dollar invested in flow automation returns ${rprMultiplier?.toFixed(1)}× more than a broadcast send.`
                : `Broadcast campaigns outperform flows at ${usd(broadcastRPR)}/recipient vs ${usd(flowRPR)}/recipient. Your list responds strongly to promotional sends.`}
            </p>
          </section>

          {/* AI Insights */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-base font-semibold text-ink">Key Insights</h2>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => router.push(`/dashboard/chat?q=${encodeURIComponent('Analyze my email strategy — which campaigns and flows are performing best, and what should I do differently?')}`)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-teal/25 bg-teal/5 px-3 py-1 text-xs font-medium text-teal hover:bg-teal hover:text-white transition"
                >
                  <svg className="h-3 w-3" viewBox="0 0 12 12" fill="currentColor">
                    <path d="M6 1l1.2 3.8H11l-3 2.2 1.2 3.8L6 8.5l-3.2 2.3L4 7 1 4.8h3.8L6 1z" />
                  </svg>
                  Ask AI about email strategy
                </button>
                {insightsState === 'done' && (
                  <button onClick={loadInsights} className="text-xs text-teal hover:text-teal-dark font-medium transition">
                    Regenerate
                  </button>
                )}
              </div>
            </div>

            {insightsState === 'loading' && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="rounded-xl border border-cream-3 bg-white p-5 shadow-sm">
                    <div className="skeleton h-3 w-1/3 mb-3" />
                    <div className="skeleton h-4 w-2/3 mb-4" />
                    <div className="skeleton h-3 w-full mb-2" />
                    <div className="skeleton h-3 w-4/5" />
                  </div>
                ))}
              </div>
            )}

            {insightsState === 'done' && insights.length > 0 && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {insights.map((insight, i) => (
                  <InsightCard key={i} insight={insight} />
                ))}
              </div>
            )}

            {insightsState === 'idle' && (
              <div className="rounded-xl border border-cream-3 bg-white px-5 py-8 text-center shadow-sm">
                <button onClick={loadInsights} className="rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-dark transition">
                  Generate AI Insights
                </button>
                <p className="mt-2 text-xs text-ink-3">Powered by Claude Haiku</p>
              </div>
            )}

            {insightsState === 'error' && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
                Failed to generate insights. Check your ANTHROPIC_API_KEY is set.
              </div>
            )}
          </section>
        </>
      )}

      {selectedCampaign && (
        <CampaignPanel campaign={selectedCampaign} onClose={() => setSelectedCampaign(null)} />
      )}
    </div>
  )
}
