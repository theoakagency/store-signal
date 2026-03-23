import { createSupabaseServerClient } from '@/lib/supabase'
import IntegrationsClient from './IntegrationsClient'

export const metadata = {
  title: 'Integrations — Store Signal',
}

export default async function IntegrationsPage() {
  const supabase = await createSupabaseServerClient()

  const { data: store } = await supabase
    .from('stores')
    .select('shopify_domain, shopify_access_token, last_synced_at')
    .eq('id', '00000000-0000-0000-0000-000000000002')
    .single()

  const shopifyConnected = !!store?.shopify_access_token
  const shopifyDomain = store?.shopify_domain ?? null
  const lastSyncedAt = store?.last_synced_at ?? null

  return (
    <IntegrationsClient
      shopifyConnected={shopifyConnected}
      shopifyDomain={shopifyDomain}
      lastSyncedAt={lastSyncedAt}
    />
  )
}
