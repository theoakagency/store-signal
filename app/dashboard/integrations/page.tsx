import { createSupabaseServerClient } from '@/lib/supabase'
import IntegrationsClient from './IntegrationsClient'

export const metadata = {
  title: 'Integrations — Store Signal',
}

export default async function IntegrationsPage() {
  const supabase = await createSupabaseServerClient()

  const { data: store } = await supabase
    .from('stores')
    .select('shopify_domain, shopify_access_token, klaviyo_api_key, klaviyo_account_id, last_synced_at, gsc_refresh_token, gsc_property_url, ga4_refresh_token, ga4_property_id, meta_access_token, meta_ad_account_id, google_ads_customer_id, google_ads_refresh_token')
    .eq('id', '00000000-0000-0000-0000-000000000002')
    .single()

  return (
    <IntegrationsClient
      shopifyConnected={!!store?.shopify_access_token}
      shopifyDomain={store?.shopify_domain ?? null}
      lastSyncedAt={store?.last_synced_at ?? null}
      klaviyoConnected={!!store?.klaviyo_api_key}
      klaviyoAccountId={store?.klaviyo_account_id ?? null}
      gscConnected={!!store?.gsc_refresh_token}
      gscPropertyUrl={store?.gsc_property_url ?? null}
      ga4Connected={!!store?.ga4_refresh_token}
      ga4PropertyId={store?.ga4_property_id ?? null}
      metaConnected={!!store?.meta_access_token}
      metaAdAccountId={store?.meta_ad_account_id ?? null}
      googleAdsConnected={!!store?.google_ads_refresh_token}
      googleAdsCustomerId={store?.google_ads_customer_id ?? null}
    />
  )
}
