/**
 * GET /api/shopify/debug
 * Checks token scopes, DB order range, and tests specific date windows.
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

function ordersUrl(params: Record<string, string>) {
  const p = new URLSearchParams({ limit: '5', status: 'any', ...params })
  return `https://${SHOPIFY_STORE}/admin/api/2024-10/orders.json?${p}`
}

function daysAgo(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
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

  // 1. Check scopes — correct endpoint is NOT versioned
  const scopesUrl = `https://${SHOPIFY_STORE}/admin/oauth/access_scopes.json`
  const scopesResult = await shopifyGet(scopesUrl, token).catch((e: unknown) => ({
    status: 0,
    body: { error: String(e) },
  }))

  // 2. Orders already in DB
  const { data: dbRange } = await supabase
    .from('orders')
    .select('processed_at')
    .eq('store_id', STORE_ID)
    .order('processed_at', { ascending: true })
    .limit(1)
  const { data: dbRangeMax } = await supabase
    .from('orders')
    .select('processed_at')
    .eq('store_id', STORE_ID)
    .order('processed_at', { ascending: false })
    .limit(1)
  const { count: dbTotal } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('store_id', STORE_ID)

  // 3. Recent (last 7d) — baseline, should always work
  const r7 = await shopifyGet(ordersUrl({ created_at_min: daysAgo(7) }), token)

  // 4. 61–91 days ago — just past the 60d scope boundary
  const r91 = await shopifyGet(
    ordersUrl({ created_at_min: daysAgo(91), created_at_max: daysAgo(61) }),
    token
  )

  // 5. 120–90 days ago
  const r120 = await shopifyGet(
    ordersUrl({ created_at_min: daysAgo(120), created_at_max: daysAgo(90) }),
    token
  )

  // 6. 365–335 days ago
  const r365 = await shopifyGet(
    ordersUrl({ created_at_min: daysAgo(365), created_at_max: daysAgo(335) }),
    token
  )

  // 7. All time — no date filter, just count
  const rAll = await shopifyGet(
    `https://${SHOPIFY_STORE}/admin/api/2024-10/orders/count.json?status=any`,
    token
  )

  return Response.json({
    store: SHOPIFY_STORE,
    store_env_had_trailing_newline: process.env.SHOPIFY_RETAIL_STORE !== SHOPIFY_STORE,
    scopes: scopesResult.status === 200
      ? (scopesResult.body as { access_scopes?: { handle: string }[] }).access_scopes?.map((s: { handle: string }) => s.handle)
      : { error: scopesResult.body, status: scopesResult.status },
    db_orders: {
      total: dbTotal,
      oldest_processed_at: dbRange?.[0]?.processed_at ?? null,
      newest_processed_at: dbRangeMax?.[0]?.processed_at ?? null,
    },
    shopify_total_orders: rAll.body,
    tests: {
      last_7d: { orders: r7.body.orders?.length, sample_date: r7.body.orders?.[0]?.created_at },
      '91_to_61d_ago': { orders: r91.body.orders?.length, range: `${daysAgo(91)} → ${daysAgo(61)}` },
      '120_to_90d_ago': { orders: r120.body.orders?.length, range: `${daysAgo(120)} → ${daysAgo(90)}` },
      '365_to_335d_ago': { orders: r365.body.orders?.length, range: `${daysAgo(365)} → ${daysAgo(335)}` },
    },
  })
}
