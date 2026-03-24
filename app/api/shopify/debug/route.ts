/**
 * GET /api/shopify/debug
 * Checks token scopes and tests the API with multiple date windows.
 * Remove after debugging.
 */
import { createSupabaseServiceClient } from '@/lib/supabase'

const SHOPIFY_STORE = process.env.SHOPIFY_RETAIL_STORE!
const STORE_ID = '00000000-0000-0000-0000-000000000002'

async function shopifyGet(path: string, token: string) {
  const res = await fetch(`https://${SHOPIFY_STORE}/admin/api/2024-10/${path}`, {
    headers: { 'X-Shopify-Access-Token': token },
  })
  return { status: res.status, body: await res.json() }
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

  // 1. Check what scopes the token actually has
  const scopesResult = await shopifyGet('oauth/access_scopes.json', token).catch((e) => ({ status: 0, body: { error: String(e) } }))

  // 2. Test with last 7 days (should always return orders if token works)
  const d7 = new Date(); d7.setDate(d7.getDate() - 7)
  const recent = await shopifyGet(
    `orders.json?limit=5&status=any&created_at_min=${d7.toISOString()}`,
    token
  )

  // 3. Test with a range 90 days ago (crosses the 60-day scope boundary)
  const d90 = new Date(); d90.setDate(d90.getDate() - 90)
  const d60 = new Date(); d60.setDate(d60.getDate() - 60)
  const old90 = await shopifyGet(
    `orders.json?limit=5&status=any&created_at_min=${d90.toISOString()}&created_at_max=${d60.toISOString()}`,
    token
  )

  // 4. Test with a range from exactly one year ago
  const d365 = new Date(); d365.setFullYear(d365.getFullYear() - 1)
  const d335 = new Date(); d335.setDate(d365.getDate() + 30)
  const old365 = await shopifyGet(
    `orders.json?limit=5&status=any&created_at_min=${d365.toISOString()}&created_at_max=${d335.toISOString()}`,
    token
  )

  return Response.json({
    store: SHOPIFY_STORE,
    token_prefix: token.slice(0, 8) + '...',
    scopes: scopesResult,
    test_last_7d: {
      status: recent.status,
      order_count: recent.body.orders?.length ?? 'N/A',
      first_order_created: recent.body.orders?.[0]?.created_at ?? null,
    },
    test_90d_to_60d_ago: {
      status: old90.status,
      order_count: old90.body.orders?.length ?? 'N/A',
      range: `${d90.toISOString()} → ${d60.toISOString()}`,
    },
    test_365d_to_335d_ago: {
      status: old365.status,
      order_count: old365.body.orders?.length ?? 'N/A',
      range: `${d365.toISOString()} → ${d335.toISOString()}`,
    },
  })
}
