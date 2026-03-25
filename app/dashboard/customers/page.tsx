import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'
import CustomerTable, { type BuyerProfile, type OverlapData } from './CustomerTable'

export const metadata = { title: 'Customer Intelligence — Store Signal' }

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const { page: pageStr } = await searchParams
  const page     = Math.max(1, parseInt(pageStr ?? '1', 10))
  const pageSize = 50
  const offset   = (page - 1) * pageSize

  // Need server client for auth cookie handling (middleware pattern)
  await createSupabaseServerClient()
  const service = createSupabaseServiceClient()

  // ── Paginate all profiles for segmentCounts + ltvCounts ───────────────────────
  // Lightweight fetch — only 3 fields across all rows
  const allCounts: { segment: string; ltv_segment: string | null; total_revenue: number | null }[] = []
  {
    let from = 0
    while (true) {
      const { data } = await service
        .from('customer_profiles')
        .select('segment, ltv_segment, total_revenue')
        .eq('tenant_id', TENANT_ID)
        .range(from, from + 999)
      if (!data || data.length === 0) break
      allCounts.push(...(data as typeof allCounts))
      if (data.length < 1000) break
      from += 1000
    }
  }

  // ── Current page of buyers + overlap cache in parallel ────────────────────────
  const [
    { data: pageRows, count },
    { data: overlapRaw },
  ] = await Promise.all([
    service
      .from('customer_profiles')
      .select(
        'email, total_orders, total_revenue, avg_order_value, segment, ltv_segment, engagement_score, is_subscriber, is_loyalty_member, predicted_next_order_date, subscription_interval, subscription_mrr, loyalty_tier, loyalty_points_balance, avg_days_between_orders, days_since_last_order, first_product_bought, most_recent_product, top_products, first_order_at, last_order_at',
        { count: 'exact' },
      )
      .eq('tenant_id', TENANT_ID)
      .order('total_revenue', { ascending: false })
      .range(offset, offset + pageSize - 1),
    service.from('customer_overlap_cache').select('*').eq('tenant_id', TENANT_ID).maybeSingle(),
  ])

  // Segment counts from all profiles
  const segmentCounts = allCounts.reduce((acc, p) => {
    acc[p.segment] = (acc[p.segment] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  // LTV counts from all profiles
  const ltvCounts: Record<string, { count: number; totalRevenue: number }> = {
    Diamond: { count: 0, totalRevenue: 0 },
    Gold:    { count: 0, totalRevenue: 0 },
    Silver:  { count: 0, totalRevenue: 0 },
    Bronze:  { count: 0, totalRevenue: 0 },
  }
  let totalRevenueAll = 0
  for (const r of allCounts) {
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
      buyers={(pageRows ?? []) as BuyerProfile[]}
      page={page}
      totalPages={Math.ceil((count ?? 0) / pageSize)}
      totalCount={count ?? 0}
      segmentCounts={segmentCounts}
      overlapData={overlapData}
      ltvCounts={ltvCounts}
      totalRevenueAll={totalRevenueAll}
    />
  )
}
