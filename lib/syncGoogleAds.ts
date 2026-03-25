import { createSupabaseServiceClient } from '@/lib/supabase'
import { getCampaigns, getAccountSummary } from '@/lib/googleAds'
import { getGoogleAdsCampaigns } from '@/lib/analytics'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const STORE_ID = '00000000-0000-0000-0000-000000000002'
const GOOGLE_ADS_CUSTOMER_ID = '9145748200'

interface StoreData {
  google_ads_refresh_token: string
  google_ads_developer_token: string
  ga4_refresh_token?: string | null
  ga4_property_id?: string | null
}

async function syncFromGa4(store: StoreData) {
  if (!store.ga4_refresh_token || !store.ga4_property_id) {
    throw new Error('GA4 not connected — cannot use as fallback')
  }

  const service = createSupabaseServiceClient()
  const campaigns = await getGoogleAdsCampaigns(store.ga4_property_id, store.ga4_refresh_token, 90)

  if (campaigns.length > 0) {
    const now = new Date().toISOString()
    const rows = campaigns.map((c) => ({
      id: `ga4_${c.campaignName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
      tenant_id: TENANT_ID,
      name: c.campaignName,
      status: 'UNKNOWN',
      campaign_type: 'UNKNOWN',
      spend: 0,
      impressions: 0,
      clicks: c.sessions,
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

  return {
    synced: campaigns.length,
    data_source: 'ga4' as const,
    note: 'Campaign data sourced from Google Analytics — spend/ROAS pending Google Ads API approval',
  }
}

export async function runGoogleAdsSync(store: StoreData) {
  const service = createSupabaseServiceClient()

  let campaigns, summary30d
  try {
    ;[campaigns, summary30d] = await Promise.all([
      getCampaigns(GOOGLE_ADS_CUSTOMER_ID, store.google_ads_refresh_token, store.google_ads_developer_token, 90),
      getAccountSummary(GOOGLE_ADS_CUSTOMER_ID, store.google_ads_refresh_token, store.google_ads_developer_token, 30),
    ])
  } catch (apiErr) {
    const msg = (apiErr as Error).message
    if (msg.includes('501') && store.ga4_refresh_token && store.ga4_property_id) {
      return syncFromGa4(store)
    }
    throw apiErr
  }

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
    const { error } = await service.from('google_campaigns').upsert(rows, { onConflict: 'id' })
    if (error) throw new Error(`Campaigns upsert failed: ${error.message}`)
  }

  const belowOne = campaigns.filter((c) => c.spend > 0 && c.roas < 1)
  const totalSpend30 = summary30d.spend
  const totalConversions30 = summary30d.conversions
  const cpp30 = totalConversions30 > 0 ? totalSpend30 / totalConversions30 : 0

  await service.from('google_metrics_cache').upsert(
    [
      { metric_name: 'total_ad_spend_30d',     metric_value: totalSpend30 },
      { metric_name: 'total_roas_30d',          metric_value: summary30d.roas },
      { metric_name: 'cost_per_conversion_30d', metric_value: cpp30 },
      { metric_name: 'total_conversions_30d',   metric_value: totalConversions30 },
      { metric_name: 'campaigns_below_1x_roas', metric_value: belowOne.length },
      { metric_name: 'active_campaign_count',   metric_value: campaigns.filter((c) => c.status === 'ENABLED').length },
    ].map((m) => ({ tenant_id: TENANT_ID, ...m, calculated_at: new Date().toISOString() })),
    { onConflict: 'tenant_id,metric_name' }
  )

  return {
    synced: campaigns.length,
    total_spend_30d: totalSpend30,
    roas_30d: summary30d.roas,
    campaigns_below_1x: belowOne.length,
  }
}
