import { NextRequest } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'
import { getCampaigns, getAccountSummary } from '@/lib/googleAds'
import { getGoogleAdsCampaigns } from '@/lib/analytics'

export const maxDuration = 60

const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const STORE_ID = '00000000-0000-0000-0000-000000000002'
const GOOGLE_ADS_CUSTOMER_ID = '9145748200'

// ── GA4 fallback when Google Ads API returns 501 ──────────────────────────────

async function syncFromGa4(
  refreshToken: string,
  propertyId: string,
  service: ReturnType<typeof import('@/lib/supabase').createSupabaseServiceClient>,
  tenantId: string
) {
  const campaigns = await getGoogleAdsCampaigns(propertyId, refreshToken, 90)

  if (campaigns.length > 0) {
    const now = new Date().toISOString()
    const rows = campaigns.map((c) => ({
      id: `ga4_${c.campaignName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
      tenant_id: tenantId,
      name: c.campaignName,
      status: 'UNKNOWN',
      campaign_type: 'UNKNOWN',
      spend: 0,
      impressions: 0,
      clicks: c.sessions,   // sessions used as proxy
      ctr: 0,
      avg_cpc: 0,
      conversions: c.conversions,
      conversion_value: c.revenue,
      roas: 0,
      impression_share: null,
      date_start: null,
      date_stop: null,
      data_source: 'ga4',
      updated_at: now,
    }))

    await service.from('google_campaigns').upsert(rows, { onConflict: 'id' })
  }

  return Response.json({
    synced: campaigns.length,
    data_source: 'ga4',
    note: 'Campaign data sourced from Google Analytics — spend/ROAS pending Google Ads API approval',
  })
}

export async function POST(_req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createSupabaseServiceClient()

  const { data: store } = await service
    .from('stores')
    .select('google_ads_customer_id, google_ads_refresh_token, google_ads_developer_token, ga4_refresh_token, ga4_property_id')
    .eq('id', STORE_ID)
    .single()

  if (!store?.google_ads_refresh_token) {
    return Response.json({ error: 'Google Ads not connected — complete OAuth setup in Integrations' }, { status: 400 })
  }
  if (!store?.google_ads_developer_token) {
    return Response.json({ error: 'Google Ads Developer Token missing — re-connect in Integrations and enter your Developer Token' }, { status: 400 })
  }

  // Always use the known constant — DB value may be stale from a previous mis-entry
  const customerId = GOOGLE_ADS_CUSTOMER_ID
  const { google_ads_refresh_token: refreshToken, google_ads_developer_token: devToken } = store

  try {
    let campaigns, summary30d
    try {
      ;[campaigns, summary30d] = await Promise.all([
        getCampaigns(customerId, refreshToken, devToken, 90),
        getAccountSummary(customerId, refreshToken, devToken, 30),
      ])
    } catch (apiErr) {
      const msg = (apiErr as Error).message
      // 501 = developer token pending/test-only; try GA4 fallback if connected
      if (msg.includes('501') && store?.ga4_refresh_token && store?.ga4_property_id) {
        return await syncFromGa4(store.ga4_refresh_token, store.ga4_property_id, service, TENANT_ID)
      }
      throw apiErr
    }

    // Upsert campaigns
    if (campaigns.length > 0) {
      const rows = campaigns.map((c) => ({
        id: c.id,
        tenant_id: TENANT_ID,
        name: c.name,
        status: c.status,
        campaign_type: c.campaign_type,
        spend: c.spend,
        impressions: c.impressions,
        clicks: c.clicks,
        ctr: c.ctr,
        avg_cpc: c.avg_cpc,
        conversions: c.conversions,
        conversion_value: c.conversion_value,
        roas: c.roas,
        impression_share: c.impression_share,
        date_start: c.date_start || null,
        date_stop: c.date_stop || null,
        updated_at: new Date().toISOString(),
      }))

      const { error } = await service
        .from('google_campaigns')
        .upsert(rows, { onConflict: 'id' })
      if (error) return Response.json({ error: `Campaigns upsert failed: ${error.message}` }, { status: 500 })
    }

    const belowOne = campaigns.filter((c) => c.spend > 0 && c.roas < 1)
    const totalSpend30 = summary30d.spend
    const totalConversions30 = summary30d.conversions
    const cpp30 = totalConversions30 > 0 ? totalSpend30 / totalConversions30 : 0

    const metricRows = [
      { metric_name: 'total_ad_spend_30d',       metric_value: totalSpend30 },
      { metric_name: 'total_roas_30d',            metric_value: summary30d.roas },
      { metric_name: 'cost_per_conversion_30d',   metric_value: cpp30 },
      { metric_name: 'total_conversions_30d',     metric_value: totalConversions30 },
      { metric_name: 'campaigns_below_1x_roas',   metric_value: belowOne.length },
      { metric_name: 'active_campaign_count',     metric_value: campaigns.filter((c) => c.status === 'ENABLED').length },
    ]

    const cacheRows = metricRows.map((m) => ({
      tenant_id: TENANT_ID,
      ...m,
      calculated_at: new Date().toISOString(),
    }))

    await service
      .from('google_metrics_cache')
      .upsert(cacheRows, { onConflict: 'tenant_id,metric_name' })

    return Response.json({
      synced: campaigns.length,
      total_spend_30d: totalSpend30,
      roas_30d: summary30d.roas,
      campaigns_below_1x: belowOne.length,
    })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return POST(req)
}
