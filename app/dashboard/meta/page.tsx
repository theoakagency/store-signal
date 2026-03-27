import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'
import MetaDashboard from './MetaDashboard'
import DataCoverageBar, { COVERAGE } from '../_components/DataCoverageBar'

export const metadata = { title: 'Meta Ads — Store Signal' }

const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const STORE_ID = '00000000-0000-0000-0000-000000000002'

export default async function MetaPage() {
  const supabase = await createSupabaseServerClient()
  const service = createSupabaseServiceClient()

  const [{ data: store }, { data: campaigns }, { data: metricsRows }] = await Promise.all([
    supabase.from('stores').select('meta_access_token, meta_ad_account_id').eq('id', STORE_ID).single(),
    service.from('meta_campaigns').select('*').eq('tenant_id', TENANT_ID).order('spend', { ascending: false }),
    service.from('meta_metrics_cache').select('metric_name, metric_value').eq('tenant_id', TENANT_ID),
  ])

  const connected = !!store?.meta_access_token

  const metrics: Record<string, number> = {}
  for (const r of metricsRows ?? []) metrics[r.metric_name] = Number(r.metric_value)

  return (
    <>
      {connected && <div className="mb-1"><DataCoverageBar platforms={[COVERAGE.meta_ads]} /></div>}
      <MetaDashboard
        connected={connected}
        campaigns={campaigns ?? []}
        metrics={metrics}
      />
    </>
  )
}
