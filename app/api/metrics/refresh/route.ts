/**
 * POST /api/metrics/refresh
 * Recomputes key metrics and writes them to metrics_cache.
 * Can be called from a cron job or manually.
 */
import { NextRequest } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase'

export const maxDuration = 60

const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const STORE_ID = '00000000-0000-0000-0000-000000000002'

// Map Shopify source_name values to friendly channel names
function toChannel(sourceName: string | null): string {
  if (!sourceName) return 'Online Store'
  const map: Record<string, string> = {
    web: 'Online Store',
    shopify: 'Online Store',
    pos: 'Point of Sale',
    shopify_draft_orders: 'Draft Orders',
    instagram: 'Instagram',
    facebook: 'Facebook',
    shop_app: 'Shop App',
    app: 'Shop App',
  }
  return map[sourceName.toLowerCase()] ?? 'Other'
}

export async function POST(_req: NextRequest) {
  const supabase = createSupabaseServiceClient()

  const now = new Date()
  const d30 = new Date(now); d30.setDate(d30.getDate() - 30)
  const d60 = new Date(now); d60.setDate(d60.getDate() - 60)
  const d12m = new Date(now); d12m.setMonth(d12m.getMonth() - 12)

  const [{ data: curr }, { data: prior }, { data: allCustomers }, { data: channelOrders30d }, { data: channelOrders12m }] = await Promise.all([
    supabase
      .from('orders')
      .select('total_price, currency')
      .eq('store_id', STORE_ID)
      .eq('financial_status', 'paid')
      .gte('processed_at', d30.toISOString()),
    supabase
      .from('orders')
      .select('total_price')
      .eq('store_id', STORE_ID)
      .eq('financial_status', 'paid')
      .gte('processed_at', d60.toISOString())
      .lt('processed_at', d30.toISOString()),
    supabase
      .from('customers')
      .select('total_spent, orders_count')
      .eq('store_id', STORE_ID),
    supabase
      .from('orders')
      .select('source_name, total_price')
      .eq('store_id', STORE_ID)
      .eq('financial_status', 'paid')
      .gte('processed_at', d30.toISOString()),
    supabase
      .from('orders')
      .select('source_name, total_price')
      .eq('store_id', STORE_ID)
      .eq('financial_status', 'paid')
      .gte('processed_at', d12m.toISOString()),
  ])

  const currRevenue = (curr ?? []).reduce((s, r) => s + Number(r.total_price), 0)
  const priorRevenue = (prior ?? []).reduce((s, r) => s + Number(r.total_price), 0)
  const currCount = (curr ?? []).length
  const priorCount = (prior ?? []).length
  const currAOV = currCount > 0 ? currRevenue / currCount : 0
  const priorAOV = priorCount > 0 ? priorRevenue / priorCount : 0
  const customerCount = (allCustomers ?? []).length
  const avgLTV = customerCount > 0
    ? (allCustomers ?? []).reduce((s, c) => s + Number(c.total_spent), 0) / customerCount
    : 0
  const currency = curr?.[0]?.currency ?? 'USD'

  const metrics = [
    { metric_name: 'revenue_30d', metric_value: currRevenue, metric_metadata: { currency } },
    { metric_name: 'revenue_30d_prior', metric_value: priorRevenue, metric_metadata: { currency } },
    { metric_name: 'order_count_30d', metric_value: currCount, metric_metadata: {} },
    { metric_name: 'order_count_30d_prior', metric_value: priorCount, metric_metadata: {} },
    { metric_name: 'aov_30d', metric_value: currAOV, metric_metadata: { currency } },
    { metric_name: 'aov_30d_prior', metric_value: priorAOV, metric_metadata: { currency } },
    { metric_name: 'customer_count', metric_value: customerCount, metric_metadata: {} },
    { metric_name: 'avg_ltv', metric_value: avgLTV, metric_metadata: { currency } },
  ]

  const rows = metrics.map((m) => ({
    tenant_id: TENANT_ID,
    store_id: STORE_ID,
    ...m,
    calculated_at: now.toISOString(),
  }))

  const { error } = await supabase
    .from('metrics_cache')
    .upsert(rows, { onConflict: 'store_id,metric_name' })

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  // ── Sales channel cache ───────────────────────────────────────────────────
  function buildChannelRows(orders: { source_name: string | null; total_price: string | number }[] | null, period: string) {
    const map: Record<string, { count: number; revenue: number }> = {}
    for (const o of orders ?? []) {
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
    ...buildChannelRows(channelOrders30d, 'last_30d'),
    ...buildChannelRows(channelOrders12m, 'last_12m'),
  ]

  if (channelRows.length > 0) {
    await supabase
      .from('sales_channel_cache')
      .upsert(channelRows, { onConflict: 'tenant_id,channel_name,period' })
  }

  return Response.json({ refreshed: metrics.length, channels: channelRows.length, at: now.toISOString() })
}

// Allow GET for convenience
export async function GET(req: NextRequest) {
  return POST(req)
}
