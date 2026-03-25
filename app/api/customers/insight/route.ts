import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'

const STORE_ID  = '00000000-0000-0000-0000-000000000002'
const TENANT_ID = '00000000-0000-0000-0000-000000000001'

export async function POST(req: NextRequest) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const supabase  = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { email } = await req.json()
  if (!email) return Response.json({ error: 'Missing email' }, { status: 400 })

  const service = createSupabaseServiceClient()

  const [{ data: profile }, { data: recentOrders }] = await Promise.all([
    service
      .from('customer_profiles')
      .select('total_revenue, total_orders, avg_order_value, segment, ltv_segment, is_subscriber, is_loyalty_member, loyalty_tier, avg_days_between_orders, days_since_last_order, subscription_interval')
      .eq('tenant_id', TENANT_ID)
      .eq('email', email.toLowerCase())
      .single(),
    service
      .from('orders')
      .select('order_number, total_price, financial_status, processed_at')
      .eq('store_id', STORE_ID)
      .ilike('email', email.toLowerCase())
      .order('processed_at', { ascending: false })
      .limit(10),
  ])

  if (!profile) return Response.json({ error: 'Customer not found' }, { status: 404 })

  const orderSummary = (recentOrders ?? [])
    .map((o) => `- Order ${o.order_number}: $${o.total_price} (${o.financial_status}, ${o.processed_at?.split('T')[0]})`)
    .join('\n')

  const prompt = `You are a customer insights AI for a beauty retail brand.

CUSTOMER PROFILE:
- Email: ${email}
- Segment: ${profile.segment ?? 'unknown'}
- LTV tier: ${profile.ltv_segment ?? 'unknown'}
- Total orders: ${profile.total_orders}
- Total revenue: $${Number(profile.total_revenue).toFixed(2)}
- Avg order value: $${Number(profile.avg_order_value).toFixed(2)}
- Avg reorder interval: ${profile.avg_days_between_orders ? `${Math.round(Number(profile.avg_days_between_orders))} days` : 'N/A'}
- Days since last order: ${profile.days_since_last_order ?? 'N/A'}
- Subscriber: ${profile.is_subscriber ? `Yes (${profile.subscription_interval ?? ''})` : 'No'}
- Loyalty member: ${profile.is_loyalty_member ? `Yes — ${profile.loyalty_tier ?? ''} tier` : 'No'}

RECENT ORDERS:
${orderSummary || 'No recent orders on record'}

Write a brief (3-4 sentences) customer intelligence summary for a store manager. Include:
1. The customer's value tier and purchasing pattern
2. One specific, actionable recommendation to re-engage or upsell this customer
3. Any notable signals or risks

Be specific and concise. Do not use generic filler.`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    })

    const insight = message.content[0].type === 'text' ? message.content[0].text : ''
    return Response.json({ insight })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 })
  }
}
