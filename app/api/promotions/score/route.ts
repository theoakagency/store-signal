import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const STORE_ID = '00000000-0000-0000-0000-000000000002'

export async function POST(req: NextRequest) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  // Auth check
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const {
    name,
    description,
    status,
    promotion_type,
    discount_type,
    discount_value,
    target_audience,
    channel,
    budget,
    duration_days,
    started_at,
    ended_at,
  } = body

  if (!name || !promotion_type || !discount_type) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Fetch store context for the AI prompt
  const service = createSupabaseServiceClient()
  const [{ data: statsRows }, { data: topCustomers }, { data: allCustomers }, { data: klaviyoMetrics }, { data: recentCampaigns }, { data: gscKeywords }, { data: gscMonthly }, { data: semrushMetrics }, { data: topProducts }] = await Promise.all([
    service
      .from('orders')
      .select('total_price, financial_status')
      .eq('store_id', STORE_ID)
      .eq('financial_status', 'paid'),
    service
      .from('customers')
      .select('total_spent, orders_count')
      .eq('store_id', STORE_ID)
      .order('total_spent', { ascending: false })
      .limit(20),
    service
      .from('customers')
      .select('orders_count, updated_at')
      .eq('store_id', STORE_ID),
    service
      .from('klaviyo_metrics_cache')
      .select('metric_name, metric_value')
      .eq('tenant_id', TENANT_ID),
    service
      .from('klaviyo_campaigns')
      .select('name, open_rate, click_rate, revenue_attributed, unsubscribe_count, recipient_count')
      .eq('tenant_id', TENANT_ID)
      .order('send_time', { ascending: false })
      .limit(5),
    service
      .from('gsc_keywords')
      .select('query, clicks, impressions, ctr, position')
      .eq('tenant_id', TENANT_ID)
      .order('clicks', { ascending: false })
      .limit(10),
    service
      .from('gsc_monthly_clicks')
      .select('month, clicks')
      .eq('tenant_id', TENANT_ID)
      .order('month', { ascending: true }),
    service
      .from('semrush_metrics_cache')
      .select('organic_keywords_total, organic_traffic_estimate, keyword_opportunities, top_competitors')
      .eq('tenant_id', TENANT_ID)
      .maybeSingle(),
    service
      .from('product_stats')
      .select('product_title, total_revenue, repeat_purchase_rate, avg_days_to_repurchase, subscription_conversion_rate')
      .eq('tenant_id', TENANT_ID)
      .order('total_revenue', { ascending: false })
      .limit(5),
  ])

  const totalRevenue = (statsRows ?? []).reduce((s, r) => s + Number(r.total_price), 0)
  const orderCount = (statsRows ?? []).length
  const aov = orderCount > 0 ? totalRevenue / orderCount : 0
  const avgLTV = topCustomers && topCustomers.length > 0
    ? topCustomers.reduce((s, c) => s + Number(c.total_spent), 0) / topCustomers.length
    : 0

  // Estimate lapsed customers (no activity in 90+ days)
  const now = Date.now()
  const lapsedCount = (allCustomers ?? []).filter(
    (c) => (now - new Date(c.updated_at).getTime()) / 86400000 > 90
  ).length
  const totalCustomers = (allCustomers ?? []).length

  // Build Klaviyo email context if available
  const kvMetrics: Record<string, number> = {}
  for (const row of klaviyoMetrics ?? []) kvMetrics[row.metric_name] = Number(row.metric_value)
  const hasKlaviyo = Object.keys(kvMetrics).length > 0
  const avgOpenRate = kvMetrics['avg_campaign_open_rate']
  const avgClickRate = kvMetrics['avg_campaign_click_rate']
  const avgCampaignRevenue = (klaviyoMetrics ?? []).length > 0 && (recentCampaigns ?? []).length > 0
    ? (recentCampaigns ?? []).reduce((s, c) => s + Number(c.revenue_attributed), 0) / (recentCampaigns ?? []).length
    : null
  const recentUnsubs = (recentCampaigns ?? []).reduce((s, c) => s + (c.unsubscribe_count ?? 0), 0)
  const flowRevenueRatio = kvMetrics['total_flow_revenue'] && kvMetrics['total_campaign_revenue']
    ? kvMetrics['total_flow_revenue'] / Math.max(kvMetrics['total_campaign_revenue'], 1)
    : null

  const emailContext = hasKlaviyo
    ? `
EMAIL PERFORMANCE (Klaviyo):
- Avg campaign open rate: ${avgOpenRate != null ? (avgOpenRate * 100).toFixed(1) + '%' : 'N/A'}
- Avg campaign click rate: ${avgClickRate != null ? (avgClickRate * 100).toFixed(1) + '%' : 'N/A'}
- Avg revenue per recent campaign send: ${avgCampaignRevenue != null ? '$' + avgCampaignRevenue.toFixed(0) : 'N/A'}
- Unsubscribes from last 5 campaigns: ${recentUnsubs}
- Flow revenue vs broadcast ratio: ${flowRevenueRatio != null ? flowRevenueRatio.toFixed(2) + '× (flows earn more per recipient)' : 'N/A'}
${channel?.toLowerCase().includes('email') && avgOpenRate
  ? `- Est. email reach for this promo: ${Math.round((avgOpenRate) * 100)}% of list will open, ${avgClickRate ? Math.round(avgClickRate * 100) + '%' : 'N/A'} will click`
  : ''}`.trim()
    : ''

  // Build GSC context if data is available
  const hasGsc = (gscKeywords ?? []).length > 0
  const gscTotal90d = (gscMonthly ?? []).slice(-3).reduce((s, m) => s + m.clicks, 0)
  const gscPrior90d = (gscMonthly ?? []).slice(-6, -3).reduce((s, m) => s + m.clicks, 0)
  const gscTrend = gscPrior90d > 0
    ? ((gscTotal90d - gscPrior90d) / gscPrior90d) * 100
    : null
  const gscContext = hasGsc
    ? `
ORGANIC SEARCH (Google Search Console):
- Traffic trend: ${gscTrend != null ? `${gscTrend >= 0 ? '+' : ''}${gscTrend.toFixed(1)}% vs prior 90 days` : 'unknown'}
- Top 10 keywords: ${(gscKeywords ?? []).map((k) => `"${k.query}" (pos ${(k.position ?? 0).toFixed(1)}, ${k.clicks} clicks)`).join(', ')}`.trim()
    : ''

  // Build SEMrush context if available
  const semrushData = semrushMetrics as {
    organic_keywords_total: number | null
    organic_traffic_estimate: number | null
    keyword_opportunities: Array<{ keyword: string; position: number; search_volume: number }> | null
    top_competitors: Array<{ domain: string; common_keywords: number }> | null
  } | null

  const hasSemrush = !!semrushData?.organic_keywords_total
  const quickWinKeywords = (semrushData?.keyword_opportunities ?? []).slice(0, 5)
  const topCompetitor = semrushData?.top_competitors?.[0]?.domain ?? null

  const semrushContext = hasSemrush
    ? `
ORGANIC SEO (SEMrush):
- Total ranking keywords: ${semrushData!.organic_keywords_total?.toLocaleString()}
- Estimated monthly organic traffic: ${semrushData!.organic_traffic_estimate?.toLocaleString()}
- Top competitor: ${topCompetitor ?? 'unknown'}
- Quick-win keywords (positions 4-10): ${quickWinKeywords.map((k) => `"${k.keyword}" (pos ${k.position}, ${k.search_volume.toLocaleString()} monthly searches)`).join(', ') || 'none identified'}`.trim()
    : ''

  // Build product intelligence context
  const hasProductStats = (topProducts ?? []).length > 0
  const productContext = hasProductStats
    ? `
TOP PRODUCTS (by revenue):
${(topProducts ?? []).map((p) => {
  const repeatPct = (Number(p.repeat_purchase_rate) * 100).toFixed(0)
  const subPct = (Number(p.subscription_conversion_rate) * 100).toFixed(0)
  const cycle = p.avg_days_to_repurchase ? ` reorder every ~${Math.round(Number(p.avg_days_to_repurchase))}d` : ''
  return `- "${p.product_title}": $${Number(p.total_revenue).toLocaleString('en-US', { maximumFractionDigits: 0 })} revenue, ${repeatPct}% repeat rate${cycle}, ${subPct}% subscribe`
}).join('\n')}`.trim()
    : ''

  const storeContext = `
Store: LashBox LA (beauty/lash retail, 10+ years in business)
Total paid orders (all time): ${orderCount}
Total revenue (all time): $${totalRevenue.toFixed(0)}
Average order value: $${aov.toFixed(2)}
Average LTV (top 20 customers): $${avgLTV.toFixed(2)}
Total customers in CRM: ${totalCustomers}
Lapsed customers (90+ days inactive): ${lapsedCount} (${totalCustomers > 0 ? Math.round((lapsedCount / totalCustomers) * 100) : 0}%)
${emailContext}
${gscContext}
${semrushContext}
${productContext}`.trim()

  const emailInstruction = hasKlaviyo && avgOpenRate
    ? `This store's email campaigns average ${(avgOpenRate * 100).toFixed(1)}% open rate and ${avgCampaignRevenue != null ? '$' + avgCampaignRevenue.toFixed(0) : 'an unknown amount'} revenue per send. Their automated flows generate ${flowRevenueRatio != null ? flowRevenueRatio.toFixed(1) + '×' : 'more'} revenue per recipient than broadcast campaigns. Factor this into the audience fit and buying motivation scores when the channel involves email.`
    : ''

  const gscInstruction = hasGsc
    ? ` This store's organic search traffic is ${gscTrend != null ? `${gscTrend >= 0 ? 'trending up' : 'trending down'} ${Math.abs(gscTrend).toFixed(1)}%` : 'trending'} vs the prior 90 days. Their top organic keywords are: ${(gscKeywords ?? []).slice(0, 5).map((k) => `"${k.query}"`).join(', ')}. Factor in whether this promotion could support or conflict with their SEO strategy — for example, whether it targets the same audience as their organic traffic or cannibalizes search intent.`
    : ''

  const semrushInstruction = hasSemrush
    ? ` According to SEMrush, this store ranks for ${semrushData!.organic_keywords_total?.toLocaleString()} organic keywords with ~${semrushData!.organic_traffic_estimate?.toLocaleString()} monthly visits. ${quickWinKeywords.length > 0 ? `Their highest-opportunity keywords in positions 4-10 include: ${quickWinKeywords.map((k) => `"${k.keyword}"`).join(', ')}. A promotion targeting these product categories would amplify SEO intent rather than rely entirely on paid/email reach.` : ''} ${topCompetitor ? `Their top competitor by keyword overlap is ${topCompetitor}.` : ''} Consider whether this promotion targets a category with strong organic presence (less incremental value from promotion) or a category with weak organic reach (higher value from promotion).`
    : ''

  const productInstruction = hasProductStats
    ? ` Product data is available: consider whether the promoted product has a high or low repeat purchase rate, whether it has subscription expansion potential (gap between repeat rate and subscription conversion), and whether the promotion targets a high-value product (by total revenue) or a gateway product that drives future purchases.`
    : ''

  const prompt = `You are a retail promotion strategist. A beauty brand (LashBox LA) wants to evaluate a promotion idea. Use the real store data below to give a grounded, honest assessment — validate or challenge the team's thinking.${emailInstruction ? ' ' + emailInstruction : ''}${gscInstruction}${semrushInstruction}${productInstruction}

STORE DATA:
${storeContext}

PROMOTION DETAILS:
- Name: ${name}
- Description: ${description || 'Not provided'}
- Status: ${status || 'Just considering'}
- Type: ${promotion_type}
- Discount: ${discount_value ? `${discount_value}${discount_type === 'percentage' ? '%' : ' fixed ($)'}` : 'Not specified'}
- Target audience: ${target_audience || 'All customers'}
- Distribution channel: ${channel || 'All channels'}
- Budget: ${budget ? `$${budget}` : 'Not specified'}
- Duration: ${duration_days ? `${duration_days} days` : 'Not specified'}

Score this promotion across exactly these 5 dimensions (0–100 each):
1. Audience Fit — how well the offer matches the target segment's actual behavior and needs, based on the store data
2. Buying Motivation — how compelling the incentive is to drive a purchase decision
3. Margin Impact — how well margin is protected (higher = better margin safety; a deep discount scores lower)
4. Timing & Urgency — how well the promotion creates a real reason to act now
5. Staff Effort ROI — how much revenue impact is expected relative to the operational effort required

Return ONLY a valid JSON object — no markdown, no commentary, no code fences:
{
  "overall_score": <0-100 integer>,
  "audience_fit": <0-100 integer>,
  "buying_motivation": <0-100 integer>,
  "margin_impact": <0-100 integer>,
  "timing_urgency": <0-100 integer>,
  "staff_effort_roi": <0-100 integer>,
  "verdict": "<One punchy sentence verdict — be direct, not generic>",
  "main_analysis": "<2-3 sentences grounded in the store data. Reference specific numbers where they strengthen the point. Challenge or validate the team's approach honestly.>",
  "what_to_try_instead": "<1-2 sentences suggesting a concrete alternative or tweak if the score is below 70, or a way to amplify the promotion if it scores well. Be specific.>",
  "strengths": ["<specific strength 1>", "<specific strength 2>"],
  "risks": ["<specific risk 1>", "<specific risk 2>"]
}`

  let analysis: {
    overall_score: number
    audience_fit: number
    buying_motivation: number
    margin_impact: number
    timing_urgency: number
    staff_effort_roi: number
    verdict: string
    main_analysis: string
    what_to_try_instead: string
    strengths: string[]
    risks: string[]
  }

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    // Strip any accidental markdown code fences before parsing
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    analysis = JSON.parse(cleaned)
  } catch (err) {
    return Response.json({ error: `AI scoring failed: ${(err as Error).message}` }, { status: 500 })
  }

  // Save to promotions table
  const { data: saved, error: dbErr } = await service
    .from('promotions')
    .insert({
      tenant_id: TENANT_ID,
      store_id: STORE_ID,
      name,
      description: description ?? null,
      discount_type,
      discount_value: discount_value ? parseFloat(discount_value) : null,
      score: analysis.overall_score,
      started_at: started_at ?? null,
      ended_at: ended_at ?? null,
      form_data: body,
      ai_analysis: analysis,
      target_audience: target_audience ?? null,
      promotion_type,
      channel: channel ?? null,
      budget: budget ? parseFloat(budget) : null,
      duration_days: duration_days ? parseInt(duration_days, 10) : null,
    })
    .select('id')
    .single()

  if (dbErr) {
    return Response.json({ error: `DB error: ${dbErr.message}` }, { status: 500 })
  }

  return Response.json({ id: saved?.id, analysis })
}
