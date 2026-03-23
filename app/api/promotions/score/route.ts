import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const STORE_ID = '00000000-0000-0000-0000-000000000002'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  // Auth check
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const {
    name,
    description,
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
  const [{ data: statsRows }, { data: topCustomers }] = await Promise.all([
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
  ])

  const totalRevenue = (statsRows ?? []).reduce((s, r) => s + Number(r.total_price), 0)
  const orderCount = (statsRows ?? []).length
  const aov = orderCount > 0 ? totalRevenue / orderCount : 0
  const avgLTV = topCustomers && topCustomers.length > 0
    ? topCustomers.reduce((s, c) => s + Number(c.total_spent), 0) / topCustomers.length
    : 0

  const storeContext = `
Store: LashBox LA (beauty/lash retail)
Total paid orders: ${orderCount}
Total revenue (all time): $${totalRevenue.toFixed(0)}
Average order value: $${aov.toFixed(2)}
Average customer LTV (top 20): $${avgLTV.toFixed(2)}
  `.trim()

  const prompt = `You are a retail promotion strategist AI. Score the following promotion idea for a beauty retail brand.

STORE CONTEXT:
${storeContext}

PROMOTION DETAILS:
- Name: ${name}
- Description: ${description ?? 'N/A'}
- Type: ${promotion_type}
- Discount: ${discount_value}${discount_type === 'percentage' ? '%' : ' fixed'} off
- Target audience: ${target_audience ?? 'All customers'}
- Channel: ${channel ?? 'All channels'}
- Budget: ${budget ? `$${budget}` : 'Unspecified'}
- Duration: ${duration_days ?? 'Unspecified'} days

Score this promotion across 5 dimensions (each 0-100):
1. Revenue Impact — likelihood to drive meaningful revenue lift
2. Margin Safety — how well it protects gross margin
3. Customer Acquisition — potential to bring in new customers
4. Retention Power — effectiveness at retaining existing customers
5. Urgency & Clarity — how compelling and clear the offer is

Return ONLY a JSON object with this exact shape (no markdown, no explanation):
{
  "overall_score": <0-100 integer>,
  "revenue_impact": <0-100 integer>,
  "margin_safety": <0-100 integer>,
  "customer_acquisition": <0-100 integer>,
  "retention_power": <0-100 integer>,
  "urgency_clarity": <0-100 integer>,
  "recommendation": "<2-3 sentence actionable recommendation>",
  "risks": ["<risk 1>", "<risk 2>"],
  "strengths": ["<strength 1>", "<strength 2>"]
}`

  let analysis: {
    overall_score: number
    revenue_impact: number
    margin_safety: number
    customer_acquisition: number
    retention_power: number
    urgency_clarity: number
    recommendation: string
    risks: string[]
    strengths: string[]
  }

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    analysis = JSON.parse(text)
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
