import { createSupabaseServiceClient } from '@/lib/supabase'
import { getChannelSessions, getLandingPages, getMonthlySessions, getEcommerceMetrics, getGoogleAdsCampaigns } from '@/lib/analytics'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

export async function runAnalyticsSync(refreshToken: string, propertyId: string) {
  const service = createSupabaseServiceClient()

  const [channels, pages, monthly, ecommerce, adCampaigns] = await Promise.all([
    getChannelSessions(propertyId, refreshToken, 90),
    getLandingPages(propertyId, refreshToken, 90, 25),
    getMonthlySessions(propertyId, refreshToken),
    getEcommerceMetrics(propertyId, refreshToken, 90),
    getGoogleAdsCampaigns(propertyId, refreshToken, 90).catch(() => []),
  ])

  const now = new Date().toISOString()

  if (channels.length > 0) {
    await service.from('analytics_sessions').upsert(
      channels.map((c) => ({ tenant_id: TENANT_ID, date_range: '90d', channel: c.channel, sessions: c.sessions, conversions: c.conversions, revenue: c.revenue, updated_at: now })),
      { onConflict: 'tenant_id,date_range,channel' }
    )
  }

  if (pages.length > 0) {
    await service.from('analytics_pages').upsert(
      pages.map((p) => ({ tenant_id: TENANT_ID, page_path: p.pagePath, sessions: p.sessions, conversions: p.conversions, avg_time_seconds: p.avgTimeSeconds, updated_at: now })),
      { onConflict: 'tenant_id,page_path' }
    )
  }

  if (monthly.length > 0) {
    await service.from('analytics_monthly').upsert(
      monthly.map((m) => ({ tenant_id: TENANT_ID, month: m.month, sessions: m.sessions, updated_at: now })),
      { onConflict: 'tenant_id,month' }
    )
  }

  if (adCampaigns.length > 0) {
    await service.from('analytics_campaigns').upsert(
      adCampaigns.map((c) => ({ tenant_id: TENANT_ID, campaign_name: c.campaignName, source: 'google', medium: 'cpc', sessions: c.sessions, conversions: c.conversions, revenue: c.revenue, updated_at: now })),
      { onConflict: 'tenant_id,campaign_name' }
    )
  }

  await service.from('analytics_metrics_cache').upsert(
    [
      { metric_name: 'ga4_transactions_90d',   metric_value: ecommerce.transactions },
      { metric_name: 'ga4_revenue_90d',         metric_value: ecommerce.revenue },
      { metric_name: 'ga4_aov_90d',             metric_value: ecommerce.aov },
      { metric_name: 'ga4_sessions_90d',        metric_value: ecommerce.sessions },
      { metric_name: 'ga4_conversion_rate_90d', metric_value: ecommerce.conversionRate },
    ].map((m) => ({ tenant_id: TENANT_ID, ...m, calculated_at: now })),
    { onConflict: 'tenant_id,metric_name' }
  )

  return { channels: channels.length, pages: pages.length, monthly: monthly.length, ad_campaigns: adCampaigns.length, ecommerce }
}
