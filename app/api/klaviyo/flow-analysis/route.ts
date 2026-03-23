import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const STORE_ID = '00000000-0000-0000-0000-000000000002'

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createSupabaseServiceClient()

  const [
    { data: flows },
    { data: customers },
    { data: metricsRows },
  ] = await Promise.all([
    service
      .from('klaviyo_flows')
      .select('id, name, status, trigger_type, recipient_count, open_rate, click_rate, revenue_attributed')
      .eq('tenant_id', TENANT_ID)
      .order('revenue_attributed', { ascending: false }),
    service
      .from('customers')
      .select('orders_count, updated_at')
      .eq('store_id', STORE_ID),
    service
      .from('klaviyo_metrics_cache')
      .select('metric_name, metric_value')
      .eq('tenant_id', TENANT_ID),
  ])

  const allFlows = flows ?? []
  const activeEarning = allFlows.filter(f => f.recipient_count > 0 && f.revenue_attributed > 0)
  const activeNoRevenue = allFlows.filter(f => f.recipient_count > 0 && f.revenue_attributed <= 0)
  const inactive = allFlows.filter(f => f.recipient_count === 0)

  // Avg revenue per recipient across earning flows
  const totalEarningRecip = activeEarning.reduce((s, f) => s + f.recipient_count, 0)
  const totalEarningRev = activeEarning.reduce((s, f) => s + f.revenue_attributed, 0)
  const avgRPR = totalEarningRecip > 0 ? totalEarningRev / totalEarningRecip : 0

  // Lapsed customers (no activity in 90+ days)
  const now = Date.now()
  const lapsedCount = (customers ?? []).filter(
    c => (now - new Date(c.updated_at).getTime()) / 86400000 > 90
  ).length

  const kvMetrics: Record<string, number> = {}
  for (const row of metricsRows ?? []) kvMetrics[row.metric_name] = Number(row.metric_value)

  const prompt = `You are an email marketing strategist analyzing Klaviyo flow performance for LashBox LA, a beauty/lash retail brand.

FLOW HEALTH SUMMARY:
- Active & Earning flows: ${activeEarning.length} flows generating $${totalEarningRev.toFixed(0)} total
- Active but No Revenue flows: ${activeNoRevenue.length} flows (receiving traffic but no attributed sales)
- Inactive / Unconfigured flows: ${inactive.length} flows (zero recipients, never triggered)
- Avg revenue per recipient across earning flows: $${avgRPR.toFixed(3)}

TOP EARNING FLOWS:
${activeEarning.slice(0, 5).map(f => `- ${f.name}: $${f.revenue_attributed.toFixed(0)} revenue, ${f.recipient_count.toLocaleString()} recipients, ${f.open_rate ? (f.open_rate * 100).toFixed(1) + '% open' : 'no open data'}`).join('\n')}

INACTIVE FLOWS (sample of highest-priority to fix):
${inactive.slice(0, 8).map(f => `- ${f.name} (trigger: ${f.trigger_type ?? 'unknown'})`).join('\n')}

ACTIVE BUT ZERO REVENUE (flows with traffic but not converting):
${activeNoRevenue.slice(0, 5).map(f => `- ${f.name}: ${f.recipient_count.toLocaleString()} recipients, ${f.open_rate ? (f.open_rate * 100).toFixed(1) + '% open' : '—'}, $0 revenue`).join('\n')}

CUSTOMER CONTEXT:
- Lapsed customers (90+ days inactive): ${lapsedCount.toLocaleString()}
- These customers represent a key win-back opportunity if a win-back flow is not active

Provide exactly 3 insights as a JSON array. Each insight must be specific, grounded in the numbers above, and actionable:

Return ONLY valid JSON — no markdown, no code fences:
[
  {
    "priority": 1,
    "title": "<specific flow name or category to fix first>",
    "category": "inactive_flows" | "zero_revenue_flows" | "winback_gap",
    "revenue_opportunity": "<estimated $ opportunity based on avg RPR × expected recipients>",
    "action": "<specific 1-sentence action to take>",
    "rationale": "<2 sentences grounded in the data above>"
  },
  ...
]`

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const insights = JSON.parse(cleaned)

    return Response.json({
      insights,
      summary: {
        activeEarning: activeEarning.length,
        activeNoRevenue: activeNoRevenue.length,
        inactive: inactive.length,
        totalEarningRevenue: totalEarningRev,
        avgRPR,
        lapsedCustomers: lapsedCount,
      },
    })
  } catch (err) {
    return Response.json({ error: `Analysis failed: ${(err as Error).message}` }, { status: 500 })
  }
}
