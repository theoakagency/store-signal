import { createSupabaseServerClient } from '@/lib/supabase'

export const metadata = {
  title: 'Executive Summary — Store Signal',
}

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

// ── Bar Chart ─────────────────────────────────────────────────────────────────

function BarChart({ data }: { data: { month: string; revenue: number }[] }) {
  const max = Math.max(...data.map((d) => d.revenue), 1)
  const chartH = 120
  const barW = 24
  const gap = 8
  const totalW = data.length * (barW + gap) - gap

  return (
    <div className="mt-4 overflow-x-auto pb-2">
      <svg
        width={totalW}
        height={chartH + 28}
        viewBox={`0 0 ${totalW} ${chartH + 28}`}
        className="min-w-full"
        aria-label="Monthly revenue bar chart"
      >
        {data.map((d, i) => {
          const barH = Math.max(4, (d.revenue / max) * chartH)
          const x = i * (barW + gap)
          const y = chartH - barH
          return (
            <g key={d.month}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={barH}
                rx={4}
                fill="#4BBFAD"
                opacity={i === data.length - 1 ? 0.5 : 1}
              />
              <text
                x={x + barW / 2}
                y={chartH + 16}
                textAnchor="middle"
                fontSize={9}
                fill="#888888"
                fontFamily="DM Mono, monospace"
              >
                {d.month}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
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
  const twelveMonthsAgo = new Date(now)
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)

  // ── Fetch paid orders for stats (current + prior 30 days) ──────────────────
  const [{ data: currentRows }, { data: priorRows }, { data: recentOrders }, { data: topCustomers }] =
    await Promise.all([
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
    ])

  const curr = currentRows ?? []
  const prior = priorRows ?? []
  const orders = (recentOrders ?? []) as Order[]
  const customers = (topCustomers ?? []) as Customer[]

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

  // ── Build 12-month bar chart data ───────────────────────────────────────────
  const monthMap: Record<string, number> = {}
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now)
    d.setMonth(d.getMonth() - i)
    const key = d.toLocaleString('en-US', { month: 'short' })
    monthMap[key] = 0
  }

  // Fetch all paid orders for 12 months for chart
  const { data: chartRows } = await supabase
    .from('orders')
    .select('total_price, processed_at')
    .eq('financial_status', 'paid')
    .gte('processed_at', twelveMonthsAgo.toISOString())

  for (const row of chartRows ?? []) {
    if (!row.processed_at) continue
    const key = new Date(row.processed_at).toLocaleString('en-US', { month: 'short' })
    if (key in monthMap) monthMap[key] += Number(row.total_price)
  }

  const chartData = Object.entries(monthMap).map(([month, revenue]) => ({ month, revenue }))

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
          value={customers.length > 0 ? '—' : '0'}
          delta={null}
          sub="all time"
          noAnimation
        />
      </div>

      {/* Revenue chart */}
      <section className="rounded-2xl border border-cream-3 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-ink">Monthly Revenue</h2>
          <span className="font-data text-xs text-ink-3">Last 12 months</span>
        </div>
        <BarChart data={chartData} />
      </section>

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
