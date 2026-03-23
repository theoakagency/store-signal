import { NextRequest } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'
import { getPlacedOrderMetricId } from '@/lib/klaviyo'

const STORE_ID = '00000000-0000-0000-0000-000000000002'

async function testFlow(apiKey: string, metricId: string, statistics: string[]) {
  const endDate = new Date()
  const startDate = new Date()
  startDate.setFullYear(startDate.getFullYear() - 1)
  const res = await fetch('https://a.klaviyo.com/api/flow-values-reports/', {
    method: 'POST',
    headers: {
      Authorization: `Klaviyo-API-Key ${apiKey}`,
      revision: '2024-02-15',
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      data: {
        type: 'flow-values-report',
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
  return { ok: true, field: statistics.at(-1), firstResult: json?.data?.attributes?.results?.[0] }
}

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createSupabaseServiceClient()
  const { data: store } = await service.from('stores').select('klaviyo_api_key').eq('id', STORE_ID).single()
  const apiKey = store?.klaviyo_api_key
  if (!apiKey) return Response.json({ error: 'No API key' }, { status: 400 })

  const metricId = await getPlacedOrderMetricId(apiKey)
  const base = ['delivered', 'opens_unique', 'clicks_unique']

  const results = await Promise.all([
    testFlow(apiKey!, metricId!, [...base, 'revenue_per_recipient']),
    testFlow(apiKey!, metricId!, [...base, 'conversions']),
    testFlow(apiKey!, metricId!, [...base, 'conversion_rate']),
    testFlow(apiKey!, metricId!, [...base, 'conversion_uniques']),
  ])

  return Response.json({ metricId, results })
}
