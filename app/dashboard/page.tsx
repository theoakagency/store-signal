import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'
import Link from 'next/link'
import RevenueSection from './RevenueSection'
import AiInsightsBrief, { type ExecutiveInsight } from './AiInsightsBrief'
import AskAiRow from './_components/AskAiRow'

export const metadata = {
  title: 'Executive Summary — Store Signal',
}

const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const STORE_ID = '00000000-0000-0000-0000-000000000002'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Order {
  id: string
  order_number: string
  email: string | null
  financial_status: string | null
  fulfillment_status: string | null
  total_price: number
  currency: string
  processed_at: string | null
}

interface Customer {
  shopify_customer_id: number
  email: string | null
  first_name: string | null
  last_name: string | null
  orders_count: number
  total_spent: number
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(d))
}

function delta(current: number, prior: number) {
  if (prior === 0) return null
  return ((current - prior) / prior) * 100
}

function statusBadge(status: string | null) {
  if (!status) return null
  const map: Record<string, string> = {
    paid: 'bg-teal-pale text-teal-deep',
    pending: 'bg-yellow-50 text-yellow-700',
    refunded: 'bg-cream-2 text-ink-3',
    voided: 'bg-cream-2 text-ink-3',
    fulfilled: 'bg-blue-50 text-blue-700',
    partial: 'bg-orange-50 text-orange-700',
    unfulfilled: 'bg-cream-2 text-ink-3',
  }
  const cls = map[status] ?? 'bg-cream-2 text-ink-3'
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status}
    </span>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient()

  const now = new Date()
  const thirtyDaysAgo = new Date(now)
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const sixtyDaysAgo = new Date(now)
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

  // ── Fetch all data in parallel ──────────────────────────────────────────────
  const service = createSupabaseServiceClient()

  const [
    { data: currentRows },
    { data: priorRows },
    { data: recentOrders },
    { data: topCustomers },
    { data: storeRow },
    { data: klaviyoMetricsRows },
    { data: topCampaignRows },
    { data: topFlowRows },
    { data: channelRows },
    { data: execInsightsCache },
    { data: metricsCache },
    { data: semrushCache },
  ] = await Promise.all([
    supabase
      .from('orders')
      .select('total_price, currency, processed_at')
      .eq('financial_status', 'paid')
      .gte('processed_at', thirtyDaysAgo.toISOString()),
    supabase
      .from('orders')
      .select('total_price, currency')
      .eq('financial_status', 'paid')
      .gte('processed_at', sixtyDaysAgo.toISOString())
      .lt('processed_at', thirtyDaysAgo.toISOString()),
    supabase
      .from('orders')
      .select('id, order_number, email, financial_status, fulfillment_status, total_price, currency, processed_at')
      .order('processed_at', { ascending: false })
      .limit(20),
    supabase
      .from('customers')
      .select('shopify_customer_id, email, first_name, last_name, orders_count, total_spent')
      .order('total_spent', { ascending: false })
      .limit(10),
    supabase
      .from('stores')
      .select('klaviyo_api_key, semrush_api_key')
      .eq('id', '00000000-0000-0000-0000-000000000002')
      .single(),
    supabase
      .from('klaviyo_metrics_cache')
      .select('metric_name, metric_value, metric_metadata')
      .eq('tenant_id', TENANT_ID),
    supabase
      .from('klaviyo_campaigns')
      .select('name, revenue_attributed')
      .eq('tenant_id', TENANT_ID)
      .order('revenue_attributed', { ascending: false })
      .limit(1),
    supabase
      .from('klaviyo_flows')
      .select('name, revenue_attributed')
      .eq('tenant_id', TENANT_ID)
      .order('revenue_attributed', { ascending: false })
      .limit(1),
    supabase
      .from('sales_channel_cache')
      .select('channel_name, revenue, order_count, avg_order_value')
      .eq('tenant_id', TENANT_ID)
      .eq('period', 'last_30d'),
    service
      .from('executive_insights_cache')
      .select('insights, calculated_at')
      .eq('tenant_id', TENANT_ID)
      .maybeSingle(),
    // Read cached metrics — revenue_by_month and customer_count computed by /api/metrics/refresh
    service
      .from('metrics_cache')
      .select('metric_name, metric_value, metric_metadata')
      .eq('store_id', STORE_ID)
      .in('metric_name', ['revenue_by_month', 'customer_count']),
    service
      .from('semrush_metrics_cache')
      .select('organic_keywords_total, organic_traffic_estimate, authority_score, top_competitors, calculated_at')
      .eq('tenant_id', TENANT_ID)
      .maybeSingle(),
  ])

  const curr = currentRows ?? []
  const prior = priorRows ?? []
  const orders = (recentOrders ?? []) as Order[]
  const customers = (topCustomers ?? []) as Customer[]

  // SEMrush derived data
  const semrushConnected = !!storeRow?.semrush_api_key
  const semrushData = semrushCache as {
    organic_keywords_total: number | null
    organic_traffic_estimate: number | null
    authority_score: number | null
    top_competitors: Array<{ domain: string; common_keywords: number }> | null
    calculated_at: string | null
  } | null

  // Klaviyo derived data
  const klaviyoConnected = !!storeRow?.klaviyo_api_key
  const kvMetrics: Record<string, number> = {}
  for (const row of klaviyoMetricsRows ?? []) kvMetrics[row.metric_name] = Number(row.metric_value)
  const emailRevenue = kvMetrics['email_revenue_total'] ?? 0
  const avgOpenRate = kvMetrics['avg_campaign_open_rate'] ?? 0
  const bestCampaignName = (topCampaignRows?.[0] as { name: string } | undefined)?.name ?? null
  const bestFlowName = (topFlowRows?.[0] as { name: string } | undefined)?.name ?? null

  const currRevenue = curr.reduce((s, r) => s + Number(r.total_price), 0)
  const priorRevenue = prior.reduce((s, r) => s + Number(r.total_price), 0)
  const currCount = curr.length
  const priorCount = prior.length
  const currAOV = currCount > 0 ? currRevenue / currCount : 0
  const priorAOV = priorCount > 0 ? priorRevenue / priorCount : 0
  const currency = curr[0]?.currency ?? 'USD'

  const revDelta = delta(currRevenue, priorRevenue)
  const countDelta = delta(currCount, priorCount)
  const aovDelta = delta(currAOV, priorAOV)

  // ── Build 12-month chart data from cache (avoids 1000-row PostgREST limit) ──
  // Populated by /api/metrics/refresh via get_monthly_revenue() SQL function.
  // Build a full 12-month scaffold so missing months show as zero bars.
  const cachedMonthlyRow = (metricsCache ?? []).find((r) => r.metric_name === 'revenue_by_month')
  const cachedCustomerRow = (metricsCache ?? []).find((r) => r.metric_name === 'customer_count')
  const totalCustomers = cachedCustomerRow ? Number(cachedCustomerRow.metric_value) : null

  type CachedMonth = { month: string; revenue: number; order_count?: number }
  const cachedMonths: CachedMonth[] = (cachedMonthlyRow?.metric_metadata as { data?: CachedMonth[] } | null)?.data ?? []
  const cachedByKey = new Map(cachedMonths.map((m) => [m.month, m.revenue]))

  // Always show 12 complete month buckets ending with the current month
  const monthScaffold: Array<{ month: string; revenue: number }> = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now)
    d.setMonth(d.getMonth() - i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    monthScaffold.push({ month: key, revenue: cachedByKey.get(key) ?? 0 })
  }

  const chartData = monthScaffold

  // ── Revenue alert ───────────────────────────────────────────────────────────
  const showAlert = revDelta !== null && revDelta < -10

  return (
    <div className="space-y-6">
      {/* Alert banner */}
      {showAlert && (
        <div className="flex items-start gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3">
          <svg className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 5zm0 7a1 1 0 1 1 0-2 1 1 0 0 1 0 2z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-orange-800">Revenue declined {Math.abs(revDelta!).toFixed(1)}% vs prior 30 days</p>
            <p className="text-xs text-orange-600 mt-0.5">Consider running a promotion — use the Promotion Scorer to evaluate options.</p>
          </div>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Revenue (30d)"
          value={fmt(currRevenue, currency)}
          delta={revDelta}
          sub="paid orders"
        />
        <MetricCard
          label="Orders (30d)"
          value={currCount.toLocaleString()}
          delta={countDelta}
          sub="paid orders"
        />
        <MetricCard
          label="Avg. Order Value"
          value={fmt(currAOV, currency)}
          delta={aovDelta}
          sub="paid orders"
        />
        <MetricCard
          label="Total Customers"
          value={totalCustomers !== null ? totalCustomers.toLocaleString() : '—'}
          delta={null}
          sub="distinct emails, all time"
          noAnimation
        />
      </div>

      {/* Ask AI prompts */}
      <AskAiRow
        label="Ask AI"
        prompts={[
          'Why did revenue change this month?',
          'Who should I focus on retaining?',
          "What's my biggest opportunity right now?",
        ]}
      />

      {/* Revenue chart + channel breakdown */}
      <RevenueSection
        monthlyData={chartData}
        channelData30d={channelRows ?? []}
      />

      {/* AI Intelligence Brief */}
      <AiInsightsBrief
        cachedInsights={(execInsightsCache?.insights as ExecutiveInsight[] | null) ?? null}
        calculatedAt={execInsightsCache?.calculated_at ?? null}
      />

      {/* Email Intelligence card */}
      <section className="rounded-2xl border border-cream-3 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-base font-semibold text-ink">Email Performance</h2>
            <span className="inline-flex items-center rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700">Klaviyo</span>
          </div>
          <Link href="/dashboard/klaviyo" className="font-data text-xs text-teal-deep hover:underline">
            View full report →
          </Link>
        </div>
        {!klaviyoConnected ? (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-dashed border-cream-3 bg-cream px-5 py-4">
            <svg className="h-5 w-5 shrink-0 text-ink-3" viewBox="0 0 20 20" fill="currentColor">
              <path d="M2.003 5.884 10 9.882l7.997-3.998A2 2 0 0 0 16 4H4a2 2 0 0 0-1.997 1.884z" />
              <path d="m18 8.118-8 4-8-4V14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8.118z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-ink">Connect Klaviyo to unlock email insights</p>
              <p className="text-xs text-ink-3 mt-0.5">
                See campaign revenue, open rates, and flow performance.{' '}
                <Link href="/dashboard/integrations" className="text-teal-deep hover:underline">Set up integration →</Link>
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-cream-2 bg-cream px-4 py-3">
              <p className="font-data text-xs uppercase tracking-wider text-ink-3">Email Revenue</p>
              <p className="mt-1 font-display text-xl font-semibold text-ink">{fmt(emailRevenue)}</p>
            </div>
            <div className="rounded-xl border border-cream-2 bg-cream px-4 py-3">
              <p className="font-data text-xs uppercase tracking-wider text-ink-3">Avg Open Rate</p>
              <p className="mt-1 font-display text-xl font-semibold text-ink">
                {avgOpenRate > 0 ? `${(avgOpenRate * 100).toFixed(1)}%` : '—'}
              </p>
            </div>
            <div className="rounded-xl border border-cream-2 bg-cream px-4 py-3">
              <p className="font-data text-xs uppercase tracking-wider text-ink-3">Top Campaign</p>
              <p className="mt-1 text-sm font-medium text-ink truncate" title={bestCampaignName ?? undefined}>
                {bestCampaignName ?? '—'}
              </p>
            </div>
            <div className="rounded-xl border border-cream-2 bg-cream px-4 py-3">
              <p className="font-data text-xs uppercase tracking-wider text-ink-3">Top Flow</p>
              <p className="mt-1 text-sm font-medium text-ink truncate" title={bestFlowName ?? undefined}>
                {bestFlowName ?? '—'}
              </p>
            </div>
          </div>
        )}
      </section>

      {/* SEO Intelligence card */}
      {semrushConnected && semrushData && (
        <section className="rounded-2xl border border-cream-3 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="font-display text-base font-semibold text-ink">SEO Intelligence</h2>
              <span className="inline-flex items-center rounded-full bg-[#FF642D]/10 px-2 py-0.5 text-xs font-medium text-[#FF642D]">SEMrush</span>
            </div>
            <Link href="/dashboard/semrush" className="font-data text-xs text-teal-deep hover:underline">
              View full report →
            </Link>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-cream-2 bg-cream px-4 py-3">
              <p className="font-data text-xs uppercase tracking-wider text-ink-3">Organic Keywords</p>
              <p className="mt-1 font-display text-xl font-semibold text-ink">
                {(semrushData.organic_keywords_total ?? 0).toLocaleString()}
              </p>
            </div>
            <div className="rounded-xl border border-cream-2 bg-cream px-4 py-3">
              <p className="font-data text-xs uppercase tracking-wider text-ink-3">Est. Monthly Traffic</p>
              <p className="mt-1 font-display text-xl font-semibold text-ink">
                {semrushData.organic_traffic_estimate != null
                  ? semrushData.organic_traffic_estimate >= 1000
                    ? `${(semrushData.organic_traffic_estimate / 1000).toFixed(0)}K`
                    : String(semrushData.organic_traffic_estimate)
                  : '—'}
              </p>
            </div>
            <div className="rounded-xl border border-cream-2 bg-cream px-4 py-3">
              <p className="font-data text-xs uppercase tracking-wider text-ink-3">Authority Score</p>
              <p className="mt-1 font-display text-xl font-semibold text-ink">
                {semrushData.authority_score ?? '—'}
              </p>
            </div>
            <div className="rounded-xl border border-cream-2 bg-cream px-4 py-3">
              <p className="font-data text-xs uppercase tracking-wider text-ink-3">Top Competitor</p>
              <p className="mt-1 text-sm font-medium text-ink truncate">
                {semrushData.top_competitors?.[0]?.domain ?? '—'}
              </p>
            </div>
          </div>
        </section>
      )}

      {!semrushConnected && (
        <section className="rounded-2xl border border-cream-3 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-ink">SEO Intelligence</h2>
          </div>
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-dashed border-cream-3 bg-cream px-5 py-4">
            <svg className="h-5 w-5 shrink-0 text-ink-3" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="9" cy="9" r="6" /><path d="m15 15 3 3" strokeLinecap="round" />
            </svg>
            <div>
              <p className="text-sm font-medium text-ink">Connect SEMrush to unlock SEO insights</p>
              <p className="text-xs text-ink-3 mt-0.5">
                Track keyword rankings, competitors, and organic traffic trends.{' '}
                <Link href="/dashboard/integrations" className="text-teal-deep hover:underline">Set up integration →</Link>
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Top customers + recent orders */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Top 10 customers by LTV */}
        <section className="rounded-2xl border border-cream-3 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between border-b border-cream-2 px-5 py-3.5">
            <h2 className="font-display text-sm font-semibold text-ink">Top Customers</h2>
            <span className="font-data text-xs text-ink-3">by lifetime value</span>
          </div>
          {customers.length === 0 ? (
            <EmptyState label="No customer data yet" />
          ) : (
            <div className="divide-y divide-cream-2">
              {customers.map((c, i) => (
                <div key={c.shopify_customer_id} className="flex items-center justify-between px-5 py-3 hover:bg-cream transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-data text-xs text-ink-3 w-5 shrink-0">{i + 1}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink truncate">
                        {c.first_name || c.last_name
                          ? `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim()
                          : c.email ?? 'Guest'}
                      </p>
                      <p className="text-xs text-ink-3">{c.orders_count} orders</p>
                    </div>
                  </div>
                  <span className="font-data text-sm font-medium text-ink shrink-0">
                    {fmt(c.total_spent, currency)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Recent 20 orders */}
        <section className="rounded-2xl border border-cream-3 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between border-b border-cream-2 px-5 py-3.5">
            <h2 className="font-display text-sm font-semibold text-ink">Recent Orders</h2>
            <span className="font-data text-xs text-ink-3">Last 20</span>
          </div>
          {orders.length === 0 ? (
            <EmptyState label="No orders yet — sync to import data" />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-cream-2 text-xs font-medium text-ink-3">
                    <th className="px-5 py-2.5 text-left">Order</th>
                    <th className="px-5 py-2.5 text-left">Date</th>
                    <th className="px-5 py-2.5 text-left">Status</th>
                    <th className="px-5 py-2.5 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cream-2">
                  {orders.map((order) => (
                    <tr key={order.id} className="hover:bg-cream transition-colors">
                      <td className="px-5 py-2.5 font-data font-medium text-ink text-xs">
                        {order.order_number}
                      </td>
                      <td className="px-5 py-2.5 text-xs text-ink-2">
                        {fmtDate(order.processed_at)}
                      </td>
                      <td className="px-5 py-2.5">
                        {statusBadge(order.financial_status)}
                      </td>
                      <td className="px-5 py-2.5 text-right font-data text-xs font-medium text-ink">
                        {fmt(order.total_price, order.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  delta: d,
  sub,
  noAnimation,
}: {
  label: string
  value: string
  delta: number | null
  sub: string
  noAnimation?: boolean
}) {
  const isPos = d !== null && d >= 0
  return (
    <div className="rounded-2xl border border-cream-3 bg-white px-5 py-5 shadow-sm">
      <p className="font-data text-xs uppercase tracking-wider text-ink-3">{label}</p>
      <p className={`mt-2 font-display text-3xl font-semibold text-ink ${noAnimation ? '' : 'animate-count-up'}`}>
        {value}
      </p>
      <div className="mt-1.5 flex items-center gap-1.5">
        {d !== null ? (
          <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${isPos ? 'text-teal-deep' : 'text-red-500'}`}>
            <svg className="h-3 w-3" viewBox="0 0 12 12" fill="currentColor">
              {isPos
                ? <path d="M6 2l4 6H2l4-6z" />
                : <path d="M6 10L2 4h8l-4 6z" />}
            </svg>
            {Math.abs(d).toFixed(1)}%
          </span>
        ) : null}
        <span className="text-xs text-ink-3">{sub}</span>
      </div>
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="px-5 py-10 text-center text-sm text-ink-3">{label}</div>
  )
}
