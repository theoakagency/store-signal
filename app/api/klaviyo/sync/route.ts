import { NextRequest } from 'next/server'
import { createSupabaseServiceClient, createSupabaseServerClient } from '@/lib/supabase'
import { getEnrichedCampaigns, getEnrichedFlows, getLists } from '@/lib/klaviyo'

export const maxDuration = 300

const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const STORE_ID = '00000000-0000-0000-0000-000000000002'

export async function POST(req: NextRequest) {
  // Auth check
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createSupabaseServiceClient()

  // Load API key from stores table
  const { data: store } = await service
    .from('stores')
    .select('klaviyo_api_key, klaviyo_account_id')
    .eq('id', STORE_ID)
    .single()

  const apiKey = store?.klaviyo_api_key
  if (!apiKey) {
    return Response.json(
      { error: 'Klaviyo not connected — add your API key in Integrations' },
      { status: 401 }
    )
  }

  const results = {
    campaigns: 0,
    flows: 0,
    errors: [] as string[],
  }

  // ── Sync campaigns ────────────────────────────────────────────────────────────
  try {
    const campaigns = await getEnrichedCampaigns(apiKey)
    const rows = campaigns.map((c) => ({
      id: c.id,
      tenant_id: TENANT_ID,
      name: c.name,
      subject: c.subject,
      status: c.status,
      send_time: c.send_time,
      recipient_count: c.recipient_count,
      open_rate: c.open_rate,
      click_rate: c.click_rate,
      revenue_attributed: c.revenue_attributed,
      unsubscribe_count: c.unsubscribe_count,
      created_at: c.created_at,
      updated_at: c.updated_at,
      synced_at: new Date().toISOString(),
    }))

    if (rows.length > 0) {
      const { error } = await service
        .from('klaviyo_campaigns')
        .upsert(rows, { onConflict: 'id' })
      if (error) results.errors.push(`Campaigns upsert: ${error.message}`)
      else results.campaigns = rows.length
    }

    // ── Calculate and cache metrics ─────────────────────────────────────────────
    const now = new Date().toISOString()
    const totalCampaignRevenue = campaigns.reduce((s, c) => s + c.revenue_attributed, 0)
    const campaignsWithRates = campaigns.filter((c) => c.open_rate !== null)
    const avgOpenRate = campaignsWithRates.length > 0
      ? campaignsWithRates.reduce((s, c) => s + (c.open_rate ?? 0), 0) / campaignsWithRates.length
      : 0
    const avgClickRate = campaignsWithRates.length > 0
      ? campaignsWithRates.reduce((s, c) => s + (c.click_rate ?? 0), 0) / campaignsWithRates.length
      : 0
    const totalUnsubscribes = campaigns.reduce((s, c) => s + c.unsubscribe_count, 0)

    const sortedByRevenue = [...campaigns].sort((a, b) => b.revenue_attributed - a.revenue_attributed)
    const bestCampaign = sortedByRevenue[0]
    const worstCampaign = sortedByRevenue[sortedByRevenue.length - 1]

    // Avg customer LTV for unsubscribe cost estimate
    const { data: orderStats } = await service
      .from('orders')
      .select('total_price')
      .eq('store_id', STORE_ID)
      .eq('financial_status', 'paid')

    const { data: custStats } = await service
      .from('customers')
      .select('total_spent')
      .eq('store_id', STORE_ID)

    const totalOrderRevenue = (orderStats ?? []).reduce((s, r) => s + Number(r.total_price), 0)
    const totalCustomers = (custStats ?? []).length
    const avgLTV = totalCustomers > 0 ? totalOrderRevenue / totalCustomers : 0
    const estimatedUnsubscribeCost = totalUnsubscribes * avgLTV

    const campaignsNegativeROI = campaigns.filter((c) => {
      const estCost = c.recipient_count * 0.002  // ~$0.002 per email sent
      return c.revenue_attributed < estCost
    }).length

    const campaignMetrics = [
      { metric_name: 'total_campaign_revenue', metric_value: totalCampaignRevenue, metric_metadata: {} },
      { metric_name: 'avg_campaign_open_rate', metric_value: avgOpenRate, metric_metadata: {} },
      { metric_name: 'avg_campaign_click_rate', metric_value: avgClickRate, metric_metadata: {} },
      { metric_name: 'total_campaign_unsubscribes', metric_value: totalUnsubscribes, metric_metadata: {} },
      { metric_name: 'estimated_unsubscribe_cost', metric_value: estimatedUnsubscribeCost, metric_metadata: { avg_ltv: avgLTV } },
      { metric_name: 'campaigns_with_negative_roi', metric_value: campaignsNegativeROI, metric_metadata: {} },
      {
        metric_name: 'best_performing_campaign',
        metric_value: bestCampaign?.revenue_attributed ?? 0,
        metric_metadata: { name: bestCampaign?.name ?? null },
      },
      {
        metric_name: 'worst_performing_campaign',
        metric_value: worstCampaign?.revenue_attributed ?? 0,
        metric_metadata: { name: worstCampaign?.name ?? null },
      },
    ]

    await service
      .from('klaviyo_metrics_cache')
      .upsert(
        campaignMetrics.map((m) => ({ tenant_id: TENANT_ID, ...m, calculated_at: now })),
        { onConflict: 'tenant_id,metric_name' }
      )
  } catch (err) {
    results.errors.push(`Campaigns: ${(err as Error).message}`)
  }

  // ── Sync flows ────────────────────────────────────────────────────────────────
  try {
    const flows = await getEnrichedFlows(apiKey)
    const rows = flows.map((f) => ({
      id: f.id,
      tenant_id: TENANT_ID,
      name: f.name,
      status: f.status,
      trigger_type: f.trigger_type,
      revenue_attributed: f.revenue_attributed,
      recipient_count: f.recipient_count,
      open_rate: f.open_rate,
      click_rate: f.click_rate,
      conversion_rate: f.conversion_rate,
      created_at: f.created_at,
      updated_at: f.updated_at,
      synced_at: new Date().toISOString(),
    }))

    if (rows.length > 0) {
      const { error } = await service
        .from('klaviyo_flows')
        .upsert(rows, { onConflict: 'id' })
      if (error) results.errors.push(`Flows upsert: ${error.message}`)
      else results.flows = rows.length
    }

    // Flow metrics
    const now = new Date().toISOString()
    const totalFlowRevenue = flows.reduce((s, f) => s + f.revenue_attributed, 0)
    const sortedFlows = [...flows].sort((a, b) => b.revenue_attributed - a.revenue_attributed)
    const bestFlow = sortedFlows[0]

    // Fetch total Shopify revenue for email vs total ratio
    const { data: shopifyRevRows } = await service
      .from('orders')
      .select('total_price')
      .eq('store_id', STORE_ID)
      .eq('financial_status', 'paid')
    const shopifyRevenue = (shopifyRevRows ?? []).reduce((s, r) => s + Number(r.total_price), 0)

    const { data: campaignRevenueRow } = await service
      .from('klaviyo_metrics_cache')
      .select('metric_value')
      .eq('tenant_id', TENANT_ID)
      .eq('metric_name', 'total_campaign_revenue')
      .single()
    const campaignRevenue = Number(campaignRevenueRow?.metric_value ?? 0)
    const emailRevenue = campaignRevenue + totalFlowRevenue
    const emailVsTotal = shopifyRevenue > 0 ? emailRevenue / shopifyRevenue : 0

    const flowMetrics = [
      { metric_name: 'total_flow_revenue', metric_value: totalFlowRevenue, metric_metadata: {} },
      { metric_name: 'email_revenue_total', metric_value: emailRevenue, metric_metadata: {} },
      { metric_name: 'email_revenue_vs_total', metric_value: emailVsTotal, metric_metadata: { shopify_revenue: shopifyRevenue } },
      {
        metric_name: 'best_performing_flow',
        metric_value: bestFlow?.revenue_attributed ?? 0,
        metric_metadata: { name: bestFlow?.name ?? null },
      },
    ]

    await service
      .from('klaviyo_metrics_cache')
      .upsert(
        flowMetrics.map((m) => ({ tenant_id: TENANT_ID, ...m, calculated_at: now })),
        { onConflict: 'tenant_id,metric_name' }
      )
  } catch (err) {
    results.errors.push(`Flows: ${(err as Error).message}`)
  }

  const status = results.errors.length > 0 ? 207 : 200
  return Response.json(results, { status })
}

export async function GET(req: NextRequest) {
  return POST(req)
}
