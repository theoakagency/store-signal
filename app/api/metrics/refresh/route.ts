/**
 * POST /api/metrics/refresh
 * Recomputes key metrics and writes them to metrics_cache.
 * Can be called from a cron job or manually.
 *
 * All order table queries are paginated to bypass the 1000-row PostgREST cap.
 * Monthly revenue + customer count use RPC aggregation (already correct).
 */
import { NextRequest } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase'

export const maxDuration = 120

const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const STORE_ID = '00000000-0000-0000-0000-000000000002'

// Map Shopify source_name values to friendly channel names.
// Shopify POS location IDs are numeric strings (e.g. "12345678") — treat as POS.
function toChannel(sourceName: string | null): string {
  if (!sourceName) return 'Online Store'
  const s = sourceName.toLowerCase()
  if (s === 'web' || s === 'shopify')             return 'Online Store'
  if (s === 'pos' || /^\d+$/.test(s))             return 'Point of Sale'
  if (s === 'shopify_draft_orders')               return 'Draft Orders'
  if (s === 'instagram' || s === 'ig')            return 'Instagram'
  if (s === 'facebook' || s === 'fb')             return 'Facebook'
  if (s === 'shop_app' || s === 'app')            return 'Shop App'
  return 'Other'
}

async function paginateOrders<T extends Record<string, unknown>>(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  select: string,
  gte: string,
  lt?: string,
): Promise<T[]> {
  const rows: T[] = []
  let from = 0
  const PAGE = 1000
  while (true) {
    let q = supabase
      .from('orders')
      .select(select)
      .eq('store_id', STORE_ID)
      .eq('financial_status', 'paid')
      .gte('processed_at', gte)
      .range(from, from + PAGE - 1)
    if (lt) q = q.lt('processed_at', lt)
    const { data } = await q
    if (!data || data.length === 0) break
    rows.push(...(data as T[]))
    if (data.length < PAGE) break
    from += PAGE
  }
  return rows
}

export async function POST(_req: NextRequest) {
  // No user auth check — this route uses the service client only and is safe
  // to call from the daily-analysis cron via internal fetch with CRON_SECRET.
  const supabase = createSupabaseServiceClient()

  const now = new Date()
  const d30  = new Date(now); d30.setDate(d30.getDate() - 30)
  const d60  = new Date(now); d60.setDate(d60.getDate() - 60)
  const d12m = new Date(now); d12m.setMonth(d12m.getMonth() - 12)

  // ── Paginated order fetches ────────────────────────────────────────────────
  // Run 30d and prior-30d in parallel; 12m after (shares load).
  const [orders30d, ordersPrior30d] = await Promise.all([
    paginateOrders<{ total_price: string; currency: string; source_name: string | null }>(
      supabase, 'total_price, currency, source_name', d30.toISOString()
    ),
    paginateOrders<{ total_price: string }>(
      supabase, 'total_price', d60.toISOString(), d30.toISOString()
    ),
  ])

  // 12m channel data (larger dataset — after the parallel pair completes)
  const orders12m = await paginateOrders<{ total_price: string; source_name: string | null }>(
    supabase, 'total_price, source_name', d12m.toISOString()
  )

  // ── RPC aggregations (work on full table, no row limit) ───────────────────
  const [{ data: monthlyRows }, { data: distinctEmailCount }, { data: allCustomers }] = await Promise.all([
    supabase.rpc('get_monthly_revenue', { p_store_id: STORE_ID, p_months: 13 }),
    supabase.rpc('count_distinct_customer_emails', { p_store_id: STORE_ID }),
    supabase.from('customers').select('total_spent').eq('store_id', STORE_ID),
  ])

  // ── Revenue metrics ────────────────────────────────────────────────────────
  const currRevenue  = orders30d.reduce((s, r) => s + Number(r.total_price), 0)
  const priorRevenue = ordersPrior30d.reduce((s, r) => s + Number(r.total_price), 0)
  const currCount    = orders30d.length
  const priorCount   = ordersPrior30d.length
  const currAOV      = currCount > 0 ? currRevenue / currCount : 0
  const priorAOV     = priorCount > 0 ? priorRevenue / priorCount : 0
  const currency     = orders30d[0]?.currency ?? 'USD'

  const customerCount = typeof distinctEmailCount === 'number' ? distinctEmailCount : Number(distinctEmailCount ?? 0)
  const avgLTV = (allCustomers ?? []).length > 0
    ? (allCustomers ?? []).reduce((s, c) => s + Number(c.total_spent), 0) / (allCustomers ?? []).length
    : 0

  const revenueByMonth = (monthlyRows ?? []).map((r: { month: string; revenue: number; order_count: number }) => ({
    month: r.month as string,
    revenue: Number(r.revenue),
    order_count: Number(r.order_count),
  }))

  const metrics = [
    { metric_name: 'revenue_30d',           metric_value: currRevenue,    metric_metadata: { currency } },
    { metric_name: 'revenue_30d_prior',     metric_value: priorRevenue,   metric_metadata: { currency } },
    { metric_name: 'order_count_30d',       metric_value: currCount,      metric_metadata: {} },
    { metric_name: 'order_count_30d_prior', metric_value: priorCount,     metric_metadata: {} },
    { metric_name: 'aov_30d',              metric_value: currAOV,        metric_metadata: { currency } },
    { metric_name: 'aov_30d_prior',        metric_value: priorAOV,       metric_metadata: { currency } },
    { metric_name: 'customer_count',       metric_value: customerCount,  metric_metadata: {} },
    { metric_name: 'avg_ltv',             metric_value: avgLTV,         metric_metadata: { currency } },
    { metric_name: 'revenue_by_month',    metric_value: 0,              metric_metadata: { data: revenueByMonth } },
  ]

  const metricRows = metrics.map((m) => ({
    tenant_id: TENANT_ID,
    store_id: STORE_ID,
    ...m,
    calculated_at: now.toISOString(),
  }))

  const { error } = await supabase
    .from('metrics_cache')
    .upsert(metricRows, { onConflict: 'store_id,metric_name' })

  if (error) return Response.json({ error: error.message }, { status: 500 })

  // ── Sales channel cache ────────────────────────────────────────────────────
  function buildChannelRows(
    orders: { source_name: string | null; total_price: string | number }[],
    period: string
  ) {
    const map: Record<string, { count: number; revenue: number }> = {}
    for (const o of orders) {
      const ch = toChannel(o.source_name)
      if (!map[ch]) map[ch] = { count: 0, revenue: 0 }
      map[ch].count += 1
      map[ch].revenue += Number(o.total_price)
    }
    return Object.entries(map).map(([channel_name, { count, revenue }]) => ({
      tenant_id: TENANT_ID,
      channel_name,
      order_count: count,
      revenue,
      avg_order_value: count > 0 ? revenue / count : 0,
      period,
      calculated_at: now.toISOString(),
    }))
  }

  const channelRows = [
    ...buildChannelRows(orders30d, 'last_30d'),
    ...buildChannelRows(orders12m, 'last_12m'),
  ]

  if (channelRows.length > 0) {
    await supabase
      .from('sales_channel_cache')
      .upsert(channelRows, { onConflict: 'tenant_id,channel_name,period' })
  }

  return Response.json({
    refreshed: metrics.length,
    channels: channelRows.length,
    orders_30d: currCount,
    orders_12m: orders12m.length,
    revenue_months: revenueByMonth.length,
    customer_count: customerCount,
    at: now.toISOString(),
  })
}

// Allow GET for convenience
export async function GET(req: NextRequest) {
  return POST(req)
}
