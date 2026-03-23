import { NextRequest } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'
import { getMetrics, getCampaignStats } from '@/lib/klaviyo'

const STORE_ID = '00000000-0000-0000-0000-000000000002'

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

  // List all metrics
  const metrics = await getMetrics(apiKey)
  const metricNames = metrics.map((m) => ({ id: m.id, name: m.attributes.name }))

  // Try a stats call with no conversion metric (just to see the raw response shape)
  const endDate = new Date()
  const startDate = new Date()
  startDate.setFullYear(startDate.getFullYear() - 2)

  let rawStatsResponse: unknown = null
  let statsError: string | null = null
  // Use the first metric we find as a test
  const testMetricId = metrics[0]?.id
  if (testMetricId) {
    try {
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
              conversion_metric_id: testMetricId,
            },
          },
        }),
      })
      const text = await res.text()
      rawStatsResponse = { status: res.status, body: JSON.parse(text) }
    } catch (e) {
      statsError = (e as Error).message
    }
  }

  return Response.json({ metrics: metricNames, rawStatsResponse, statsError })
}
