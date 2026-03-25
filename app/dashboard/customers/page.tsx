import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'
import CustomerTable, { type CustomerProfile, type OverlapData } from './CustomerTable'

export const metadata = { title: 'Customer Intelligence — Store Signal' }

const STORE_ID  = '00000000-0000-0000-0000-000000000002'
const TENANT_ID = '00000000-0000-0000-0000-000000000001'

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; segment?: string }>
}) {
  const { page: pageStr } = await searchParams
  const page     = Math.max(1, parseInt(pageStr ?? '1', 10))
  const pageSize = 50
  const offset   = (page - 1) * pageSize

  const supabase = await createSupabaseServerClient()
  const service  = createSupabaseServiceClient()

  // ── Paginate storeStats (all rows needed for avgSpent + segmentCounts) ────────
  const storeStats: { total_spent: string; orders_count: number; updated_at: string }[] = []
  {
    let from = 0
    while (true) {
      const { data } = await supabase
        .from('customers')
        .select('total_spent, orders_count, updated_at')
        .eq('store_id', STORE_ID)
        .range(from, from + 999)
      if (!data || data.length === 0) break
      storeStats.push(...(data as typeof storeStats))
      if (data.length < 1000) break
      from += 1000
    }
  }

  // ── Paginate customer_profiles (all rows needed for profileMap + ltvCounts) ──
  type ProfileRow = {
    email: string | null
    ltv_segment: string | null
    total_revenue: number | null
    total_orders: number | null
    engagement_score: number | null
    is_subscriber: boolean | null
    is_loyalty_member: boolean | null
    predicted_next_order_date: string | null
    subscription_interval: string | null
    subscription_mrr: number | null
    loyalty_tier: string | null
    loyalty_points_balance: number | null
    avg_days_between_orders: number | null
    days_since_last_order: number | null
    first_product_bought: string | null
    most_recent_product: string | null
    top_products: string[] | null
  }
  const profileRows: ProfileRow[] = []
  {
    let from = 0
    while (true) {
      const { data } = await service
        .from('customer_profiles')
        .select('email, ltv_segment, total_revenue, total_orders, engagement_score, is_subscriber, is_loyalty_member, predicted_next_order_date, subscription_interval, subscription_mrr, loyalty_tier, loyalty_points_balance, avg_days_between_orders, days_since_last_order, first_product_bought, most_recent_product, top_products')
        .eq('tenant_id', TENANT_ID)
        .range(from, from + 999)
      if (!data || data.length === 0) break
      profileRows.push(...(data as ProfileRow[]))
      if (data.length < 1000) break
      from += 1000
    }
  }

  // ── Current page of customers + overlap cache in parallel ─────────────────────
  const [
    { data: customers, count },
    { data: overlapRaw },
  ] = await Promise.all([
    supabase.from('customers').select('*', { count: 'exact' }).eq('store_id', STORE_ID)
      .order('total_spent', { ascending: false })
      .range(offset, offset + pageSize - 1),
    service.from('customer_overlap_cache').select('*').eq('tenant_id', TENANT_ID).maybeSingle(),
  ])

  const now          = Date.now()
  const avgSpent     = storeStats.length > 0 ? storeStats.reduce((s, c) => s + Number(c.total_spent), 0) / storeStats.length : 0
  const vipThreshold = avgSpent * 2.5

  function classify(c: { total_spent: number; orders_count: number; updated_at: string }) {
    const days = (now - new Date(c.updated_at).getTime()) / 86400000
    if (c.orders_count === 0)                    return 'new'
    if (Number(c.total_spent) >= vipThreshold)   return 'vip'
    if (days < 90)  return 'active'
    if (days < 180) return 'at_risk'
    return 'lapsed'
  }

  const classified = (customers ?? []).map((c) => ({ ...c, segment: classify(c) }))

  const segmentCounts = storeStats.reduce((acc, c) => {
    const days = (now - new Date(c.updated_at).getTime()) / 86400000
    let seg = 'lapsed'
    if (c.orders_count === 0)                    seg = 'new'
    else if (Number(c.total_spent) >= vipThreshold) seg = 'vip'
    else if (days < 90)  seg = 'active'
    else if (days < 180) seg = 'at_risk'
    acc[seg] = (acc[seg] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  // Build profile map keyed by email
  const profileMap: Record<string, CustomerProfile> = {}
  for (const p of profileRows) {
    if (p.email) profileMap[p.email.toLowerCase()] = p as CustomerProfile
  }

  // LTV segment counts (derived from the same profileRows fetch)
  const ltvCounts: Record<string, { count: number; totalRevenue: number }> = {
    Diamond: { count: 0, totalRevenue: 0 },
    Gold:    { count: 0, totalRevenue: 0 },
    Silver:  { count: 0, totalRevenue: 0 },
    Bronze:  { count: 0, totalRevenue: 0 },
  }
  let totalRevenueAll = 0
  for (const r of profileRows) {
    const seg = r.ltv_segment as string
    if (ltvCounts[seg]) {
      ltvCounts[seg].count++
      ltvCounts[seg].totalRevenue += Number(r.total_revenue)
    }
    totalRevenueAll += Number(r.total_revenue)
  }

  const overlapData: OverlapData | null = overlapRaw ? {
    total_customers:        overlapRaw.total_customers        ?? 0,
    subscribers_only:       overlapRaw.subscribers_only       ?? 0,
    loyalty_only:           overlapRaw.loyalty_only           ?? 0,
    vip_only:               overlapRaw.vip_only               ?? 0,
    subscriber_and_loyalty: overlapRaw.subscriber_and_loyalty ?? 0,
    subscriber_and_vip:     overlapRaw.subscriber_and_vip     ?? 0,
    loyalty_and_vip:        overlapRaw.loyalty_and_vip        ?? 0,
    all_three:              overlapRaw.all_three              ?? 0,
    calculated_at:          overlapRaw.calculated_at          ?? '',
  } : null

  return (
    <CustomerTable
      customers={classified}
      page={page}
      totalPages={Math.ceil((count ?? 0) / pageSize)}
      totalCount={count ?? 0}
      segmentCounts={segmentCounts}
      profileMap={profileMap}
      overlapData={overlapData}
      ltvCounts={ltvCounts}
      totalRevenueAll={totalRevenueAll}
    />
  )
}
