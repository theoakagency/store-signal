import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import SubscriptionsDashboard from './SubscriptionsDashboard'

export const maxDuration = 300

const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const STORE_ID  = '00000000-0000-0000-0000-000000000002'

export interface CohortRow {
  month: string       // 'YYYY-MM'
  total: number
  active: number
  retentionRate: number
}

export default async function SubscriptionsPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createSupabaseServiceClient()

  // Fetch cohort data: subscriptions created in last 13 months
  const cohortSubs: { created_at: string; status: string }[] = []
  const PAGE = 1000
  let from = 0
  const thirteenMonthsAgo = new Date()
  thirteenMonthsAgo.setMonth(thirteenMonthsAgo.getMonth() - 13)

  while (true) {
    const { data } = await service
      .from('recharge_subscriptions')
      .select('created_at, status')
      .eq('tenant_id', TENANT_ID)
      .gte('created_at', thirteenMonthsAgo.toISOString())
      .range(from, from + PAGE - 1)
    if (!data || data.length === 0) break
    cohortSubs.push(...(data as { created_at: string; status: string }[]))
    if (data.length < PAGE) break
    from += PAGE
  }

  // Group by start month
  const cohortMap: Record<string, { month: string; total: number; active: number }> = {}
  for (const sub of cohortSubs) {
    const d = new Date(sub.created_at)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (!cohortMap[key]) cohortMap[key] = { month: key, total: 0, active: 0 }
    cohortMap[key].total++
    if (sub.status === 'active') cohortMap[key].active++
  }

  const cohorts: CohortRow[] = Object.values(cohortMap)
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-12)
    .map((c) => ({ ...c, retentionRate: c.total > 0 ? c.active / c.total : 0 }))

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
      .eq('status', 'cancelled')
      .gte('cancelled_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('cancelled_at', { ascending: false })
      .limit(50),
    service
      .from('recharge_subscriptions')
      .select('customer_email, product_title, price, charge_interval_frequency, order_interval_unit, status, next_charge_scheduled_at')
      .eq('tenant_id', TENANT_ID)
      .eq('status', 'active')
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
      cohorts={cohorts}
    />
  )
}
