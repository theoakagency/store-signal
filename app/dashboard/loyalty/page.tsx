import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import LoyaltyDashboard from './LoyaltyDashboard'

export const maxDuration = 300

const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const STORE_ID  = '00000000-0000-0000-0000-000000000002'

export default async function LoyaltyPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createSupabaseServiceClient()

  const [
    { data: store },
    { data: metricsCache },
    { count: totalCustomers },
  ] = await Promise.all([
    service.from('stores').select('loyaltylion_token').eq('id', STORE_ID).single(),
    service.from('loyalty_metrics_cache').select('*').eq('tenant_id', TENANT_ID).maybeSingle(),
    service.from('customers').select('id', { count: 'exact', head: true }).eq('tenant_id', TENANT_ID),
  ])

  const s = store as { loyaltylion_token: string | null } | null
  const connected = !!s?.loyaltylion_token

  return (
    <LoyaltyDashboard
      connected={connected}
      metrics={metricsCache}
      totalCustomers={totalCustomers ?? 0}
    />
  )
}
