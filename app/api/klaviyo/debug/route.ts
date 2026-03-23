import { NextRequest } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'
import { getPlacedOrderMetricId, getCampaigns } from '@/lib/klaviyo'

const STORE_ID = '00000000-0000-0000-0000-000000000002'
const TENANT_ID = '00000000-0000-0000-0000-000000000001'

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createSupabaseServiceClient()
  const { data: store } = await service
    .from('stores')
    .select('klaviyo_api_key')
    .eq('id', STORE_ID)
    .single()

  const apiKey = store?.klaviyo_api_key
  if (!apiKey) return Response.json({ error: 'No API key' }, { status: 400 })

  const metricId = await getPlacedOrderMetricId(apiKey)

  const endDate = new Date()
  const startDate = new Date()
  startDate.setFullYear(startDate.getFullYear() - 1)

  // Test with conversions_value to see if it's a valid field
  const res = await fetch('https://a.klaviyo.com/api/campaign-values-reports/', {
    method: 'POST',
    headers: {
      Authorization: `Klaviyo-API-Key ${apiKey}`,
      revision: '2024-02-15',
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      data: {
        type: 'campaign-values-report',
        attributes: {
          timeframe: { start: startDate.toISOString(), end: endDate.toISOString() },
          conversion_metric_id: metricId,
          statistics: ['delivered', 'opens_unique', 'clicks_unique', 'unsubscribes', 'conversions_value'],
        },
      },
    }),
  })

  const text = await res.text()
  const parsed = JSON.parse(text)

  // Get first few campaign IDs from the /campaigns/ endpoint
  const campaigns = await getCampaigns(apiKey)
  const first5CampaignIds = campaigns.slice(0, 5).map(c => ({ id: c.id, name: c.attributes.name, status: c.attributes.status }))

  // Get first few campaign IDs from the stats response (email only)
  const statsResults = parsed?.data?.attributes?.results ?? []
  const first5StatsEmailIds = statsResults
    .filter((r: { groupings: { send_channel?: string } }) => r.groupings?.send_channel === 'email')
    .slice(0, 5)
    .map((r: { groupings: { campaign_id: string } }) => r.groupings.campaign_id)

  // Check DB: what's currently stored
  const { data: dbCampaigns } = await service
    .from('klaviyo_campaigns')
    .select('id, name, open_rate, revenue_attributed')
    .eq('tenant_id', TENANT_ID)
    .not('open_rate', 'is', null)
    .limit(5)

  return Response.json({
    statsStatus: res.status,
    statsError: parsed?.errors ?? null,
    // Show first email result to verify structure
    firstEmailStatResult: statsResults.find((r: { groupings: { send_channel?: string } }) => r.groupings?.send_channel === 'email'),
    first5CampaignIdsFromAPI: first5CampaignIds,
    first5CampaignIdsFromStats: first5StatsEmailIds,
    dbCampaignsWithStats: dbCampaigns ?? [],
  })
}
