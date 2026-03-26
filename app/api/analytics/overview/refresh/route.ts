import { NextRequest } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'

export const maxDuration = 60

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

export async function POST(_req: NextRequest) {
  // Allow cron auth bypass so the daily-analysis cron can call this route directly.
  const isCron = _req.headers.get('Authorization') === `Bearer ${process.env.CRON_SECRET ?? ''}`
  if (!isCron) {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const service = createSupabaseServiceClient()

  // ── Fetch GA4 + SEMrush data in parallel ─────────────────────────────────
  const [
    { data: sessions },
    { data: monthly },
    { data: metricsRows },
    { data: semrushMetrics },
    { data: keywords },
    { data: keywordGaps },
  ] = await Promise.all([
    service.from('analytics_sessions').select('channel, sessions, conversions, revenue').eq('tenant_id', TENANT_ID).eq('date_range', '90d').order('sessions', { ascending: false }),
    service.from('analytics_monthly').select('month, sessions').eq('tenant_id', TENANT_ID).order('month', { ascending: true }),
    service.from('analytics_metrics_cache').select('metric_name, metric_value').eq('tenant_id', TENANT_ID),
    service.from('semrush_metrics_cache').select('*').eq('tenant_id', TENANT_ID).maybeSingle(),
    service.from('semrush_keywords').select('keyword, position, search_volume, traffic_percent').eq('tenant_id', TENANT_ID).order('traffic_percent', { ascending: false }).limit(100),
    service.from('semrush_keyword_gaps').select('keyword, competitor_domain, competitor_position, our_position, search_volume, opportunity_score').eq('tenant_id', TENANT_ID).order('search_volume', { ascending: false }).limit(20),
  ])

  const ga4Metrics: Record<string, number> = {}
  for (const r of metricsRows ?? []) ga4Metrics[r.metric_name] = Number(r.metric_value)

  // ── Traffic Health Score (0-100) ─────────────────────────────────────────
  // Based on: MoM session trend, conversion rate, channel diversity
  let trafficHealthScore = 50 // baseline

  const last2 = (monthly ?? []).slice(-2)
  if (last2.length === 2 && last2[0].sessions > 0) {
    const momPct = ((last2[1].sessions - last2[0].sessions) / last2[0].sessions) * 100
    if (momPct > 10) trafficHealthScore += 20
    else if (momPct > 0) trafficHealthScore += 10
    else if (momPct > -10) trafficHealthScore -= 5
    else trafficHealthScore -= 20
  }

  const cvr = ga4Metrics['ga4_conversion_rate_90d'] ?? 0
  if (cvr >= 3) trafficHealthScore += 20
  else if (cvr >= 1.5) trafficHealthScore += 10
  else if (cvr >= 0.5) trafficHealthScore += 0
  else trafficHealthScore -= 15

  const channelCount = (sessions ?? []).length
  if (channelCount >= 5) trafficHealthScore += 10
  else if (channelCount >= 3) trafficHealthScore += 5
  else if (channelCount <= 1) trafficHealthScore -= 10

  trafficHealthScore = Math.max(0, Math.min(100, trafficHealthScore))

  // ── Organic Visibility Score (0-100) ─────────────────────────────────────
  // Based on: SEMrush authority score, top 10 keyword % , keyword count
  let organicVisibilityScore = 30 // baseline

  if (semrushMetrics) {
    const authorityScore = semrushMetrics.authority_score ?? 0
    organicVisibilityScore = Math.round(authorityScore * 0.6) // authority is 0-100, weight it 60%

    const kwCount = semrushMetrics.organic_keywords_total ?? 0
    if (kwCount > 1000) organicVisibilityScore += 20
    else if (kwCount > 500) organicVisibilityScore += 15
    else if (kwCount > 100) organicVisibilityScore += 10
    else if (kwCount > 50) organicVisibilityScore += 5

    const top10kws = (keywords ?? []).filter((k) => k.position <= 10)
    const top10pct = (keywords ?? []).length > 0 ? (top10kws.length / (keywords ?? []).length) * 100 : 0
    if (top10pct >= 30) organicVisibilityScore += 20
    else if (top10pct >= 15) organicVisibilityScore += 10
    else if (top10pct >= 5) organicVisibilityScore += 5
  }

  organicVisibilityScore = Math.max(0, Math.min(100, organicVisibilityScore))

  // ── Traffic-to-Revenue Efficiency ─────────────────────────────────────────
  const totalSessions = (sessions ?? []).reduce((s, r) => s + r.sessions, 0)
  const totalRevenue = ga4Metrics['ga4_revenue_90d'] ?? 0
  const trafficToRevenueEfficiency = totalSessions > 0 ? totalRevenue / totalSessions : 0

  // ── Paid vs Organic Balance ───────────────────────────────────────────────
  const paidSessions = (sessions ?? []).filter((s) => s.channel?.toLowerCase().includes('paid')).reduce((sum, s) => sum + s.sessions, 0)
  const paidVsOrganicBalance = totalSessions > 0 ? paidSessions / totalSessions : 0

  // ── Search Capture Rate ───────────────────────────────────────────────────
  const organicKeywordsTotal = semrushMetrics?.organic_keywords_total ?? 0
  const searchCaptureRate = organicKeywordsTotal > 0 && (semrushMetrics?.organic_traffic_monthly ?? 0) > 0
    ? Math.min(1, (semrushMetrics?.organic_traffic_monthly ?? 0) / Math.max(organicKeywordsTotal * 10, 1))
    : 0

  // ── Blended Monthly Data ──────────────────────────────────────────────────
  const blendedMonthlyData = (monthly ?? []).map((m) => ({
    month: m.month,
    sessions: m.sessions,
    semrush_traffic: 0, // Would need monthly SEMrush data; omit for now
  }))

  // ── Top Opportunities ─────────────────────────────────────────────────────
  const topOpportunities = (keywordGaps ?? []).slice(0, 10).map((g) => ({
    keyword: g.keyword,
    competitor_domain: g.competitor_domain,
    competitor_position: g.competitor_position,
    our_position: g.our_position,
    search_volume: g.search_volume,
    opportunity_score: g.opportunity_score,
  }))

  // ── Save to cache ─────────────────────────────────────────────────────────
  const { error } = await service.from('analytics_overview_cache').upsert({
    tenant_id: TENANT_ID,
    traffic_health_score: trafficHealthScore,
    organic_visibility_score: organicVisibilityScore,
    traffic_to_revenue_efficiency: trafficToRevenueEfficiency,
    paid_vs_organic_balance: paidVsOrganicBalance,
    search_capture_rate: searchCaptureRate,
    blended_monthly_data: blendedMonthlyData,
    top_opportunities: topOpportunities,
    calculated_at: new Date().toISOString(),
  }, { onConflict: 'tenant_id' })

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({
    ok: true,
    traffic_health_score: trafficHealthScore,
    organic_visibility_score: organicVisibilityScore,
  })
}
