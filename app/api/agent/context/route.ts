/**
 * GET  /api/agent/context — return cached context
 * POST /api/agent/context — rebuild and cache context snapshot
 *
 * Called on first chat of the day or when manually refreshed.
 * The cached context is injected into every system prompt.
 */
import { NextRequest } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const STORE_ID = '00000000-0000-0000-0000-000000000002'

export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createSupabaseServiceClient()
  const { data } = await service
    .from('agent_context_cache')
    .select('context, calculated_at')
    .eq('tenant_id', TENANT_ID)
    .maybeSingle()

  return Response.json({ context: data?.context ?? null, calculated_at: data?.calculated_at ?? null })
}

export async function POST(_req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createSupabaseServiceClient()

  const [
    { data: store },
    { data: recentOrders },
    { data: customers },
    { data: metaCampaigns },
    { data: googleCampaigns },
    { data: klaviyoCampaigns },
    { data: klaviyoFlows },
    { data: gscKeywords },
    { data: promotions },
  ] = await Promise.all([
    service.from('stores').select('shopify_domain, name, klaviyo_api_key, gsc_refresh_token, meta_access_token, google_ads_refresh_token, ga4_refresh_token, last_synced_at').eq('id', STORE_ID).single(),
    service.from('orders').select('total_price, created_at').eq('tenant_id', TENANT_ID).eq('financial_status', 'paid').gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString()),
    service.from('customers').select('total_spent, orders_count, updated_at').eq('tenant_id', TENANT_ID),
    service.from('meta_campaigns').select('spend, roas, purchase_value, purchases, status').eq('tenant_id', TENANT_ID),
    service.from('google_campaigns').select('conversion_value, conversions, data_source').eq('tenant_id', TENANT_ID),
    service.from('klaviyo_campaigns').select('revenue, recipients, opens, name').eq('tenant_id', TENANT_ID).order('revenue', { ascending: false }).limit(3),
    service.from('klaviyo_flows').select('revenue, name').eq('tenant_id', TENANT_ID).order('revenue', { ascending: false }).limit(3),
    service.from('gsc_keywords').select('keyword, clicks, position').eq('tenant_id', TENANT_ID).order('clicks', { ascending: false }).limit(5),
    service.from('promotions').select('name, score').eq('tenant_id', TENANT_ID).order('score', { ascending: false }).limit(3),
  ])

  const s = store as {
    shopify_domain: string; name: string
    klaviyo_api_key: string | null; gsc_refresh_token: string | null
    meta_access_token: string | null; google_ads_refresh_token: string | null
    ga4_refresh_token: string | null; last_synced_at: string | null
  } | null

  const now = Date.now()
  const MS_90 = 90 * 24 * 60 * 60 * 1000

  const revenue30d = (recentOrders ?? []).reduce((s, o) => s + Number(o.total_price), 0)
  const orderCount30d = (recentOrders ?? []).length
  const allCustomers = customers ?? []
  const lapsedCount = allCustomers.filter((c) => now - new Date(c.updated_at).getTime() > MS_90).length
  const vipCount = allCustomers.filter((c) => Number(c.total_spent) >= 1000 && c.orders_count >= 5).length

  const metaSpend = (metaCampaigns ?? []).reduce((a, c) => a + Number(c.spend), 0)
  const metaRevenue = (metaCampaigns ?? []).reduce((a, c) => a + Number(c.purchase_value), 0)
  const metaRoas = metaSpend > 0 ? metaRevenue / metaSpend : 0
  const googleRevenue = (googleCampaigns ?? []).reduce((a, c) => a + Number(c.conversion_value ?? 0), 0)
  const emailRevenue = (klaviyoCampaigns ?? []).reduce((a, c) => a + Number(c.revenue), 0)
    + (klaviyoFlows ?? []).reduce((a, c) => a + Number(c.revenue), 0)

  const context = {
    business: {
      name: s?.name ?? 'Store',
      domain: s?.shopify_domain ?? '',
      last_synced: s?.last_synced_at ?? null,
      connected_platforms: {
        shopify: true,
        klaviyo: !!s?.klaviyo_api_key,
        google_search_console: !!s?.gsc_refresh_token,
        meta_ads: !!s?.meta_access_token,
        google_ads: !!s?.google_ads_refresh_token,
        google_analytics: !!s?.ga4_refresh_token,
      },
    },
    revenue_snapshot: {
      last_30d: Math.round(revenue30d * 100) / 100,
      order_count_30d: orderCount30d,
      avg_order_value: orderCount30d > 0 ? Math.round((revenue30d / orderCount30d) * 100) / 100 : 0,
    },
    customer_snapshot: {
      total: allCustomers.length,
      vip: vipCount,
      lapsed: lapsedCount,
      lapsed_rate: allCustomers.length > 0 ? ((lapsedCount / allCustomers.length) * 100).toFixed(1) + '%' : 'N/A',
    },
    email_snapshot: s?.klaviyo_api_key ? {
      top_campaigns: (klaviyoCampaigns ?? []).map((c) => ({ name: c.name, revenue: Number(c.revenue) })),
      top_flows: (klaviyoFlows ?? []).map((f) => ({ name: f.name, revenue: Number(f.revenue) })),
      total_email_revenue: Math.round(emailRevenue * 100) / 100,
    } : null,
    search_snapshot: s?.gsc_refresh_token ? {
      top_keywords: (gscKeywords ?? []).map((k) => ({ keyword: k.keyword, clicks: k.clicks, position: Number(k.position).toFixed(1) })),
    } : null,
    ads_snapshot: s?.meta_access_token ? {
      meta_spend_90d: Math.round(metaSpend * 100) / 100,
      meta_roas: Math.round(metaRoas * 100) / 100,
      google_revenue_90d: Math.round(googleRevenue * 100) / 100,
    } : null,
    top_promotions: (promotions ?? []).map((p) => ({ name: p.name, score: p.score })),
  }

  await service.from('agent_context_cache').upsert({
    tenant_id: TENANT_ID,
    context,
    calculated_at: new Date().toISOString(),
  }, { onConflict: 'tenant_id' })

  return Response.json({ context, ok: true })
}
