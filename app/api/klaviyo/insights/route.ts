import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

export interface KlaviyoInsight {
  type: 'Opportunity' | 'Risk' | 'Win'
  title: string
  description: string
  action: string
}

export async function GET(_req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createSupabaseServiceClient()

  // Fetch top campaigns and flows
  const [{ data: campaigns }, { data: flows }, { data: metricsRows }] = await Promise.all([
    service
      .from('klaviyo_campaigns')
      .select('name, status, send_time, recipient_count, open_rate, click_rate, revenue_attributed, unsubscribe_count')
      .eq('tenant_id', TENANT_ID)
      .order('revenue_attributed', { ascending: false })
      .limit(10),
    service
      .from('klaviyo_flows')
      .select('name, status, trigger_type, recipient_count, open_rate, click_rate, conversion_rate, revenue_attributed')
      .eq('tenant_id', TENANT_ID)
      .order('revenue_attributed', { ascending: false })
      .limit(10),
    service
      .from('klaviyo_metrics_cache')
      .select('metric_name, metric_value, metric_metadata')
      .eq('tenant_id', TENANT_ID),
  ])

  if (!campaigns?.length && !flows?.length) {
    return Response.json({ insights: [] })
  }

  const metrics: Record<string, { value: number; metadata: Record<string, unknown> }> = {}
  for (const row of metricsRows ?? []) {
    metrics[row.metric_name] = {
      value: Number(row.metric_value),
      metadata: (row.metric_metadata as Record<string, unknown>) ?? {},
    }
  }

  const pct = (n: number) => `${(n * 100).toFixed(1)}%`
  const usd = (n: number) => `$${n.toFixed(0)}`

  const campaignSummary = (campaigns ?? [])
    .map((c) =>
      `- "${c.name}" | ${c.status} | ${c.recipient_count} recipients | open ${c.open_rate != null ? pct(c.open_rate) : 'n/a'} | click ${c.click_rate != null ? pct(c.click_rate) : 'n/a'} | revenue ${usd(c.revenue_attributed)} | unsubs ${c.unsubscribe_count}`
    )
    .join('\n')

  const flowSummary = (flows ?? [])
    .map((f) =>
      `- "${f.name}" | ${f.status} | trigger: ${f.trigger_type ?? 'n/a'} | ${f.recipient_count} recipients | conversion ${f.conversion_rate != null ? pct(f.conversion_rate) : 'n/a'} | revenue ${usd(f.revenue_attributed)}`
    )
    .join('\n')

  const prompt = `You are an email marketing analyst. Analyze the following Klaviyo data for a beauty retail brand (LashBox LA) and generate 4 specific, actionable insights.

KEY METRICS:
- Total campaign revenue: ${usd(metrics['total_campaign_revenue']?.value ?? 0)}
- Avg campaign open rate: ${pct(metrics['avg_campaign_open_rate']?.value ?? 0)}
- Avg campaign click rate: ${pct(metrics['avg_campaign_click_rate']?.value ?? 0)}
- Total flow revenue: ${usd(metrics['total_flow_revenue']?.value ?? 0)}
- Email revenue as % of total Shopify revenue: ${pct(metrics['email_revenue_vs_total']?.value ?? 0)}
- Estimated cost of unsubscribes: ${usd(metrics['estimated_unsubscribe_cost']?.value ?? 0)}
- Campaigns with negative ROI: ${metrics['campaigns_with_negative_roi']?.value ?? 0}

TOP CAMPAIGNS (sorted by revenue):
${campaignSummary || 'No campaign data'}

TOP FLOWS (sorted by revenue):
${flowSummary || 'No flow data'}

Generate exactly 4 insights. Each must be one of these types: Opportunity, Risk, or Win.
- Opportunity: something they could do to improve performance
- Risk: a problem or pattern that could hurt them if unaddressed
- Win: something working well that should be celebrated or amplified

Return ONLY a JSON array — no markdown, no code fences:
[
  {
    "type": "Opportunity" | "Risk" | "Win",
    "title": "<short title, max 8 words>",
    "description": "<2 sentences grounded in the actual data above>",
    "action": "<one specific, concrete action they can take this week>"
  }
]`

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : '[]'
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const insights: KlaviyoInsight[] = JSON.parse(cleaned)
    return Response.json({ insights })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 })
  }
}
