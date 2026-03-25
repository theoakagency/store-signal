import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'
import CustomerTable, { type BuyerProfile, type OverlapData } from './CustomerTable'

export const metadata = { title: 'Customer Intelligence — Store Signal' }

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

type VennKey =
  | 'subscribers_only'
  | 'loyalty_only'
  | 'vip_only'
  | 'sub_loyalty'
  | 'sub_vip'
  | 'loyalty_vip'
  | 'all_three'

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; segment?: string; venn?: string }>
}) {
  const sp = await searchParams
  const page     = Math.max(1, parseInt(sp.page ?? '1', 10))
  const pageSize = 50
  const offset   = (page - 1) * pageSize

  // Resolve active filters.
  // Segment filter takes precedence over venn filter.
  // When neither is provided, default to 'sub_vip' Venn (most valuable segment).
  const activeSegment: string | null = (sp.segment && sp.segment !== 'all') ? sp.segment : null
  const activeVenn: VennKey | null = activeSegment
    ? null
    : sp.venn === 'all'
      ? null
      : (sp.venn as VennKey | undefined) ?? 'sub_vip'

  await createSupabaseServerClient()
  const service = createSupabaseServiceClient()

  // ── Lightweight full-table fetch for counts (segment + ltv) ───────────────────
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

  // ── Build the buyers query with server-side segment / venn filtering ───────────
  let buyersQ = service
    .from('customer_profiles')
    .select(
      'email, total_orders, total_revenue, avg_order_value, segment, ltv_segment, engagement_score, is_subscriber, is_loyalty_member, predicted_next_order_date, subscription_interval, subscription_mrr, loyalty_tier, loyalty_points_balance, avg_days_between_orders, days_since_last_order, first_product_bought, most_recent_product, top_products, first_order_at, last_order_at',
      { count: 'exact' },
    )
    .eq('tenant_id', TENANT_ID)
    .order('total_revenue', { ascending: false })
    .range(offset, offset + pageSize - 1)

  // Segment filter (lifecycle segment: vip / active / at_risk / lapsed / new)
  if (activeSegment) {
    buyersQ = buyersQ.eq('segment', activeSegment)
  }

  // Venn filter (cross-platform membership combinations)
  if (activeVenn) {
    switch (activeVenn) {
      case 'subscribers_only':
        buyersQ = buyersQ.eq('is_subscriber', true).eq('is_loyalty_member', false).neq('segment', 'vip')
        break
      case 'loyalty_only':
        buyersQ = buyersQ.eq('is_loyalty_member', true).eq('is_subscriber', false).neq('segment', 'vip')
        break
      case 'vip_only':
        buyersQ = buyersQ.eq('segment', 'vip').eq('is_subscriber', false).eq('is_loyalty_member', false)
        break
      case 'sub_loyalty':
        buyersQ = buyersQ.eq('is_subscriber', true).eq('is_loyalty_member', true).neq('segment', 'vip')
        break
      case 'sub_vip':
        buyersQ = buyersQ.eq('is_subscriber', true).eq('segment', 'vip').eq('is_loyalty_member', false)
        break
      case 'loyalty_vip':
        buyersQ = buyersQ.eq('is_loyalty_member', true).eq('segment', 'vip').eq('is_subscriber', false)
        break
      case 'all_three':
        buyersQ = buyersQ.eq('is_subscriber', true).eq('is_loyalty_member', true).eq('segment', 'vip')
        break
    }
  }

  const [
    { data: pageRows, count },
    { data: overlapRaw },
  ] = await Promise.all([
    buyersQ,
    service.from('customer_overlap_cache').select('*').eq('tenant_id', TENANT_ID).maybeSingle(),
  ])

  // ── Segment counts from all profiles ──────────────────────────────────────────
  const segmentCounts = allCounts.reduce((acc, p) => {
    acc[p.segment] = (acc[p.segment] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  // ── LTV counts from all profiles ──────────────────────────────────────────────
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
      activeSegment={activeSegment ?? 'all'}
      activeVenn={activeVenn}
    />
  )
}
