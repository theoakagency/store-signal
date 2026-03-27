import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import AnalyticsOverviewDashboard from './AnalyticsOverviewDashboard'
import DataCoverageBar, { COVERAGE } from '../_components/DataCoverageBar'

export const metadata = { title: 'Analytics Overview — Store Signal' }

const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const STORE_ID  = '00000000-0000-0000-0000-000000000002'

export default async function AnalyticsOverviewPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createSupabaseServiceClient()

  const [
    { data: store },
    { data: overviewCache },
    { data: insightsCache },
    { data: sessions },
    { data: monthly },
    { data: metricsRows },
    { data: semrushMetrics },
    { data: keywords },
    { data: keywordGaps },
  ] = await Promise.all([
    service.from('stores').select('ga4_refresh_token, semrush_api_key, semrush_domain').eq('id', STORE_ID).single(),
    service.from('analytics_overview_cache').select('*').eq('tenant_id', TENANT_ID).maybeSingle(),
    service.from('analytics_insights_cache').select('insights, calculated_at').eq('tenant_id', TENANT_ID).maybeSingle(),
    service.from('analytics_sessions').select('channel, sessions, conversions, revenue').eq('tenant_id', TENANT_ID).eq('date_range', '90d').order('sessions', { ascending: false }),
    service.from('analytics_monthly').select('month, sessions').eq('tenant_id', TENANT_ID).order('month', { ascending: true }),
    service.from('analytics_metrics_cache').select('metric_name, metric_value').eq('tenant_id', TENANT_ID),
    service.from('semrush_metrics_cache').select('*').eq('tenant_id', TENANT_ID).maybeSingle(),
    service.from('semrush_keywords').select('keyword, position, search_volume, traffic_percent').eq('tenant_id', TENANT_ID).order('traffic_percent', { ascending: false }).limit(50),
    service.from('semrush_keyword_gaps').select('keyword, competitor_domain, competitor_position, our_position, search_volume, opportunity_score').eq('tenant_id', TENANT_ID).order('search_volume', { ascending: false }).limit(20),
  ])

  const ga4Connected = !!store?.ga4_refresh_token
  const semrushConnected = !!store?.semrush_api_key

  const ga4Metrics: Record<string, number> = {}
  for (const r of metricsRows ?? []) ga4Metrics[r.metric_name] = Number(r.metric_value)

  const aoCoveragePlatforms = [
    ...(ga4Connected ? [COVERAGE.ga4] : []),
    ...(semrushConnected ? [COVERAGE.semrush] : []),
  ]

  return (
    <>
      {aoCoveragePlatforms.length > 0 && <div className="mb-1"><DataCoverageBar platforms={aoCoveragePlatforms} /></div>}
      <AnalyticsOverviewDashboard
      ga4Connected={ga4Connected}
      semrushConnected={semrushConnected}
      domain={store?.semrush_domain ?? null}
      overviewCache={overviewCache ?? null}
      cachedInsights={(insightsCache?.insights as { title: string; description: string; action: string; impact: string; category: string }[] | null) ?? null}
      insightsCachedAt={insightsCache?.calculated_at ?? null}
      sessions={sessions ?? []}
      monthly={monthly ?? []}
      ga4Metrics={ga4Metrics}
      semrushMetrics={semrushMetrics ?? null}
      keywords={keywords ?? []}
      keywordGaps={keywordGaps ?? []}
      />
    </>
  )
}
