import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'
import RevenueSection from './RevenueSection'
import AiInsightsBrief, { type ExecutiveInsight } from './AiInsightsBrief'
import AskAiRow from './_components/AskAiRow'
import BusinessHealthScore, { type HealthComponent } from './BusinessHealthScore'
import PlatformHealthRow, { type PlatformCard } from './PlatformHealthRow'
import KeyAlertsPanel, { type Alert } from './KeyAlertsPanel'

export const metadata = { title: 'Executive Summary — Store Signal' }

const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const STORE_ID  = '00000000-0000-0000-0000-000000000002'

function fmt(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount)
}

function fmtK(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

function delta(current: number, prior: number) {
  if (prior === 0) return null
  return ((current - prior) / prior) * 100
}

// ── Health score helpers ───────────────────────────────────────────────────────

function scoreRevenueTrend(revDelta: number | null): number {
  if (revDelta === null) return 0.55
  if (revDelta >= 10) return 1.0
  if (revDelta >= 0) return 0.78
  if (revDelta >= -10) return 0.45
  return 0.15
}

function scoreEmailHealth(openRate: number, connected: boolean): number {
  if (!connected) return -1
  if (openRate >= 0.30) return 1.0
  if (openRate >= 0.20) return 0.75
  if (openRate >= 0.12) return 0.45
  return 0.15
}

function scoreSearchHealth(authorityScore: number | null, connected: boolean): number {
  if (!connected || authorityScore === null) return -1
  if (authorityScore >= 50) return 1.0
  if (authorityScore >= 30) return 0.75
  if (authorityScore >= 15) return 0.45
  return 0.15
}

function scoreAdPerformance(roas: number | null, connected: boolean): number {
  if (!connected || roas === null) return -1
  if (roas >= 4) return 1.0
  if (roas >= 2.5) return 0.75
  if (roas >= 1.5) return 0.45
  return 0.15
}

function scoreSubscriptions(mrr: number, connected: boolean): number {
  if (!connected) return -1
  if (mrr >= 20_000) return 1.0
  if (mrr >= 8_000) return 0.75
  if (mrr >= 2_000) return 0.45
  return 0.15
}

function scoreCustomerRetention(repeatRate: number): number {
  if (repeatRate >= 0.40) return 1.0
  if (repeatRate >= 0.25) return 0.75
  if (repeatRate >= 0.12) return 0.45
  return 0.15
}

function buildHealthScore({
  revDelta,
  klaviyoConnected, avgOpenRate,
  semrushConnected, authorityScore,
  metaConnected, googleAdsConnected, blendedRoas,
  rechargeConnected, mrr,
  repeatCustomerRate,
}: {
  revDelta: number | null
  klaviyoConnected: boolean
  avgOpenRate: number
  semrushConnected: boolean
  authorityScore: number | null
  metaConnected: boolean
  googleAdsConnected: boolean
  blendedRoas: number | null
  rechargeConnected: boolean
  mrr: number
  repeatCustomerRate: number
}): { score: number; components: HealthComponent[]; summary: string } {
  const WEIGHTS = {
    revenue: 25,
    retention: 20,
    email: 15,
    search: 15,
    ads: 15,
    subscriptions: 10,
  }

  const raw = {
    revenue:       { score: scoreRevenueTrend(revDelta), connected: true },
    retention:     { score: scoreCustomerRetention(repeatCustomerRate), connected: true },
    email:         { score: scoreEmailHealth(avgOpenRate, klaviyoConnected), connected: klaviyoConnected },
    search:        { score: scoreSearchHealth(authorityScore, semrushConnected), connected: semrushConnected },
    ads:           { score: scoreAdPerformance(blendedRoas, metaConnected || googleAdsConnected), connected: metaConnected || googleAdsConnected },
    subscriptions: { score: scoreSubscriptions(mrr, rechargeConnected), connected: rechargeConnected },
  }

  // Only count connected platforms, redistribute weight proportionally
  const connectedWeight = Object.entries(raw).reduce((s, [k, v]) => s + (v.connected ? WEIGHTS[k as keyof typeof WEIGHTS] : 0), 0)
  const totalW = connectedWeight > 0 ? connectedWeight : 100

  let weightedSum = 0
  for (const [k, v] of Object.entries(raw)) {
    if (v.connected) {
      const w = WEIGHTS[k as keyof typeof WEIGHTS]
      const normalizedW = (w / totalW) * 100
      weightedSum += v.score * normalizedW
    }
  }

  const score = Math.round(weightedSum)

  // Build components list (show all, connected or not)
  const revPts = Math.round(raw.revenue.score * WEIGHTS.revenue)
  const retPts = Math.round(raw.retention.score * WEIGHTS.retention)
  const emailPts = klaviyoConnected ? Math.round(raw.email.score * WEIGHTS.email) : 0
  const searchPts = semrushConnected ? Math.round(raw.search.score * WEIGHTS.search) : 0
  const adsPts = (metaConnected || googleAdsConnected) ? Math.round(raw.ads.score * WEIGHTS.ads) : 0
  const subPts = rechargeConnected ? Math.round(raw.subscriptions.score * WEIGHTS.subscriptions) : 0

  const components: HealthComponent[] = [
    { name: 'Revenue Trend',      pts: revPts,    maxPts: WEIGHTS.revenue,       description: `30-day vs prior 30-day` },
    { name: 'Customer Retention', pts: retPts,    maxPts: WEIGHTS.retention,     description: `Repeat purchase rate` },
    { name: 'Email Health',       pts: emailPts,  maxPts: klaviyoConnected ? WEIGHTS.email : 0,         description: klaviyoConnected ? `Open rate & engagement` : 'Connect Klaviyo' },
    { name: 'Search Health',      pts: searchPts, maxPts: semrushConnected ? WEIGHTS.search : 0,        description: semrushConnected ? `Authority & keyword health` : 'Connect SEMrush' },
    { name: 'Ad Performance',     pts: adsPts,    maxPts: (metaConnected || googleAdsConnected) ? WEIGHTS.ads : 0, description: (metaConnected || googleAdsConnected) ? `Blended ROAS` : 'Connect Meta or Google Ads' },
    { name: 'Subscriptions',      pts: subPts,    maxPts: rechargeConnected ? WEIGHTS.subscriptions : 0, description: rechargeConnected ? `MRR & subscriber base` : 'Connect Recharge' },
  ].filter((c) => c.maxPts > 0)

  // One-line summary
  const weakest = components.filter((c) => c.maxPts > 0).sort((a, b) => (a.pts / a.maxPts) - (b.pts / b.maxPts))[0]
  let summary = 'Business is performing across all connected platforms.'
  if (score >= 70) {
    summary = 'Strong performance across connected platforms — momentum is positive.'
  } else if (score >= 40) {
    summary = weakest
      ? `Opportunity to improve ${weakest.name.toLowerCase()} — ${weakest.description.toLowerCase()}.`
      : 'Some platforms need attention — review the alerts panel.'
  } else {
    summary = weakest
      ? `${weakest.name} requires immediate attention to improve overall health.`
      : 'Multiple areas need attention — prioritise high-impact fixes first.'
  }

  return { score, components, summary }
}

// ── Build alerts ───────────────────────────────────────────────────────────────

function buildAlerts({
  revDelta,
  blendedRoas,
  avgOpenRate,
  klaviyoConnected,
  metaConnected,
  googleAdsConnected,
  mrr,
  rechargeConnected,
  currRevenue,
  lapsedRate,
}: {
  revDelta: number | null
  blendedRoas: number | null
  avgOpenRate: number
  klaviyoConnected: boolean
  metaConnected: boolean
  googleAdsConnected: boolean
  mrr: number
  rechargeConnected: boolean
  currRevenue: number
  lapsedRate: number
}): Alert[] {
  const alerts: Alert[] = []

  if (revDelta !== null && revDelta < -20) {
    alerts.push({ level: 'red', title: `Revenue down ${Math.abs(revDelta).toFixed(1)}%`, description: 'Significant revenue decline vs prior 30 days — review channel performance and consider a promotion.', href: '/dashboard/shopify', linkLabel: 'View Shopify →' })
  } else if (revDelta !== null && revDelta < -10) {
    alerts.push({ level: 'amber', title: `Revenue down ${Math.abs(revDelta).toFixed(1)}%`, description: 'Revenue declining vs prior period — monitor closely and consider running a promotion.', href: '/dashboard/promotions', linkLabel: 'Score a promotion →' })
  } else if (revDelta !== null && revDelta > 15) {
    alerts.push({ level: 'green', title: `Revenue up ${revDelta.toFixed(1)}%`, description: `Strong revenue growth of ${fmt(currRevenue)} this period — momentum is positive.` })
  }

  if ((metaConnected || googleAdsConnected) && blendedRoas !== null && blendedRoas < 1) {
    alerts.push({ level: 'red', title: 'Ads losing money (ROAS < 1)', description: 'Blended ad ROAS is below break-even — pause underperforming campaigns immediately.', href: '/dashboard/advertising', linkLabel: 'Review ads →' })
  } else if ((metaConnected || googleAdsConnected) && blendedRoas !== null && blendedRoas >= 4) {
    alerts.push({ level: 'green', title: `Strong ROAS ${blendedRoas.toFixed(1)}x`, description: 'Ad campaigns are performing above benchmark — consider scaling budget on top campaigns.', href: '/dashboard/advertising' })
  }

  if (klaviyoConnected && avgOpenRate > 0 && avgOpenRate < 0.10) {
    alerts.push({ level: 'red', title: 'Email open rate critically low', description: `${(avgOpenRate * 100).toFixed(1)}% open rate is well below industry average (20%). Review list hygiene and subject lines.`, href: '/dashboard/klaviyo', linkLabel: 'View email →' })
  } else if (klaviyoConnected && avgOpenRate > 0 && avgOpenRate < 0.15) {
    alerts.push({ level: 'amber', title: 'Email open rate below average', description: `${(avgOpenRate * 100).toFixed(1)}% open rate — test new subject lines and review sending cadence.`, href: '/dashboard/klaviyo' })
  }

  if (lapsedRate > 0.35) {
    alerts.push({ level: 'amber', title: 'High lapsed customer rate', description: `${(lapsedRate * 100).toFixed(0)}% of customers haven't ordered in 90+ days — consider a win-back campaign.`, href: '/dashboard/customers', linkLabel: 'View customers →' })
  }

  if (rechargeConnected && mrr > 5000) {
    alerts.push({ level: 'green', title: `MRR at ${fmt(mrr)}`, description: 'Subscription revenue is a strong foundation — review churn and upsell opportunities.', href: '/dashboard/subscriptions' })
  }

  return alerts
}

// ── Platform card builder ──────────────────────────────────────────────────────

function buildPlatformCards({
  currRevenue, revDelta, currency,
  klaviyoConnected, avgOpenRate, emailRevenue,
  metaConnected, metaSpend, metaRoas,
  googleAdsConnected, googleRoas,
  gscConnected, totalGscClicks,
  semrushConnected, semrushData,
  rechargeConnected, activeSubs, mrr,
  ga4Connected, totalSessions, convRate,
}: {
  currRevenue: number; revDelta: number | null; currency: string
  klaviyoConnected: boolean; avgOpenRate: number; emailRevenue: number
  metaConnected: boolean; metaSpend: number; metaRoas: number | null
  googleAdsConnected: boolean; googleRoas: number | null
  gscConnected: boolean; totalGscClicks: number
  semrushConnected: boolean; semrushData: { authority_score: number | null; organic_keywords_total: number | null } | null
  rechargeConnected: boolean; activeSubs: number; mrr: number
  ga4Connected: boolean; totalSessions: number; convRate: number
}): PlatformCard[] {
  const shopifyIcon = <svg viewBox="0 0 20 20" fill="currentColor"><path d="M14.5 2.5c-.1-.6-.6-1-1.2-1.1-.5 0-1.1.1-1.7.3C11.1.7 10.2 0 8.9 0 7.5 0 6.8 1 6.5 1.8c-.9.2-1.5.4-1.6.4C4 2.6 4 2.7 4 2.7L2 16.2l10.6 2L18 17l-3.5-14.5zM10 1.8c.7 0 1.3.3 1.7.9-.8.2-1.6.5-2.5.7C9.4 2.6 9.7 1.8 10 1.8z"/></svg>
  const emailIcon = <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="4" width="16" height="12" rx="2"/><path d="M2 7l8 5 8-5"/></svg>
  const metaIcon = <svg viewBox="0 0 20 20" fill="currentColor"><path d="M10 2C5.6 2 2 5.6 2 10s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zm-1 11.4L5 9.8l1.4-1.4 2.6 2.6 5.6-5.6L16 6.8 9 13.4z"/></svg>
  const googleIcon = <svg viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a8 8 0 1 0 0 16A8 8 0 0 0 10 2zm0 14.4A6.4 6.4 0 1 1 10 3.6a6.4 6.4 0 0 1 0 12.8z"/><path d="M10 6v4l3 3-1 1-3.5-3.5V6h1.5z"/></svg>
  const searchIcon = <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="9" cy="9" r="6"/><path d="M14 14l3.5 3.5"/></svg>
  const semrushIcon = <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="9" cy="9" r="5"/><path d="M13 13l4 4M6 9h6M9 6v6"/></svg>
  const rechargeIcon = <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 10a6 6 0 1 1 12 0" strokeLinecap="round"/><path d="M10 4V2M13.2 5.8l1.4-1.4M6.8 5.8 5.4 4.4" strokeLinecap="round"/><path d="M8 13l2 3 2-3" strokeLinecap="round" strokeLinejoin="round"/></svg>
  const analyticsIcon = <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 16V9l4-5 4 3 4-6 4 4v11" strokeLinecap="round" strokeLinejoin="round"/><path d="M2 16h16" strokeLinecap="round"/></svg>

  const trend = (d: number | null): 'up' | 'down' | 'neutral' =>
    d === null ? 'neutral' : d > 0 ? 'up' : d < 0 ? 'down' : 'neutral'

  return [
    {
      id: 'shopify',
      name: 'Shopify',
      connected: true,
      href: '/dashboard/shopify',
      metric1Label: 'Revenue (30d)',
      metric1Value: fmt(currRevenue, currency),
      metric2Label: 'vs prior 30d',
      metric2Value: revDelta !== null ? `${revDelta >= 0 ? '+' : ''}${revDelta.toFixed(1)}%` : '—',
      trend: trend(revDelta),
      trendValue: revDelta !== null ? `${Math.abs(revDelta).toFixed(1)}%` : undefined,
      color: '#96BF48/15',
      textColor: '#4a6b1a',
      icon: shopifyIcon,
    },
    {
      id: 'klaviyo',
      name: 'Email / Klaviyo',
      connected: klaviyoConnected,
      href: '/dashboard/klaviyo',
      connectHref: '/dashboard/integrations',
      metric1Label: 'Open Rate',
      metric1Value: klaviyoConnected && avgOpenRate > 0 ? `${(avgOpenRate * 100).toFixed(1)}%` : '—',
      metric2Label: 'Email Revenue',
      metric2Value: klaviyoConnected ? fmt(emailRevenue) : '—',
      trend: klaviyoConnected && avgOpenRate >= 0.20 ? 'up' : klaviyoConnected && avgOpenRate < 0.12 ? 'down' : 'neutral',
      color: 'bg-orange-50',
      textColor: '#c2410c',
      icon: emailIcon,
    },
    {
      id: 'meta',
      name: 'Meta Ads',
      connected: metaConnected,
      href: '/dashboard/meta',
      connectHref: '/dashboard/integrations',
      metric1Label: 'ROAS',
      metric1Value: metaConnected && metaRoas !== null ? `${metaRoas.toFixed(1)}x` : '—',
      metric2Label: 'Spend (90d)',
      metric2Value: metaConnected ? fmt(metaSpend) : '—',
      trend: metaConnected && metaRoas !== null ? (metaRoas >= 2.5 ? 'up' : metaRoas < 1.5 ? 'down' : 'neutral') : 'neutral',
      color: 'bg-blue-50',
      textColor: '#1d4ed8',
      icon: metaIcon,
    },
    {
      id: 'google-ads',
      name: 'Google Ads',
      connected: googleAdsConnected,
      href: '/dashboard/google-ads',
      connectHref: '/dashboard/integrations',
      metric1Label: 'ROAS',
      metric1Value: googleAdsConnected && googleRoas !== null ? `${googleRoas.toFixed(1)}x` : '—',
      trend: googleAdsConnected && googleRoas !== null ? (googleRoas >= 2.5 ? 'up' : googleRoas < 1.5 ? 'down' : 'neutral') : 'neutral',
      color: 'bg-yellow-50',
      textColor: '#b45309',
      icon: googleIcon,
    },
    {
      id: 'gsc',
      name: 'Search Console',
      connected: gscConnected,
      href: '/dashboard/search',
      connectHref: '/dashboard/integrations',
      metric1Label: 'Clicks (90d)',
      metric1Value: gscConnected ? fmtK(totalGscClicks) : '—',
      trend: 'neutral',
      color: 'bg-[#4285F4]/10',
      textColor: '#4285F4',
      icon: searchIcon,
    },
    {
      id: 'semrush',
      name: 'SEO / SEMrush',
      connected: semrushConnected,
      href: '/dashboard/semrush',
      connectHref: '/dashboard/integrations',
      metric1Label: 'Authority Score',
      metric1Value: semrushConnected && semrushData?.authority_score != null ? String(semrushData.authority_score) : '—',
      metric2Label: 'Organic Keywords',
      metric2Value: semrushConnected && semrushData?.organic_keywords_total != null ? fmtK(semrushData.organic_keywords_total) : '—',
      trend: 'neutral',
      color: 'bg-[#FF642D]/10',
      textColor: '#FF642D',
      icon: semrushIcon,
    },
    {
      id: 'recharge',
      name: 'Subscriptions',
      connected: rechargeConnected,
      href: '/dashboard/subscriptions',
      connectHref: '/dashboard/integrations',
      metric1Label: 'MRR',
      metric1Value: rechargeConnected ? fmt(mrr) : '—',
      metric2Label: 'Active Subs',
      metric2Value: rechargeConnected ? activeSubs.toLocaleString() : '—',
      trend: 'neutral',
      color: 'bg-teal-pale',
      textColor: '#0d9488',
      icon: rechargeIcon,
    },
    {
      id: 'ga4',
      name: 'Analytics / GA4',
      connected: ga4Connected,
      href: '/dashboard/analytics',
      connectHref: '/dashboard/integrations',
      metric1Label: 'Sessions (90d)',
      metric1Value: ga4Connected ? fmtK(totalSessions) : '—',
      metric2Label: 'Conv. Rate',
      metric2Value: ga4Connected && convRate > 0 ? `${(convRate * 100).toFixed(1)}%` : '—',
      trend: 'neutral',
      color: 'bg-[#E37400]/10',
      textColor: '#E37400',
      icon: analyticsIcon,
    },
  ]
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient()
  const service  = createSupabaseServiceClient()

  const now = new Date()
  const thirtyDaysAgo = new Date(now); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const sixtyDaysAgo  = new Date(now); sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

  const [
    { data: currentRows },
    { data: priorRows },
    { data: storeRow },
    { data: klaviyoMetricsRows },
    { data: channelRows },
    { data: execInsightsCache },
    { data: metricsCache },
    { data: semrushCache },
    { data: metaCampaigns },
    { data: googleCampaigns },
    { data: gscClicks },
    { data: rechargeSubs },
    { data: analyticsMetrics },
    { data: analyticsSessions },
    { data: customerProfiles },
  ] = await Promise.all([
    supabase.from('orders').select('total_price, currency, processed_at').eq('financial_status', 'paid').gte('processed_at', thirtyDaysAgo.toISOString()),
    supabase.from('orders').select('total_price').eq('financial_status', 'paid').gte('processed_at', sixtyDaysAgo.toISOString()).lt('processed_at', thirtyDaysAgo.toISOString()),
    supabase.from('stores').select('klaviyo_api_key, semrush_api_key, gsc_refresh_token, ga4_refresh_token, meta_access_token, google_ads_refresh_token, recharge_api_token').eq('id', STORE_ID).single(),
    supabase.from('klaviyo_metrics_cache').select('metric_name, metric_value').eq('tenant_id', TENANT_ID),
    supabase.from('sales_channel_cache').select('channel_name, revenue, order_count, avg_order_value').eq('tenant_id', TENANT_ID).eq('period', 'last_30d'),
    service.from('executive_insights_cache').select('insights, calculated_at').eq('tenant_id', TENANT_ID).maybeSingle(),
    service.from('metrics_cache').select('metric_name, metric_value, metric_metadata').eq('store_id', STORE_ID).in('metric_name', ['revenue_by_month', 'customer_count']),
    service.from('semrush_metrics_cache').select('organic_keywords_total, organic_traffic_estimate, authority_score, calculated_at').eq('tenant_id', TENANT_ID).maybeSingle(),
    service.from('meta_campaigns').select('spend, purchase_value, roas').eq('tenant_id', TENANT_ID),
    service.from('google_campaigns').select('cost, conversions_value, roas').eq('tenant_id', TENANT_ID),
    service.from('gsc_keywords').select('clicks').eq('tenant_id', TENANT_ID),
    service.from('recharge_subscriptions').select('status, price, order_interval_unit, charge_interval_frequency').eq('tenant_id', TENANT_ID).eq('status', 'active'),
    service.from('analytics_metrics_cache').select('metric_name, metric_value').eq('tenant_id', TENANT_ID),
    service.from('analytics_sessions').select('sessions, conversions').eq('tenant_id', TENANT_ID).eq('date_range', '90d'),
    service.from('customer_profiles').select('segment').eq('tenant_id', TENANT_ID),
  ])

  // ── Connection flags ─────────────────────────────────────────────────────────
  const klaviyoConnected  = !!storeRow?.klaviyo_api_key
  const semrushConnected  = !!storeRow?.semrush_api_key
  const gscConnected      = !!storeRow?.gsc_refresh_token
  const ga4Connected      = !!storeRow?.ga4_refresh_token
  const metaConnected     = !!storeRow?.meta_access_token
  const googleAdsConnected = !!storeRow?.google_ads_refresh_token
  const rechargeConnected = !!storeRow?.recharge_api_token

  // ── Revenue ──────────────────────────────────────────────────────────────────
  const curr = currentRows ?? []
  const prior = priorRows ?? []
  const currRevenue = curr.reduce((s, r) => s + Number(r.total_price), 0)
  const priorRevenue = prior.reduce((s, r) => s + Number(r.total_price), 0)
  const currCount = curr.length
  const priorCount = prior.length
  const currAOV = currCount > 0 ? currRevenue / currCount : 0
  const priorAOV = priorCount > 0 ? priorRevenue / priorCount : 0
  const currency = curr[0]?.currency ?? 'USD'
  const revDelta   = delta(currRevenue, priorRevenue)
  const countDelta = delta(currCount, priorCount)
  const aovDelta   = delta(currAOV, priorAOV)

  // ── Chart data ───────────────────────────────────────────────────────────────
  type CachedMonth = { month: string; revenue: number }
  const cachedMonthlyRow = (metricsCache ?? []).find((r) => r.metric_name === 'revenue_by_month')
  const cachedCustomerRow = (metricsCache ?? []).find((r) => r.metric_name === 'customer_count')
  const totalCustomers = cachedCustomerRow ? Number(cachedCustomerRow.metric_value) : null
  const cachedMonths: CachedMonth[] = (cachedMonthlyRow?.metric_metadata as { data?: CachedMonth[] } | null)?.data ?? []
  const cachedByKey = new Map(cachedMonths.map((m) => [m.month, m.revenue]))
  const chartData: CachedMonth[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now)
    d.setMonth(d.getMonth() - i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    chartData.push({ month: key, revenue: cachedByKey.get(key) ?? 0 })
  }

  // ── Klaviyo metrics ──────────────────────────────────────────────────────────
  const kvMetrics: Record<string, number> = {}
  for (const row of klaviyoMetricsRows ?? []) kvMetrics[row.metric_name] = Number(row.metric_value)
  const emailRevenue = kvMetrics['email_revenue_total'] ?? 0
  const avgOpenRate  = kvMetrics['avg_campaign_open_rate'] ?? 0

  // ── Meta ads ─────────────────────────────────────────────────────────────────
  const metaTotalSpend = (metaCampaigns ?? []).reduce((s, c) => s + Number(c.spend), 0)
  const metaTotalPV    = (metaCampaigns ?? []).reduce((s, c) => s + Number(c.purchase_value), 0)
  const metaRoas = metaTotalSpend > 0 ? metaTotalPV / metaTotalSpend : null

  // ── Google Ads ───────────────────────────────────────────────────────────────
  const googleTotalCost = (googleCampaigns ?? []).reduce((s, c) => s + Number(c.cost), 0)
  const googleTotalCV   = (googleCampaigns ?? []).reduce((s, c) => s + Number(c.conversions_value), 0)
  const googleRoas = googleTotalCost > 0 ? googleTotalCV / googleTotalCost : null

  // Blended ROAS across connected ad platforms
  const blendedAdSpend = (metaConnected ? metaTotalSpend : 0) + (googleAdsConnected ? googleTotalCost : 0)
  const blendedAdValue = (metaConnected ? metaTotalPV : 0) + (googleAdsConnected ? googleTotalCV : 0)
  const blendedRoas = blendedAdSpend > 0 ? blendedAdValue / blendedAdSpend : null

  // ── GSC ──────────────────────────────────────────────────────────────────────
  const totalGscClicks = (gscClicks ?? []).reduce((s, k) => s + (k.clicks ?? 0), 0)

  // ── SEMrush ──────────────────────────────────────────────────────────────────
  const semrushData = semrushCache as { authority_score: number | null; organic_keywords_total: number | null; organic_traffic_estimate: number | null } | null

  // ── Recharge ─────────────────────────────────────────────────────────────────
  const activeSubs = (rechargeSubs ?? []).length
  let mrr = 0
  for (const sub of rechargeSubs ?? []) {
    const price = Number(sub.price) || 0
    const freq  = sub.charge_interval_frequency ?? 1
    const unit  = (sub.order_interval_unit ?? 'month') as string
    let monthly = price
    if (unit === 'week') monthly = price * (52 / 12) / freq
    else if (unit === 'day') monthly = price * (365 / 12) / freq
    mrr += monthly
  }

  // ── GA4 ──────────────────────────────────────────────────────────────────────
  const ga4Metrics: Record<string, number> = {}
  for (const r of analyticsMetrics ?? []) ga4Metrics[r.metric_name] = Number(r.metric_value)
  const totalSessions = (analyticsSessions ?? []).reduce((s, r) => s + (r.sessions ?? 0), 0)
  const totalConversions = (analyticsSessions ?? []).reduce((s, r) => s + (r.conversions ?? 0), 0)
  const convRate = totalSessions > 0 ? totalConversions / totalSessions : 0

  // ── Customer profiles ─────────────────────────────────────────────────────────
  const profiles = customerProfiles ?? []
  const lapsedCount  = profiles.filter((p) => p.segment === 'lapsed' || p.segment === 'at_risk').length
  const lapsedRate   = profiles.length > 0 ? lapsedCount / profiles.length : 0
  const repeatRate   = profiles.length > 0 ? profiles.filter((p) => p.segment !== 'new').length / profiles.length : 0.25

  // ── Health score ─────────────────────────────────────────────────────────────
  const { score: healthScore, components: healthComponents, summary: healthSummary } = buildHealthScore({
    revDelta,
    klaviyoConnected, avgOpenRate,
    semrushConnected, authorityScore: semrushData?.authority_score ?? null,
    metaConnected, googleAdsConnected, blendedRoas,
    rechargeConnected, mrr,
    repeatCustomerRate: repeatRate,
  })

  // ── Alerts ───────────────────────────────────────────────────────────────────
  const alerts = buildAlerts({
    revDelta, blendedRoas, avgOpenRate, klaviyoConnected,
    metaConnected, googleAdsConnected, mrr, rechargeConnected,
    currRevenue, lapsedRate,
  })

  // ── Platform cards ───────────────────────────────────────────────────────────
  const platformCards = buildPlatformCards({
    currRevenue, revDelta, currency,
    klaviyoConnected, avgOpenRate, emailRevenue,
    metaConnected, metaSpend: metaTotalSpend, metaRoas,
    googleAdsConnected, googleRoas,
    gscConnected, totalGscClicks,
    semrushConnected, semrushData,
    rechargeConnected, activeSubs, mrr,
    ga4Connected, totalSessions, convRate,
  })

  return (
    <div className="space-y-5">
      {/* 1. AI Intelligence Brief — most valuable, at top */}
      <AiInsightsBrief
        cachedInsights={(execInsightsCache?.insights as ExecutiveInsight[] | null) ?? null}
        calculatedAt={execInsightsCache?.calculated_at ?? null}
      />

      {/* 2. Business Health Score */}
      <BusinessHealthScore
        score={healthScore}
        components={healthComponents}
        summary={healthSummary}
        calculatedAt={now.toISOString()}
      />

      {/* 3. Platform Health Row */}
      <PlatformHealthRow platforms={platformCards} />

      {/* 4. Revenue Overview + Key Alerts */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RevenueSection monthlyData={chartData} channelData30d={channelRows ?? []} />
        </div>
        <div>
          <KeyAlertsPanel alerts={alerts} />
        </div>
      </div>

      {/* 5. Quick Metrics Row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MetricCard label="Revenue (30d)" value={fmt(currRevenue, currency)} delta={revDelta} sub="paid orders" />
        <MetricCard label="Orders (30d)"  value={currCount.toLocaleString()} delta={countDelta} sub="paid orders" />
        <MetricCard label="Total Customers" value={totalCustomers !== null ? totalCustomers.toLocaleString() : '—'} delta={null} sub="all time" noAnimation />
        <MetricCard label={rechargeConnected ? 'MRR' : 'Avg. Order Value'} value={rechargeConnected ? fmt(mrr) : fmt(currAOV, currency)} delta={rechargeConnected ? null : aovDelta} sub={rechargeConnected ? 'subscriptions' : 'paid orders'} />
      </div>

      {/* 6. Ask AI */}
      <AskAiRow
        label="Ask AI"
        prompts={[
          'Why did revenue change this month?',
          'Who should I focus on retaining?',
          "What's my biggest opportunity right now?",
        ]}
      />
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function MetricCard({ label, value, delta: d, sub, noAnimation }: {
  label: string; value: string; delta: number | null; sub: string; noAnimation?: boolean
}) {
  const isPos = d !== null && d >= 0
  return (
    <div className="rounded-2xl border border-cream-3 bg-white px-5 py-5 shadow-sm">
      <p className="font-data text-xs uppercase tracking-wider text-ink-3">{label}</p>
      <p className={`mt-2 font-display text-2xl font-semibold text-ink ${noAnimation ? '' : 'animate-count-up'}`}>
        {value}
      </p>
      <div className="mt-1.5 flex items-center gap-1.5">
        {d !== null && (
          <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${isPos ? 'text-teal-deep' : 'text-red-500'}`}>
            <svg className="h-3 w-3" viewBox="0 0 12 12" fill="currentColor">
              {isPos ? <path d="M6 2l4 6H2l4-6z" /> : <path d="M6 10L2 4h8l-4 6z" />}
            </svg>
            {Math.abs(d).toFixed(1)}%
          </span>
        )}
        <span className="text-xs text-ink-3">{sub}</span>
      </div>
    </div>
  )
}
