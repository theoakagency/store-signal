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

  // Build date labels for context
  const now = new Date()
  const d90Start = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
  const d30Start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const fmtDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const window30 = `${fmtDate(d30Start)} – ${fmtDate(now)}`
  const window90 = `${fmtDate(d90Start)} – ${fmtDate(now)}`

  if (Object.keys(shopify).length > 0) {
    sections.push(`SHOPIFY — last 30 days (${window30}):
- Revenue (last 30d): $${(shopify['revenue_30d'] ?? 0).toFixed(0)} vs $${(shopify['revenue_30d_prior'] ?? 0).toFixed(0)} prior 30d
- Orders (last 30d): ${(shopify['order_count_30d'] ?? 0).toFixed(0)} vs ${(shopify['order_count_30d_prior'] ?? 0).toFixed(0)} prior 30d
- AOV (last 30d): $${(shopify['aov_30d'] ?? 0).toFixed(2)}
- Total unique customers (24-month history): ${(shopify['customer_count'] ?? 0).toFixed(0)}
- Avg LTV (24-month Shopify history — understated for long-standing customers): $${(shopify['avg_ltv'] ?? 0).toFixed(2)}`)
  }

  if (channelCache && channelCache.length > 0) {
    const total = channelCache.reduce((s, c) => s + c.revenue, 0)
    sections.push(`SHOPIFY SALES CHANNELS — last 30 days (${window30}):
${channelCache.sort((a, b) => b.revenue - a.revenue).map((c) => `- ${c.channel_name}: $${c.revenue.toFixed(0)} (${total > 0 ? ((c.revenue / total) * 100).toFixed(0) : 0}% of revenue)`).join('\n')}`)
  }

  if (Object.keys(klaviyo).length > 0) {
    sections.push(`EMAIL / KLAVIYO — last 12 months (Klaviyo attribution limit):
- Total email + flow revenue (last 12 months, Klaviyo attribution): $${(klaviyo['total_email_flow_revenue'] ?? 0 + (klaviyo['total_campaign_revenue'] ?? 0)).toFixed(0)}
- Avg campaign open rate (last 12 months): ${((klaviyo['avg_campaign_open_rate'] ?? 0) * 100).toFixed(1)}%
- Email campaigns sent (last 12 months): ${(klaviyo['email_campaign_count'] ?? 0).toFixed(0)}
- SMS campaigns sent (last 12 months): ${(klaviyo['sms_campaign_count'] ?? 0).toFixed(0)}
- Flow revenue (last 12 months, Klaviyo attribution): $${(klaviyo['total_email_flow_revenue'] ?? 0).toFixed(0)}`)
  }

  if (Object.keys(meta).length > 0) {
    sections.push(`META ADS — last 90 days (${window90}):
- Spend (last 90 days): $${(meta['total_ad_spend_30d'] ?? 0).toFixed(0)}
- ROAS (last 90 days): ${(meta['total_roas_30d'] ?? 0).toFixed(2)}×
- Cost per purchase (last 90 days): $${(meta['cost_per_purchase_30d'] ?? 0).toFixed(0)}
- Purchases (last 90 days): ${(meta['total_purchases_30d'] ?? 0).toFixed(0)}
- Campaigns below 1× ROAS: ${(meta['campaigns_below_1x_roas'] ?? 0).toFixed(0)}`)
  }

  if (Object.keys(google).length > 0) {
    sections.push(`GOOGLE ADS — last 90 days (${window90}):
- Spend (last 90 days): $${(google['total_ad_spend_30d'] ?? 0).toFixed(0)}
- ROAS (last 90 days): ${(google['total_roas_30d'] ?? 0).toFixed(2)}×
- Cost per conversion (last 90 days): $${(google['cost_per_conversion_30d'] ?? 0).toFixed(0)}
- Conversions (last 90 days): ${(google['total_conversions_30d'] ?? 0).toFixed(0)}
- Campaigns below 1× ROAS: ${(google['campaigns_below_1x_roas'] ?? 0).toFixed(0)}`)
  }

  if (gscTotal90 > 0 || (gscKeywords?.length ?? 0) > 0) {
    sections.push(`ORGANIC SEARCH / GSC — last 90 days (${window90}):
- Click trend (last 90 days vs prior 90 days): ${gscTrendPct != null ? `${gscTrendPct >= 0 ? '+' : ''}${gscTrendPct.toFixed(1)}%` : 'insufficient data'}
- Top keywords by clicks (current snapshot): ${(gscKeywords ?? []).map((k) => `"${k.query}" (pos ${(k.position ?? 0).toFixed(1)}, ${k.clicks} clicks/90d)`).join(', ')}`)
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

    sections.push(`GOOGLE ANALYTICS 4 — last 90 days (${window90}):
- Total sessions (last 90 days): ${(ga4['ga4_sessions_90d'] ?? totalSessions).toFixed(0)}
- Ecommerce conversion rate (last 90 days): ${(ga4['ga4_conversion_rate_90d'] ?? 0).toFixed(2)}%
- GA4-attributed revenue (last 90 days): $${(ga4['ga4_revenue_90d'] ?? 0).toFixed(0)} (${(ga4['ga4_transactions_90d'] ?? 0).toFixed(0)} transactions)
- Month-over-month session change: ${momPct != null ? `${momPct >= 0 ? '+' : ''}${momPct.toFixed(1)}%` : 'insufficient data'}
- Channel mix (last 90 days): ${topChannels.map((r) => `${r.channel} ${totalSessions > 0 ? Math.round((r.sessions / totalSessions) * 100) : 0}%`).join(', ')}`)
  }

  if (sections.length === 0) {
    return Response.json({ error: 'No data available — sync at least one platform first' }, { status: 400 })
  }

  const dataStr = sections.join('\n\n')

  const systemPrompt = `You are analyzing cross-platform business intelligence for LashBox LA (lashboxla.com), a professional eyelash extension supply store. You have data from Shopify, Klaviyo email, Meta Ads, Google Ads, Google Search Console, and Google Analytics 4.

IMPORTANT DATA CONTEXT — read before analyzing:
- Shopify revenue figures use a 30-day window; LTV uses a 24-month window and is UNDERSTATED for long-standing customers
- Klaviyo revenue attribution is limited to the last 12 months by their API — do not compare directly to Shopify revenue without noting this
- Meta Ads, Google Ads, GSC, and GA4 data all cover the last 90 days — these are directly comparable to each other
- When comparing ad spend to email revenue, acknowledge the different attribution windows explicitly
- Never state that two metrics are comparable if they come from different time windows

Your job is to find insights that connect data ACROSS platforms — things you can only see by looking at all the data together. Do not repeat single-platform summaries. Focus on relationships, inefficiencies, and opportunities that cross platforms. When you reference a metric, always note its source platform and time window in your description.`

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
