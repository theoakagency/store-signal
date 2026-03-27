import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'
import AdvertisingOverview from './AdvertisingOverview'
import DataCoverageBar, { COVERAGE } from '../_components/DataCoverageBar'

export const metadata = { title: 'Advertising Overview — Store Signal' }

const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const STORE_ID = '00000000-0000-0000-0000-000000000002'

export default async function AdvertisingPage() {
  const supabase = await createSupabaseServerClient()
  const service = createSupabaseServiceClient()

  const [
    { data: store },
    { data: metaCampaigns },
    { data: metaMetrics },
    { data: googleCampaigns },
    { data: googleMetrics },
  ] = await Promise.all([
    supabase.from('stores').select('meta_access_token, meta_ad_account_id, google_ads_refresh_token, google_ads_customer_id').eq('id', STORE_ID).single(),
    service.from('meta_campaigns').select('id, name, spend, roas, status, purchases, purchase_value').eq('tenant_id', TENANT_ID).order('spend', { ascending: false }),
    service.from('meta_metrics_cache').select('metric_name, metric_value').eq('tenant_id', TENANT_ID),
    service.from('google_campaigns').select('id, name, spend, roas, status, conversions, conversion_value, data_source').eq('tenant_id', TENANT_ID).order('spend', { ascending: false }),
    service.from('google_metrics_cache').select('metric_name, metric_value').eq('tenant_id', TENANT_ID),
  ])

  const metaConnected = !!store?.meta_access_token
  const googleConnected = !!store?.google_ads_refresh_token

  const metaM: Record<string, number> = {}
  for (const r of metaMetrics ?? []) metaM[r.metric_name] = Number(r.metric_value)

  const googleM: Record<string, number> = {}
  for (const r of googleMetrics ?? []) googleM[r.metric_name] = Number(r.metric_value)

  const coveragePlatforms = [
    ...(metaConnected ? [COVERAGE.meta_ads] : []),
    ...(googleConnected ? [COVERAGE.google_ads] : []),
  ]

  return (
    <>
      {coveragePlatforms.length > 0 && <div className="mb-1"><DataCoverageBar platforms={coveragePlatforms} /></div>}
      <AdvertisingOverview
        metaConnected={metaConnected}
        googleConnected={googleConnected}
        metaCampaigns={metaCampaigns ?? []}
        googleCampaigns={googleCampaigns ?? []}
        metaMetrics={metaM}
        googleMetrics={googleM}
      />
    </>
  )
}
