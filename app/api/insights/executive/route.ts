import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'

export const maxDuration = 60

const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const STORE_ID = '00000000-0000-0000-0000-000000000002'

export interface ExecutiveInsight {
  title: string
  description: string
  sources: string[]
  action: string
  impact: 'Low' | 'Medium' | 'High'
}

// ── GET: return cached insights ───────────────────────────────────────────────

export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createSupabaseServiceClient()
  const { data } = await service
    .from('executive_insights_cache')
    .select('insights, calculated_at')
    .eq('tenant_id', TENANT_ID)
    .maybeSingle()

  return Response.json({ insights: data?.insights ?? [], calculated_at: data?.calculated_at ?? null })
}

// ── POST: regenerate insights ────────────────────────────────────────────────

export async function POST(_req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createSupabaseServiceClient()
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  // Fetch all data sources in parallel
  const [
    { data: metricsRows },
    { data: klaviyoMetrics },
    { data: metaMetrics },
    { data: googleMetrics },
    { data: gscMonthly },
    { data: gscKeywords },
    { data: channelCache },
    { data: ga4Metrics },
    { data: ga4Sessions },
    { data: ga4Monthly },
  ] = await Promise.all([
    service.from('metrics_cache').select('metric_name, metric_value').eq('store_id', STORE_ID),
    service.from('klaviyo_metrics_cache').select('metric_name, metric_value').eq('tenant_id', TENANT_ID),
    service.from('meta_metrics_cache').select('metric_name, metric_value').eq('tenant_id', TENANT_ID),
    service.from('google_metrics_cache').select('metric_name, metric_value').eq('tenant_id', TENANT_ID),
    service.from('gsc_monthly_clicks').select('month, clicks').eq('tenant_id', TENANT_ID).order('month', { ascending: true }),
    service.from('gsc_keywords').select('query, clicks, position').eq('tenant_id', TENANT_ID).order('clicks', { ascending: false }).limit(5),
    service.from('sales_channel_cache').select('channel_name, revenue, order_count').eq('tenant_id', TENANT_ID).eq('period', 'last_30d'),
    service.from('analytics_metrics_cache').select('metric_name, metric_value').eq('tenant_id', TENANT_ID),
    service.from('analytics_sessions').select('channel, sessions, conversions, revenue').eq('tenant_id', TENANT_ID).eq('date_range', '90d').order('sessions', { ascending: false }).limit(6),
    service.from('analytics_monthly').select('month, sessions').eq('tenant_id', TENANT_ID).order('month', { ascending: true }),
  ])

  // Build lookup maps
  const shopify: Record<string, number> = {}
  for (const r of metricsRows ?? []) shopify[r.metric_name] = Number(r.metric_value)
  const klaviyo: Record<string, number> = {}
  for (const r of klaviyoMetrics ?? []) klaviyo[r.metric_name] = Number(r.metric_value)
  const meta: Record<string, number> = {}
  for (const r of metaMetrics ?? []) meta[r.metric_name] = Number(r.metric_value)
  const google: Record<string, number> = {}
  for (const r of googleMetrics ?? []) google[r.metric_name] = Number(r.metric_value)
  const ga4: Record<string, number> = {}
  for (const r of ga4Metrics ?? []) ga4[r.metric_name] = Number(r.metric_value)

  // GSC trend
  const gscTotal90 = (gscMonthly ?? []).slice(-3).reduce((s, m) => s + m.clicks, 0)
  const gscPrior90 = (gscMonthly ?? []).slice(-6, -3).reduce((s, m) => s + m.clicks, 0)
  const gscTrendPct = gscPrior90 > 0 ? ((gscTotal90 - gscPrior90) / gscPrior90) * 100 : null

  // Build context
  const sections: string[] = []

  if (Object.keys(shopify).length > 0) {
    sections.push(`SHOPIFY (30d vs prior 30d):
- Revenue: $${(shopify['revenue_30d'] ?? 0).toFixed(0)} (prior: $${(shopify['revenue_30d_prior'] ?? 0).toFixed(0)})
- Orders: ${(shopify['order_count_30d'] ?? 0).toFixed(0)} (prior: ${(shopify['order_count_30d_prior'] ?? 0).toFixed(0)})
- AOV: $${(shopify['aov_30d'] ?? 0).toFixed(2)}
- Customers: ${(shopify['customer_count'] ?? 0).toFixed(0)}
- Avg LTV: $${(shopify['avg_ltv'] ?? 0).toFixed(2)}`)
  }

  if (channelCache && channelCache.length > 0) {
    const total = channelCache.reduce((s, c) => s + c.revenue, 0)
    sections.push(`SALES CHANNELS (30d):
${channelCache.sort((a, b) => b.revenue - a.revenue).map((c) => `- ${c.channel_name}: $${c.revenue.toFixed(0)} (${total > 0 ? ((c.revenue / total) * 100).toFixed(0) : 0}%)`).join('\n')}`)
  }

  if (Object.keys(klaviyo).length > 0) {
    sections.push(`EMAIL / KLAVIYO:
- Total email revenue: $${(klaviyo['total_email_flow_revenue'] ?? 0 + (klaviyo['total_campaign_revenue'] ?? 0)).toFixed(0)}
- Avg campaign open rate: ${((klaviyo['avg_campaign_open_rate'] ?? 0) * 100).toFixed(1)}%
- Email campaigns: ${(klaviyo['email_campaign_count'] ?? 0).toFixed(0)}
- SMS campaigns: ${(klaviyo['sms_campaign_count'] ?? 0).toFixed(0)}
- Flow revenue: $${(klaviyo['total_email_flow_revenue'] ?? 0).toFixed(0)}`)
  }

  if (Object.keys(meta).length > 0) {
    sections.push(`META ADS (30d):
- Spend: $${(meta['total_ad_spend_30d'] ?? 0).toFixed(0)}
- ROAS: ${(meta['total_roas_30d'] ?? 0).toFixed(2)}×
- Cost per purchase: $${(meta['cost_per_purchase_30d'] ?? 0).toFixed(0)}
- Purchases: ${(meta['total_purchases_30d'] ?? 0).toFixed(0)}
- Campaigns below 1× ROAS: ${(meta['campaigns_below_1x_roas'] ?? 0).toFixed(0)}`)
  }

  if (Object.keys(google).length > 0) {
    sections.push(`GOOGLE ADS (30d):
- Spend: $${(google['total_ad_spend_30d'] ?? 0).toFixed(0)}
- ROAS: ${(google['total_roas_30d'] ?? 0).toFixed(2)}×
- Cost per conversion: $${(google['cost_per_conversion_30d'] ?? 0).toFixed(0)}
- Conversions: ${(google['total_conversions_30d'] ?? 0).toFixed(0)}
- Campaigns below 1× ROAS: ${(google['campaigns_below_1x_roas'] ?? 0).toFixed(0)}`)
  }

  if (gscTotal90 > 0 || (gscKeywords?.length ?? 0) > 0) {
    sections.push(`ORGANIC SEARCH (GSC):
- Traffic trend: ${gscTrendPct != null ? `${gscTrendPct >= 0 ? '+' : ''}${gscTrendPct.toFixed(1)}% vs prior 90 days` : 'insufficient data'}
- Top keywords: ${(gscKeywords ?? []).map((k) => `"${k.query}" (pos ${(k.position ?? 0).toFixed(1)}, ${k.clicks} clicks)`).join(', ')}`)
  }

  // GA4 traffic intelligence
  if (Object.keys(ga4).length > 0 || (ga4Sessions?.length ?? 0) > 0) {
    const ga4Monthly2 = ga4Monthly ?? []
    const last2Months = ga4Monthly2.slice(-2)
    const momPct = last2Months.length === 2 && last2Months[0].sessions > 0
      ? ((last2Months[1].sessions - last2Months[0].sessions) / last2Months[0].sessions) * 100
      : null
    const topChannels = (ga4Sessions ?? []).slice(0, 4)
    const totalSessions = (ga4Sessions ?? []).reduce((s, r) => s + r.sessions, 0)

    sections.push(`GOOGLE ANALYTICS 4 (90d):
- Total sessions: ${(ga4['ga4_sessions_90d'] ?? totalSessions).toFixed(0)}
- Ecommerce conversion rate: ${(ga4['ga4_conversion_rate_90d'] ?? 0).toFixed(2)}%
- GA4 revenue: $${(ga4['ga4_revenue_90d'] ?? 0).toFixed(0)} (${(ga4['ga4_transactions_90d'] ?? 0).toFixed(0)} transactions)
- Month-over-month sessions: ${momPct != null ? `${momPct >= 0 ? '+' : ''}${momPct.toFixed(1)}%` : 'insufficient data'}
- Channel breakdown: ${topChannels.map((r) => `${r.channel} ${totalSessions > 0 ? Math.round((r.sessions / totalSessions) * 100) : 0}%`).join(', ')}`)
  }

  if (sections.length === 0) {
    return Response.json({ error: 'No data available — sync at least one platform first' }, { status: 400 })
  }

  const dataStr = sections.join('\n\n')

  const systemPrompt = `You are analyzing cross-platform business intelligence for LashBox LA (lashboxla.com), a professional eyelash extension supply store. You have data from Shopify, Klaviyo email, Meta Ads, Google Ads, Google Search Console, and Google Analytics 4. Your job is to find insights that connect data ACROSS platforms — things you can only see by looking at all the data together. Do not repeat single-platform summaries. Focus on relationships, inefficiencies, and opportunities that cross platforms. When GA4 data is available, use channel breakdown and conversion rate to identify traffic quality issues or channel mix opportunities.`

  const userPrompt = `${dataStr}

Generate 4-6 cross-platform insights. Each should reference data from 2+ sources. Return ONLY a valid JSON array (no markdown):
[
  {
    "title": "Short insight title",
    "description": "2-3 sentences explaining what the data across platforms reveals",
    "sources": ["Shopify", "Klaviyo"],
    "action": "1-2 sentence specific next step",
    "impact": "Low" | "Medium" | "High"
  }
]`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : '[]'
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const insights = JSON.parse(cleaned) as ExecutiveInsight[]

    const now = new Date().toISOString()
    await service
      .from('executive_insights_cache')
      .upsert({ tenant_id: TENANT_ID, insights, calculated_at: now }, { onConflict: 'tenant_id' })

    return Response.json({ insights, calculated_at: now })
  } catch (err) {
    return Response.json({ error: `AI analysis failed: ${(err as Error).message}` }, { status: 500 })
  }
}
