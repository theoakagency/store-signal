import { NextRequest } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'
import { getPlacedOrderMetricId } from '@/lib/klaviyo'

const STORE_ID = '00000000-0000-0000-0000-000000000002'

async function testStats(apiKey: string, metricId: string, statistics: string[]) {
  const endDate = new Date()
  const startDate = new Date()
  startDate.setFullYear(startDate.getFullYear() - 1)

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
          statistics,
        },
      },
    }),
  })
  const json = await res.json()
  if (res.status !== 200) return { ok: false, field: statistics.at(-1), error: json.errors?.[0]?.detail }
  // Return the first email result's statistics
  const results = json?.data?.attributes?.results ?? []
  const emailResult = results.find((r: { groupings: { send_channel?: string } }) => r.groupings?.send_channel === 'email')
  return { ok: true, field: statistics.at(-1), stats: emailResult?.statistics }
}

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
  const base = ['delivered', 'opens_unique', 'clicks_unique', 'unsubscribes']

  // Test candidate revenue field names one at a time
  const candidates = [
    'revenue_per_recipient',
    'attributed_revenue',
    'conversions',
    'conversion_uniques',
    'conversion_rate',
  ]

  const results = await Promise.all(
    candidates.map((c) => testStats(apiKey!, metricId!, [...base, c]))
  )

  return Response.json({ metricId, results })
}
