import { NextRequest } from 'next/server'
import { createSupabaseServiceClient, createSupabaseServerClient } from '@/lib/supabase'
import { getEnrichedCampaigns, getEnrichedFlows, getLists } from '@/lib/klaviyo'

export const maxDuration = 300

const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const STORE_ID = '00000000-0000-0000-0000-000000000002'

export async function POST(req: NextRequest) {
  // Auth check — allow internal cron calls with CRON_SECRET
  const isCron = req.headers.get('Authorization') === `Bearer ${process.env.CRON_SECRET ?? ''}`
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user && !isCron) return Response.json({ error: 'Unauthorized' }, { status: 401 })

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
    detail: {} as Record<string, unknown>,
  }

  // ── Write sync_log entry ──────────────────────────────────────────────────────
  const { data: logRow } = await service
    .from('sync_log')
    .insert({
      tenant_id: TENANT_ID,
      store_id: STORE_ID,
      sync_type: 'klaviyo',
      status: 'running',
      metadata: { started: new Date().toISOString() },
    })
    .select('id')
    .single()
  const logId = logRow?.id ?? null

  async function updateLog(patch: Record<string, unknown>) {
    if (!logId) return
    await service.from('sync_log').update(patch).eq('id', logId)
  }

  // ── Sync campaigns (email + SMS) ──────────────────────────────────────────────
  try {
    await updateLog({ metadata: { stage: 'fetching_campaigns' } })
    const [emailCampaigns, smsCampaigns] = await Promise.all([
      getEnrichedCampaigns(apiKey, 'email'),
      getEnrichedCampaigns(apiKey, 'sms'),
    ])
    const campaigns = [...emailCampaigns, ...smsCampaigns]
    results.detail = { campaignCount: campaigns.length, emailCount: emailCampaigns.length, smsCount: smsCampaigns.length }
    const rows = campaigns.map((c) => ({
      id: c.id,
      tenant_id: TENANT_ID,
      name: c.name,
      subject: c.subject,
      channel: c.channel,
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

    // Per-channel campaign splits
    const totalCampaignRevenue = campaigns.reduce((s, c) => s + c.revenue_attributed, 0)
    const totalCampaignRecipients = campaigns.reduce((s, c) => s + c.recipient_count, 0)

    const totalEmailCampaignRevenue = emailCampaigns.reduce((s, c) => s + c.revenue_attributed, 0)
    const totalEmailCampaignRecipients = emailCampaigns.reduce((s, c) => s + c.recipient_count, 0)

    const totalSmsCampaignRevenue = smsCampaigns.reduce((s, c) => s + c.revenue_attributed, 0)
    const totalSmsCampaignRecipients = smsCampaigns.reduce((s, c) => s + c.recipient_count, 0)

    // Email campaign rates (opens only available on email)
    const emailCampaignsWithRates = emailCampaigns.filter((c) => c.open_rate !== null)
    const avgOpenRate = emailCampaignsWithRates.length > 0
      ? emailCampaignsWithRates.reduce((s, c) => s + (c.open_rate ?? 0), 0) / emailCampaignsWithRates.length
      : 0
    const avgClickRate = emailCampaignsWithRates.length > 0
      ? emailCampaignsWithRates.reduce((s, c) => s + (c.click_rate ?? 0), 0) / emailCampaignsWithRates.length
      : 0
    const totalUnsubscribes = emailCampaigns.reduce((s, c) => s + c.unsubscribe_count, 0)

    // SMS-specific rates
    const smsCampaignsWithClicks = smsCampaigns.filter((c) => c.click_rate !== null)
    const avgSmsClickRate = smsCampaignsWithClicks.length > 0
      ? smsCampaignsWithClicks.reduce((s, c) => s + (c.click_rate ?? 0), 0) / smsCampaignsWithClicks.length
      : 0
    const smsOptoutCount = smsCampaigns.reduce((s, c) => s + c.unsubscribe_count, 0)

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
    const estimatedSmsOptoutCost = smsOptoutCount * avgLTV

    const campaignsNegativeROI = emailCampaigns.filter((c) => {
      const estCost = c.recipient_count * 0.002  // ~$0.002 per email sent
      return c.revenue_attributed < estCost
    }).length

    const campaignMetrics = [
      { metric_name: 'total_campaign_revenue', metric_value: totalCampaignRevenue, metric_metadata: {} },
      { metric_name: 'total_campaign_recipients', metric_value: totalCampaignRecipients, metric_metadata: {} },
      { metric_name: 'total_email_campaign_revenue', metric_value: totalEmailCampaignRevenue, metric_metadata: {} },
      { metric_name: 'total_email_campaign_recipients', metric_value: totalEmailCampaignRecipients, metric_metadata: {} },
      { metric_name: 'total_sms_campaign_revenue', metric_value: totalSmsCampaignRevenue, metric_metadata: {} },
      { metric_name: 'total_sms_campaign_recipients', metric_value: totalSmsCampaignRecipients, metric_metadata: {} },
      { metric_name: 'avg_campaign_open_rate', metric_value: avgOpenRate, metric_metadata: {} },
      { metric_name: 'avg_campaign_click_rate', metric_value: avgClickRate, metric_metadata: {} },
      { metric_name: 'total_campaign_unsubscribes', metric_value: totalUnsubscribes, metric_metadata: {} },
      { metric_name: 'estimated_unsubscribe_cost', metric_value: estimatedUnsubscribeCost, metric_metadata: { avg_ltv: avgLTV } },
      { metric_name: 'avg_sms_click_rate', metric_value: avgSmsClickRate, metric_metadata: {} },
      { metric_name: 'sms_optout_count', metric_value: smsOptoutCount, metric_metadata: {} },
      { metric_name: 'estimated_sms_optout_cost', metric_value: estimatedSmsOptoutCost, metric_metadata: { avg_ltv: avgLTV } },
      { metric_name: 'campaigns_with_negative_roi', metric_value: campaignsNegativeROI, metric_metadata: {} },
      { metric_name: 'email_campaign_count', metric_value: emailCampaigns.length, metric_metadata: {} },
      { metric_name: 'sms_campaign_count', metric_value: smsCampaigns.length, metric_metadata: {} },
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
    const msg = (err as Error).message
    results.errors.push(`Campaigns: ${msg}`)
    await updateLog({ metadata: { stage: 'campaigns_failed', error: msg } })
  }

  // ── Sync flows ────────────────────────────────────────────────────────────────
  try {
    await updateLog({ metadata: { stage: 'fetching_flows', campaigns_synced: results.campaigns } })
    const flows = await getEnrichedFlows(apiKey)
    const rows = flows.map((f) => ({
      id: f.id,
      tenant_id: TENANT_ID,
      name: f.name,
      channel: f.channel,
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
    const totalFlowRecipients = flows.reduce((s, f) => s + f.recipient_count, 0)

    const emailFlows = flows.filter((f) => f.channel === 'email' || f.channel === 'multi')
    const smsFlows = flows.filter((f) => f.channel === 'sms' || f.channel === 'multi')
    const totalEmailFlowRevenue = flows.filter((f) => f.channel !== 'sms').reduce((s, f) => s + f.revenue_attributed, 0)
    const totalEmailFlowRecipients = flows.filter((f) => f.channel !== 'sms').reduce((s, f) => s + f.recipient_count, 0)
    const totalSmsFlowRevenue = flows.filter((f) => f.channel === 'sms' || f.channel === 'multi').reduce((s, f) => s + f.revenue_attributed, 0)
    const totalSmsFlowRecipients = flows.filter((f) => f.channel === 'sms' || f.channel === 'multi').reduce((s, f) => s + f.recipient_count, 0)

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

    // Total SMS revenue (SMS campaigns + SMS flows)
    const { data: smsCampaignRevenueRow } = await service
      .from('klaviyo_metrics_cache')
      .select('metric_value')
      .eq('tenant_id', TENANT_ID)
      .eq('metric_name', 'total_sms_campaign_revenue')
      .single()
    const smsCampaignRevenue = Number(smsCampaignRevenueRow?.metric_value ?? 0)
    const totalSmsRevenue = smsCampaignRevenue + totalSmsFlowRevenue

    const flowMetrics = [
      { metric_name: 'total_flow_revenue', metric_value: totalFlowRevenue, metric_metadata: {} },
      { metric_name: 'total_flow_recipients', metric_value: totalFlowRecipients, metric_metadata: {} },
      { metric_name: 'total_email_flow_revenue', metric_value: totalEmailFlowRevenue, metric_metadata: {} },
      { metric_name: 'total_email_flow_recipients', metric_value: totalEmailFlowRecipients, metric_metadata: {} },
      { metric_name: 'total_sms_flow_revenue', metric_value: totalSmsFlowRevenue, metric_metadata: {} },
      { metric_name: 'total_sms_flow_recipients', metric_value: totalSmsFlowRecipients, metric_metadata: {} },
      { metric_name: 'total_sms_revenue', metric_value: totalSmsRevenue, metric_metadata: {} },
      { metric_name: 'email_flow_count', metric_value: emailFlows.length, metric_metadata: {} },
      { metric_name: 'sms_flow_count', metric_value: smsFlows.length, metric_metadata: {} },
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
    const msg = (err as Error).message
    results.errors.push(`Flows: ${msg}`)
    await updateLog({ metadata: { stage: 'flows_failed', error: msg } })
  }

  // ── Finalize sync_log ─────────────────────────────────────────────────────────
  await updateLog({
    status: results.errors.length > 0 ? 'partial' : 'success',
    completed_at: new Date().toISOString(),
    metadata: {
      campaigns_synced: results.campaigns,
      flows_synced: results.flows,
      errors: results.errors,
    },
  })

  const status = results.errors.length > 0 ? 207 : 200
  return Response.json(results, { status })
}

export async function GET(req: NextRequest) {
  return POST(req)
}
