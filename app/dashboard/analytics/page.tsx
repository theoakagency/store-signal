import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'
import AnalyticsDashboard from './AnalyticsDashboard'
import DataCoverageBar, { COVERAGE } from '../_components/DataCoverageBar'

export const metadata = { title: 'Analytics — Store Signal' }

const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const STORE_ID = '00000000-0000-0000-0000-000000000002'

export default async function AnalyticsPage() {
  const supabase = await createSupabaseServerClient()
  const service = createSupabaseServiceClient()

  const [
    { data: store },
    { data: sessions },
    { data: pages },
    { data: monthly },
    { data: adCampaigns },
    { data: metricsRows },
  ] = await Promise.all([
    supabase.from('stores').select('ga4_refresh_token, ga4_property_id').eq('id', STORE_ID).single(),
    service.from('analytics_sessions').select('channel, sessions, conversions, revenue').eq('tenant_id', TENANT_ID).eq('date_range', '90d').order('sessions', { ascending: false }),
    service.from('analytics_pages').select('page_path, sessions, conversions, avg_time_seconds').eq('tenant_id', TENANT_ID).order('sessions', { ascending: false }).limit(20),
    service.from('analytics_monthly').select('month, sessions').eq('tenant_id', TENANT_ID).order('month', { ascending: true }),
    service.from('analytics_campaigns').select('campaign_name, source, sessions, conversions, revenue').eq('tenant_id', TENANT_ID).order('conversions', { ascending: false }).limit(20),
    service.from('analytics_metrics_cache').select('metric_name, metric_value').eq('tenant_id', TENANT_ID),
  ])

  const connected = !!store?.ga4_refresh_token

  const metrics: Record<string, number> = {}
  for (const r of metricsRows ?? []) metrics[r.metric_name] = Number(r.metric_value)

  return (
    <>
      {connected && <div className="mb-1"><DataCoverageBar platforms={[COVERAGE.ga4]} /></div>}
      <AnalyticsDashboard
        connected={connected}
        propertyId={store?.ga4_property_id ?? null}
        sessions={sessions ?? []}
        pages={pages ?? []}
        monthly={monthly ?? []}
        adCampaigns={adCampaigns ?? []}
        metrics={metrics}
      />
    </>
  )
}
