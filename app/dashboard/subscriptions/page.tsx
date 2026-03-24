import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import SubscriptionsDashboard from './SubscriptionsDashboard'

export const maxDuration = 300

const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const STORE_ID  = '00000000-0000-0000-0000-000000000002'

export default async function SubscriptionsPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createSupabaseServiceClient()

  const [
    { data: store },
    { data: metricsCache },
    { data: recentCancellations },
    { data: topSubscriptions },
  ] = await Promise.all([
    service.from('stores').select('recharge_api_token').eq('id', STORE_ID).single(),
    service.from('recharge_metrics_cache').select('*').eq('tenant_id', TENANT_ID).maybeSingle(),
    service
      .from('recharge_subscriptions')
      .select('customer_email, product_title, price, cancelled_at, charge_interval_frequency, order_interval_unit')
      .eq('tenant_id', TENANT_ID)
      .eq('status', 'CANCELLED')
      .gte('cancelled_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('cancelled_at', { ascending: false })
      .limit(50),
    service
      .from('recharge_subscriptions')
      .select('customer_email, product_title, price, charge_interval_frequency, order_interval_unit, status, next_charge_scheduled_at')
      .eq('tenant_id', TENANT_ID)
      .eq('status', 'ACTIVE')
      .order('price', { ascending: false })
      .limit(10),
  ])

  const connected = !!(store as { recharge_api_token: string | null } | null)?.recharge_api_token

  return (
    <SubscriptionsDashboard
      connected={connected}
      metrics={metricsCache}
      recentCancellations={recentCancellations ?? []}
      topSubscriptions={topSubscriptions ?? []}
    />
  )
}
