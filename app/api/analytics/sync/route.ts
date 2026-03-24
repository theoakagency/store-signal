import { NextRequest } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'
import {
  getChannelSessions,
  getLandingPages,
  getMonthlySessions,
  getEcommerceMetrics,
  getGoogleAdsCampaigns,
} from '@/lib/analytics'

export const maxDuration = 60

const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const STORE_ID = '00000000-0000-0000-0000-000000000002'

export async function POST(_req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createSupabaseServiceClient()
  const { data: store } = await service
    .from('stores')
    .select('ga4_refresh_token, ga4_property_id')
    .eq('id', STORE_ID)
    .single()

  if (!store?.ga4_refresh_token || !store?.ga4_property_id) {
    return Response.json({ error: 'Google Analytics not connected — set up in Integrations' }, { status: 400 })
  }

  const { ga4_refresh_token: refreshToken, ga4_property_id: propertyId } = store

  try {
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
        channels.map((c) => ({
          tenant_id: TENANT_ID,
          date_range: '90d',
          channel: c.channel,
          sessions: c.sessions,
          conversions: c.conversions,
          revenue: c.revenue,
          updated_at: now,
        })),
        { onConflict: 'tenant_id,date_range,channel' }
      )
    }

    if (pages.length > 0) {
      await service.from('analytics_pages').upsert(
        pages.map((p) => ({
          tenant_id: TENANT_ID,
          page_path: p.pagePath,
          sessions: p.sessions,
          conversions: p.conversions,
          avg_time_seconds: p.avgTimeSeconds,
          updated_at: now,
        })),
        { onConflict: 'tenant_id,page_path' }
      )
    }

    if (monthly.length > 0) {
      await service.from('analytics_monthly').upsert(
        monthly.map((m) => ({
          tenant_id: TENANT_ID,
          month: m.month,
          sessions: m.sessions,
          updated_at: now,
        })),
        { onConflict: 'tenant_id,month' }
      )
    }

    if (adCampaigns.length > 0) {
      await service.from('analytics_campaigns').upsert(
        adCampaigns.map((c) => ({
          tenant_id: TENANT_ID,
          campaign_name: c.campaignName,
          source: 'google',
          medium: 'cpc',
          sessions: c.sessions,
          conversions: c.conversions,
          revenue: c.revenue,
          updated_at: now,
        })),
        { onConflict: 'tenant_id,campaign_name' }
      )
    }

    const metricRows = [
      { metric_name: 'ga4_transactions_90d',    metric_value: ecommerce.transactions },
      { metric_name: 'ga4_revenue_90d',          metric_value: ecommerce.revenue },
      { metric_name: 'ga4_aov_90d',              metric_value: ecommerce.aov },
      { metric_name: 'ga4_sessions_90d',         metric_value: ecommerce.sessions },
      { metric_name: 'ga4_conversion_rate_90d',  metric_value: ecommerce.conversionRate },
    ]

    await service.from('analytics_metrics_cache').upsert(
      metricRows.map((m) => ({ tenant_id: TENANT_ID, ...m, calculated_at: now })),
      { onConflict: 'tenant_id,metric_name' }
    )

    return Response.json({
      channels: channels.length,
      pages: pages.length,
      monthly: monthly.length,
      ad_campaigns: adCampaigns.length,
      ecommerce,
    })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return POST(req)
}
