import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'

export const maxDuration = 60

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

export async function POST(_req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createSupabaseServiceClient()
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const [
    { data: sessions },
    { data: monthly },
    { data: metricsRows },
    { data: semrushMetrics },
    { data: keywordGaps },
    { data: overviewCache },
  ] = await Promise.all([
    service.from('analytics_sessions').select('channel, sessions, conversions, revenue').eq('tenant_id', TENANT_ID).eq('date_range', '90d').order('sessions', { ascending: false }),
    service.from('analytics_monthly').select('month, sessions').eq('tenant_id', TENANT_ID).order('month', { ascending: true }),
    service.from('analytics_metrics_cache').select('metric_name, metric_value').eq('tenant_id', TENANT_ID),
    service.from('semrush_metrics_cache').select('organic_keywords_total, organic_traffic_monthly, authority_score, gained_keywords_30d, lost_keywords_30d').eq('tenant_id', TENANT_ID).maybeSingle(),
    service.from('semrush_keyword_gaps').select('keyword, competitor_domain, competitor_position, our_position, search_volume, opportunity_score').eq('tenant_id', TENANT_ID).order('opportunity_score', { ascending: false }).limit(10),
    service.from('analytics_overview_cache').select('traffic_health_score, organic_visibility_score, paid_vs_organic_balance').eq('tenant_id', TENANT_ID).maybeSingle(),
  ])

  const ga4Metrics: Record<string, number> = {}
  for (const r of metricsRows ?? []) ga4Metrics[r.metric_name] = Number(r.metric_value)

  const last2 = (monthly ?? []).slice(-2)
  const momPct = last2.length === 2 && last2[0].sessions > 0
    ? ((last2[1].sessions - last2[0].sessions) / last2[0].sessions) * 100
    : null

  const prompt = `You are an analytics intelligence expert. Analyze this store's combined GA4 + SEMrush data and provide 4 specific, actionable insights.

GA4 Traffic Data (90 days):
- Total sessions: ${(sessions ?? []).reduce((s, r) => s + r.sessions, 0).toLocaleString()}
- Revenue: $${(ga4Metrics['ga4_revenue_90d'] ?? 0).toLocaleString()}
- Conversion rate: ${(ga4Metrics['ga4_conversion_rate_90d'] ?? 0).toFixed(2)}%
- MoM session growth: ${momPct !== null ? `${momPct.toFixed(1)}%` : 'N/A'}
- Top channels: ${(sessions ?? []).slice(0, 5).map((s) => `${s.channel} (${s.sessions.toLocaleString()} sessions, ${s.sessions > 0 ? ((s.conversions / s.sessions) * 100).toFixed(1) : 0}% CVR)`).join(', ')}

SEMrush Organic Data:
- Organic keywords: ${semrushMetrics?.organic_keywords_total ?? 'N/A'}
- Monthly organic traffic: ${semrushMetrics?.organic_traffic_monthly?.toLocaleString() ?? 'N/A'}
- Authority score: ${semrushMetrics?.authority_score ?? 'N/A'}/100
- Keywords gained (30d): ${semrushMetrics?.gained_keywords_30d ?? 'N/A'}
- Keywords lost (30d): ${semrushMetrics?.lost_keywords_30d ?? 'N/A'}

Health Scores:
- Traffic health: ${overviewCache?.traffic_health_score ?? 'N/A'}/100
- Organic visibility: ${overviewCache?.organic_visibility_score ?? 'N/A'}/100
- Paid traffic share: ${overviewCache?.paid_vs_organic_balance != null ? `${(Number(overviewCache.paid_vs_organic_balance) * 100).toFixed(0)}%` : 'N/A'}

Top keyword gap opportunities: ${(keywordGaps ?? []).slice(0, 5).map((g) => `"${g.keyword}" (competitor at #${g.competitor_position}, vol: ${g.search_volume})`).join(', ')}

Respond with a JSON array of exactly 4 insights. Each insight must be an object with these fields:
- title: string (concise, 5-8 words)
- description: string (2-3 sentences with specific data points)
- action: string (one clear, specific next step)
- impact: string ("High", "Medium", or "Low")
- category: string (one of: "Traffic", "Organic SEO", "Conversion", "Budget")

Return only valid JSON, no markdown.`

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
  let insights: unknown[]
  try {
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
    insights = JSON.parse(cleaned)
  } catch {
    return Response.json({ error: 'Failed to parse AI response' }, { status: 500 })
  }

  await service.from('analytics_insights_cache').upsert({
    tenant_id: TENANT_ID,
    insights,
    calculated_at: new Date().toISOString(),
  }, { onConflict: 'tenant_id' })

  return Response.json({ insights })
}
