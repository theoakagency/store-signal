import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase'
import DashboardShell from './_components/DashboardShell'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: store } = await supabase
    .from('stores')
    .select('last_synced_at, klaviyo_api_key, gsc_refresh_token, ga4_refresh_token, meta_access_token, google_ads_refresh_token, recharge_api_token, loyaltylion_token')
    .eq('id', '00000000-0000-0000-0000-000000000002')
    .single()

  return (
    <DashboardShell
      userEmail={user.email ?? ''}
      lastSyncedAt={store?.last_synced_at ?? null}
      klaviyoConnected={!!store?.klaviyo_api_key}
      gscConnected={!!store?.gsc_refresh_token}
      ga4Connected={!!store?.ga4_refresh_token}
      metaConnected={!!store?.meta_access_token}
      googleAdsConnected={!!store?.google_ads_refresh_token}
      rechargeConnected={!!store?.recharge_api_token}
      loyaltylionConnected={!!store?.loyaltylion_token}
    >
      {children}
    </DashboardShell>
  )
}
