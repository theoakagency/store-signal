import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'
import ShopifyDashboard from './ShopifyDashboard'

export const metadata = { title: 'Shopify — Store Signal' }

const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const STORE_ID  = '00000000-0000-0000-0000-000000000002'

export default async function ShopifyPage() {
  const supabase = await createSupabaseServerClient()
  const service  = createSupabaseServiceClient()

  const now = new Date()
  const thirtyDaysAgo = new Date(now); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const sixtyDaysAgo  = new Date(now); sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

  const [
    { data: storeRow },
    { data: curr30 },
    { data: prev30 },
    { data: refunds30 },
    { data: orders },
    { data: customers },
    { data: channels },
    { data: metricsCache },
    { data: insightsCache },
  ] = await Promise.all([
    supabase.from('stores').select('name, domain, last_synced_at').eq('id', STORE_ID).single(),
    supabase.from('orders').select('total_price, email, processed_at').eq('store_id', STORE_ID).eq('financial_status', 'paid').gte('processed_at', thirtyDaysAgo.toISOString()),
    supabase.from('orders').select('total_price').eq('store_id', STORE_ID).eq('financial_status', 'paid').gte('processed_at', sixtyDaysAgo.toISOString()).lt('processed_at', thirtyDaysAgo.toISOString()),
    supabase.from('orders').select('total_price').eq('store_id', STORE_ID).eq('financial_status', 'refunded').gte('processed_at', thirtyDaysAgo.toISOString()),
    service.from('orders').select('id, order_number, email, financial_status, fulfillment_status, total_price, processed_at').eq('store_id', STORE_ID).order('processed_at', { ascending: false }).limit(200),
    supabase.from('customers').select('shopify_customer_id, email, first_name, last_name, orders_count, total_spent').order('total_spent', { ascending: false }).limit(200),
    supabase.from('sales_channel_cache').select('channel_name, revenue, order_count, avg_order_value').eq('tenant_id', TENANT_ID).eq('period', 'last_30d'),
    service.from('metrics_cache').select('metric_name, metric_value, metric_metadata').eq('store_id', STORE_ID).in('metric_name', ['revenue_by_month']),
    service.from('shopify_insights_cache').select('insights, calculated_at').eq('tenant_id', TENANT_ID).maybeSingle(),
  ])

  // ── Metrics ────────────────────────────────────────────────────────────────
  const currOrders = curr30 ?? []
  const prevOrders = prev30 ?? []
  const revenue30d   = currOrders.reduce((s, r) => s + Number(r.total_price), 0)
  const prevRevenue  = prevOrders.reduce((s, r) => s + Number(r.total_price), 0)
  const orders30d    = currOrders.length
  const prevOrders30 = prevOrders.length
  const aov30d       = orders30d > 0 ? revenue30d / orders30d : 0
  const prevAov      = prevOrders30 > 0 ? prevRevenue / prevOrders30 : 0

  function delta(c: number, p: number) { return p > 0 ? ((c - p) / p) * 100 : null }

  const refundAmount30d = (refunds30 ?? []).reduce((s, r) => s + Number(r.total_price), 0)
  const refundRate = revenue30d > 0 ? refundAmount30d / revenue30d : 0

  // Unique emails in last 30d orders
  const curr30Emails = new Set(currOrders.map((o) => o.email).filter(Boolean))
  // Returning = placed order before too; heuristic: if customers table has orders_count > 1
  const returningEmails = (customers ?? []).filter((c) => c.orders_count > 1 && c.email && curr30Emails.has(c.email)).length
  const newCustomers30d = curr30Emails.size - returningEmails
  const returningRate   = curr30Emails.size > 0 ? returningEmails / curr30Emails.size : 0

  // ── Chart data ─────────────────────────────────────────────────────────────
  type CachedMonth = { month: string; revenue: number }
  const monthRow = (metricsCache ?? []).find((r) => r.metric_name === 'revenue_by_month')
  const cachedMonths: CachedMonth[] = (monthRow?.metric_metadata as { data?: CachedMonth[] } | null)?.data ?? []
  const cachedByKey = new Map(cachedMonths.map((m) => [m.month, m.revenue]))
  const chartData: CachedMonth[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now)
    d.setMonth(d.getMonth() - i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    chartData.push({ month: key, revenue: cachedByKey.get(key) ?? 0 })
  }

  interface OrderRow {
    id: string; order_number: string; email: string | null
    financial_status: string | null; fulfillment_status: string | null
    total_price: number; processed_at: string | null
  }

  return (
    <ShopifyDashboard
      metrics={{ revenue30d, revDelta: delta(revenue30d, prevRevenue), orders30d, ordersDelta: delta(orders30d, prevOrders30), aov30d, aovDelta: delta(aov30d, prevAov), newCustomers30d: Math.max(0, newCustomers30d), returningRate, currency: 'USD', refundAmount30d, refundRate }}
      orders={(orders ?? []) as OrderRow[]}
      customers={customers ?? []}
      channels={channels ?? []}
      chartData={chartData}
      cachedInsights={(insightsCache?.insights as { title: string; description: string; action: string; impact: 'Low' | 'Medium' | 'High'; category: 'Revenue' | 'Retention' | 'Channel' | 'Operations' }[] | null) ?? null}
      insightsCalculatedAt={insightsCache?.calculated_at ?? null}
      storeName={(storeRow as { name?: string | null } | null)?.name ?? 'Shopify Store'}
      storeDomain={(storeRow as { domain?: string | null } | null)?.domain ?? null}
      lastSyncedAt={(storeRow as { last_synced_at?: string | null } | null)?.last_synced_at ?? null}
    />
  )
}
