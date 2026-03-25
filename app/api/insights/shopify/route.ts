/**
 * POST /api/insights/shopify
 * Generates AI-powered Shopify store intelligence using Claude.
 */
import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'

export const maxDuration = 300

const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const STORE_ID  = '00000000-0000-0000-0000-000000000002'

export async function POST(_req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createSupabaseServiceClient()
  const now = new Date()
  const thirtyDaysAgo = new Date(now); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const sixtyDaysAgo  = new Date(now); sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

  const [
    { data: curr30 },
    { data: prev30 },
    { data: channels },
    { data: metricsCache },
  ] = await Promise.all([
    service.from('orders').select('total_price, financial_status, fulfillment_status, processed_at').eq('store_id', STORE_ID).eq('financial_status', 'paid').gte('processed_at', thirtyDaysAgo.toISOString()),
    service.from('orders').select('total_price').eq('store_id', STORE_ID).eq('financial_status', 'paid').gte('processed_at', sixtyDaysAgo.toISOString()).lt('processed_at', thirtyDaysAgo.toISOString()),
    service.from('sales_channel_cache').select('channel_name, revenue, order_count, avg_order_value').eq('tenant_id', TENANT_ID).eq('period', 'last_30d'),
    service.from('metrics_cache').select('metric_name, metric_value, metric_metadata').eq('store_id', STORE_ID).in('metric_name', ['revenue_by_month', 'customer_count']),
  ])

  const currRev  = (curr30 ?? []).reduce((s, r) => s + Number(r.total_price), 0)
  const prevRev  = (prev30 ?? []).reduce((s, r) => s + Number(r.total_price), 0)
  const revDelta = prevRev > 0 ? ((currRev - prevRev) / prevRev * 100).toFixed(1) : 'N/A'
  const currAOV  = curr30?.length ? currRev / curr30.length : 0

  type CachedMonth = { month: string; revenue: number }
  const monthRow = (metricsCache ?? []).find((r) => r.metric_name === 'revenue_by_month')
  const months: CachedMonth[] = (monthRow?.metric_metadata as { data?: CachedMonth[] } | null)?.data?.slice(-6) ?? []

  const channelSummary = (channels ?? []).map((c) => `${c.channel_name}: $${Number(c.revenue).toFixed(0)} (${c.order_count} orders)`).join(', ')

  const context = `
Shopify Store Summary:
- Revenue (30d): $${currRev.toFixed(0)} vs $${prevRev.toFixed(0)} prior 30d = ${revDelta}% change
- Orders (30d): ${curr30?.length ?? 0}
- AOV (30d): $${currAOV.toFixed(2)}
- Channel breakdown (30d): ${channelSummary || 'no channel data'}
- Last 6 months revenue: ${months.map((m) => `${m.month}: $${m.revenue.toFixed(0)}`).join(', ')}
`

  const client = new Anthropic()
  const message = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `You are an expert ecommerce analyst. Analyze this Shopify store data and provide 4-5 sharp, actionable insights. Focus on revenue trends, channel performance, AOV optimization, and retention opportunities.

${context}

Return ONLY a JSON array. Each object: { "title": string, "description": string, "action": string, "impact": "Low"|"Medium"|"High", "category": "Revenue"|"Retention"|"Channel"|"Operations" }`,
    }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  const match = text.match(/\[[\s\S]*\]/)
  if (!match) return Response.json({ error: 'Failed to parse insights' }, { status: 500 })

  const insights = JSON.parse(match[0])
  const calculated_at = new Date().toISOString()

  await service.from('shopify_insights_cache').upsert({
    tenant_id: TENANT_ID,
    insights,
    calculated_at,
  }, { onConflict: 'tenant_id' })

  return Response.json({ insights, calculated_at })
}
