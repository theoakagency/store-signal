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
  const [{ data: statsRows }, { data: topCustomers }, { data: allCustomers }] = await Promise.all([
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

  const storeContext = `
Store: LashBox LA (beauty/lash retail, 10+ years in business)
Total paid orders (all time): ${orderCount}
Total revenue (all time): $${totalRevenue.toFixed(0)}
Average order value: $${aov.toFixed(2)}
Average LTV (top 20 customers): $${avgLTV.toFixed(2)}
Total customers in CRM: ${totalCustomers}
Lapsed customers (90+ days inactive): ${lapsedCount} (${totalCustomers > 0 ? Math.round((lapsedCount / totalCustomers) * 100) : 0}%)
  `.trim()

  const prompt = `You are a retail promotion strategist. A beauty brand (LashBox LA) wants to evaluate a promotion idea. Use the real store data below to give a grounded, honest assessment — validate or challenge the team's thinking.

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
