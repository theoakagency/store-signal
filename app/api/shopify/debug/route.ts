/**
 * GET /api/shopify/debug
 * Checks token scopes, oldest Shopify orders, and date-range tests.
 * Remove after debugging.
 */
import { createSupabaseServiceClient } from '@/lib/supabase'

const SHOPIFY_STORE = (process.env.SHOPIFY_RETAIL_STORE ?? '').trim()
const STORE_ID = '00000000-0000-0000-0000-000000000002'

async function shopifyGet(url: string, token: string) {
  const res = await fetch(url, {
    headers: { 'X-Shopify-Access-Token': token },
  })
  return { status: res.status, body: await res.json() }
}

function base(path: string) {
  return `https://${SHOPIFY_STORE}/admin/api/2024-10/${path}`
}

export async function GET() {
  const supabase = createSupabaseServiceClient()
  const { data: store } = await supabase
    .from('stores')
    .select('shopify_access_token')
    .eq('id', STORE_ID)
    .single()

  const token = store?.shopify_access_token
  if (!token) return Response.json({ error: 'No token in DB' })

  // 1. Scopes
  const scopesRes = await shopifyGet(
    `https://${SHOPIFY_STORE}/admin/oauth/access_scopes.json`,
    token
  ).catch(() => ({ status: 0, body: {} }))
  const scopes = (scopesRes.body as { access_scopes?: { handle: string }[] }).access_scopes?.map(
    (s: { handle: string }) => s.handle
  ) ?? scopesRes.body

  // 2. Oldest 3 orders in the entire store (created_at ASC)
  const oldestRes = await shopifyGet(
    base('orders.json?limit=3&status=any&order=created_at+asc'),
    token
  )
  const oldestOrders = (oldestRes.body as { orders?: { id: number; created_at: string; financial_status: string }[] }).orders?.map(
    (o) => ({ id: o.id, created_at: o.created_at, financial_status: o.financial_status })
  ) ?? []

  // 3. Newest 3 orders
  const newestRes = await shopifyGet(
    base('orders.json?limit=3&status=any&order=created_at+desc'),
    token
  )
  const newestOrders = (newestRes.body as { orders?: { id: number; created_at: string; financial_status: string }[] }).orders?.map(
    (o) => ({ id: o.id, created_at: o.created_at, financial_status: o.financial_status })
  ) ?? []

  // 4. Total count (all time)
  const countRes = await shopifyGet(base('orders/count.json?status=any'), token)

  // 5. Count with explicit date range tests
  const ranges: Record<string, string> = {
    'last_30d':  `orders/count.json?status=any&created_at_min=${daysAgo(30)}`,
    'last_60d':  `orders/count.json?status=any&created_at_min=${daysAgo(60)}`,
    'last_90d':  `orders/count.json?status=any&created_at_min=${daysAgo(90)}`,
    'last_180d': `orders/count.json?status=any&created_at_min=${daysAgo(180)}`,
    'last_365d': `orders/count.json?status=any&created_at_min=${daysAgo(365)}`,
    '2024_full': `orders/count.json?status=any&created_at_min=2024-01-01T00:00:00Z&created_at_max=2024-12-31T23:59:59Z`,
    '2025_full': `orders/count.json?status=any&created_at_min=2025-01-01T00:00:00Z&created_at_max=2025-12-31T23:59:59Z`,
    '2026_ytd':  `orders/count.json?status=any&created_at_min=2026-01-01T00:00:00Z`,
  }

  const rangeCounts: Record<string, number | string> = {}
  for (const [label, path] of Object.entries(ranges)) {
    const r = await shopifyGet(base(path), token)
    rangeCounts[label] = (r.body as { count?: number }).count ?? `error: ${JSON.stringify(r.body)}`
  }

  // 6. DB summary
  const { count: dbTotal } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('store_id', STORE_ID)
  const { data: dbOldest } = await supabase
    .from('orders')
    .select('processed_at, created_at')
    .eq('store_id', STORE_ID)
    .order('processed_at', { ascending: true })
    .limit(1)

  return Response.json({
    store: SHOPIFY_STORE,
    scopes,
    has_read_all_orders: Array.isArray(scopes) && scopes.includes('read_all_orders'),
    shopify: {
      total_all_time: (countRes.body as { count?: number }).count,
      oldest_orders: oldestOrders,
      newest_orders: newestOrders,
      counts_by_period: rangeCounts,
    },
    db: {
      total: dbTotal,
      oldest_processed_at: dbOldest?.[0]?.processed_at ?? null,
    },
  })
}

function daysAgo(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}
