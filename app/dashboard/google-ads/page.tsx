import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'
import GoogleAdsDashboard from './GoogleAdsDashboard'

export const metadata = { title: 'Google Ads — Store Signal' }

const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const STORE_ID = '00000000-0000-0000-0000-000000000002'

export default async function GoogleAdsPage() {
  const supabase = await createSupabaseServerClient()
  const service = createSupabaseServiceClient()

  const [{ data: store }, { data: campaigns }, { data: metricsRows }] = await Promise.all([
    supabase.from('stores').select('google_ads_refresh_token, google_ads_customer_id').eq('id', STORE_ID).single(),
    service.from('google_campaigns').select('*').eq('tenant_id', TENANT_ID).order('conversion_value', { ascending: false }),
    service.from('google_metrics_cache').select('metric_name, metric_value').eq('tenant_id', TENANT_ID),
  ])

  const connected = !!store?.google_ads_refresh_token
  const dataSource = (campaigns ?? []).some((c) => (c as { data_source?: string }).data_source === 'ga4') ? 'ga4' : 'google_ads'

  const metrics: Record<string, number> = {}
  for (const r of metricsRows ?? []) metrics[r.metric_name] = Number(r.metric_value)

  return (
    <GoogleAdsDashboard
      connected={connected}
      campaigns={campaigns ?? []}
      metrics={metrics}
      dataSource={dataSource}
    />
  )
}
