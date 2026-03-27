import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import SemrushDashboard from './SemrushDashboard'
import DataCoverageBar, { COVERAGE } from '../_components/DataCoverageBar'

export const maxDuration = 300

export const metadata = {
  title: 'SEO Intelligence — Store Signal',
}

const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const STORE_ID  = '00000000-0000-0000-0000-000000000002'

export default async function SemrushPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createSupabaseServiceClient()

  const [
    { data: store },
    { data: metricsCache },
    { data: keywords },
    { data: competitors },
    { data: keywordGaps },
    { data: backlinks },
  ] = await Promise.all([
    service.from('stores').select('semrush_api_key, semrush_domain').eq('id', STORE_ID).single(),
    service.from('semrush_metrics_cache').select('*').eq('tenant_id', TENANT_ID).maybeSingle(),
    service
      .from('semrush_keywords')
      .select('keyword, position, previous_position, position_change, search_volume, cpc, url, traffic_percent')
      .eq('tenant_id', TENANT_ID)
      .order('traffic_percent', { ascending: false })
      .limit(50),
    service
      .from('semrush_competitors')
      .select('domain, common_keywords, organic_keywords, organic_traffic, organic_traffic_cost, competition_level')
      .eq('tenant_id', TENANT_ID)
      .order('common_keywords', { ascending: false })
      .limit(5),
    service
      .from('semrush_keyword_gaps')
      .select('keyword, competitor_domain, competitor_position, our_position, search_volume, opportunity_score')
      .eq('tenant_id', TENANT_ID)
      .order('search_volume', { ascending: false })
      .limit(50),
    service
      .from('semrush_backlinks')
      .select('total_backlinks, referring_domains, authority_score, calculated_at')
      .eq('tenant_id', TENANT_ID)
      .maybeSingle(),
  ])

  const storeData = store as { semrush_api_key: string | null; semrush_domain: string | null } | null
  const connected = !!(storeData?.semrush_api_key)
  const domain = storeData?.semrush_domain ?? null

  return (
    <>
      {connected && <div className="mb-1"><DataCoverageBar platforms={[COVERAGE.semrush]} /></div>}
      <SemrushDashboard
        connected={connected}
        domain={domain}
        metrics={metricsCache}
        keywords={keywords ?? []}
        competitors={competitors ?? []}
        keywordGaps={keywordGaps ?? []}
        backlinks={backlinks}
      />
    </>
  )
}
