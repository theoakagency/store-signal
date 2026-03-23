import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase'
import SyncButton from './SyncButton'

export const metadata = {
  title: 'Dashboard — Store Signal',
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

interface StoreStats {
  totalRevenue: number
  orderCount: number
  averageOrderValue: number
  currency: string
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatCurrency(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount)
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(dateStr))
}

function statusBadge(status: string | null) {
  if (!status) return null
  const styles: Record<string, string> = {
    paid: 'bg-green-50 text-green-700 ring-green-600/20',
    pending: 'bg-yellow-50 text-yellow-700 ring-yellow-600/20',
    refunded: 'bg-gray-50 text-gray-700 ring-gray-600/20',
    voided: 'bg-gray-50 text-gray-700 ring-gray-600/20',
    fulfilled: 'bg-blue-50 text-blue-700 ring-blue-600/20',
    partial: 'bg-orange-50 text-orange-700 ring-orange-600/20',
    unfulfilled: 'bg-gray-50 text-gray-500 ring-gray-500/20',
  }
  const cls = styles[status] ?? 'bg-gray-50 text-gray-700 ring-gray-600/20'
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}
    >
      {status}
    </span>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Middleware handles the redirect, but we double-check here for type safety
  if (!user) redirect('/login')

  // Fetch aggregate stats
  const { data: statsRows, error: statsError } = await supabase
    .from('orders')
    .select('total_price, currency')
    .eq('financial_status', 'paid')

  // Fetch 10 most recent orders
  const { data: recentOrders, error: ordersError } = await supabase
    .from('orders')
    .select(
      'id, order_number, email, financial_status, fulfillment_status, total_price, currency, processed_at'
    )
    .order('processed_at', { ascending: false })
    .limit(10)

  const orders = (recentOrders ?? []) as Order[]

  const stats: StoreStats = (() => {
    if (!statsRows || statsRows.length === 0) {
      return { totalRevenue: 0, orderCount: 0, averageOrderValue: 0, currency: 'USD' }
    }
    const totalRevenue = statsRows.reduce((sum, r) => sum + Number(r.total_price), 0)
    const orderCount = statsRows.length
    return {
      totalRevenue,
      orderCount,
      averageOrderValue: totalRevenue / orderCount,
      currency: statsRows[0].currency ?? 'USD',
    }
  })()

  const hasError = statsError || ordersError

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <span className="text-lg font-bold tracking-tight text-gray-900">
            Store<span className="text-indigo-600">Signal</span>
          </span>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">{user.email}</span>
            <form action="/api/auth/signout" method="POST">
              <button
                type="submit"
                className="text-sm font-medium text-gray-600 hover:text-gray-900 transition"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {/* Page heading */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">LashBox LA — Retail</h1>
            <p className="mt-1 text-sm text-gray-500">Shopify store overview</p>
          </div>
          <SyncButton />
        </div>

        {hasError && (
          <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Some data could not be loaded. Have you run the Shopify sync yet?{' '}
            <code className="font-mono">POST /api/shopify/sync</code>
          </div>
        )}

        {/* KPI cards */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            label="Total Revenue"
            value={formatCurrency(stats.totalRevenue, stats.currency)}
            sub="paid orders"
          />
          <StatCard
            label="Order Count"
            value={stats.orderCount.toLocaleString()}
            sub="paid orders"
          />
          <StatCard
            label="Avg. Order Value"
            value={formatCurrency(stats.averageOrderValue, stats.currency)}
            sub="paid orders"
          />
        </div>

        {/* Recent orders table */}
        <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <h2 className="text-sm font-semibold text-gray-900">Recent Orders</h2>
            <span className="text-xs text-gray-400">Last 10</span>
          </div>

          {orders.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-gray-400">
              No orders yet — click <span className="font-medium text-gray-600">Sync now</span> to import data.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100 text-sm">
                <thead>
                  <tr className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <th className="px-6 py-3 text-left">Order</th>
                    <th className="px-6 py-3 text-left">Date</th>
                    <th className="px-6 py-3 text-left">Customer</th>
                    <th className="px-6 py-3 text-left">Payment</th>
                    <th className="px-6 py-3 text-left">Fulfillment</th>
                    <th className="px-6 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {orders.map((order) => (
                    <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-3 font-mono font-medium text-gray-900">
                        {order.order_number}
                      </td>
                      <td className="px-6 py-3 text-gray-500">
                        {formatDate(order.processed_at)}
                      </td>
                      <td className="px-6 py-3 text-gray-600">
                        {order.email ?? <span className="text-gray-400 italic">Guest</span>}
                      </td>
                      <td className="px-6 py-3">
                        {statusBadge(order.financial_status)}
                      </td>
                      <td className="px-6 py-3">
                        {statusBadge(order.fulfillment_status ?? 'unfulfilled')}
                      </td>
                      <td className="px-6 py-3 text-right font-medium text-gray-900">
                        {formatCurrency(order.total_price, order.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
}: {
  label: string
  value: string
  sub: string
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-6 py-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-gray-900">{value}</p>
      <p className="mt-1 text-xs text-gray-400">{sub}</p>
    </div>
  )
}
