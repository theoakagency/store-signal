import { createSupabaseServerClient } from '@/lib/supabase'
import SearchDashboard, { type GscInsight } from './SearchDashboard'

export const metadata = { title: 'Search Intelligence — Store Signal' }

const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const STORE_ID = '00000000-0000-0000-0000-000000000002'

export default async function SearchPage() {
  const supabase = await createSupabaseServerClient()

  const [
    { data: store },
    { data: keywords },
    { data: pages },
    { data: monthlyClicks },
    { data: insightsCache },
  ] = await Promise.all([
    supabase
      .from('stores')
      .select('gsc_refresh_token, gsc_property_url')
      .eq('id', STORE_ID)
      .single(),
    supabase
      .from('gsc_keywords')
      .select('query, clicks, impressions, ctr, position')
      .eq('tenant_id', TENANT_ID)
      .order('clicks', { ascending: false })
      .limit(50),
    supabase
      .from('gsc_pages')
      .select('page, clicks, impressions, ctr, position, clicks_prior')
      .eq('tenant_id', TENANT_ID)
      .order('clicks', { ascending: false })
      .limit(100),
    supabase
      .from('gsc_monthly_clicks')
      .select('month, clicks, impressions')
      .eq('tenant_id', TENANT_ID)
      .order('month', { ascending: true }),
    supabase
      .from('gsc_insights_cache')
      .select('insights, calculated_at')
      .eq('tenant_id', TENANT_ID)
      .maybeSingle(),
  ])

  return (
    <SearchDashboard
      connected={!!store?.gsc_refresh_token}
      propertyUrl={store?.gsc_property_url ?? null}
      keywords={keywords ?? []}
      pages={pages ?? []}
      monthlyClicks={monthlyClicks ?? []}
      cachedInsights={(insightsCache?.insights as GscInsight[] | null) ?? null}
      insightsCalculatedAt={insightsCache?.calculated_at ?? null}
    />
  )
}
