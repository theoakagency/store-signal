import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'

const STORE_ID = '00000000-0000-0000-0000-000000000002'

export async function POST(req: NextRequest) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { shopify_customer_id } = await req.json()
  if (!shopify_customer_id) return Response.json({ error: 'Missing customer id' }, { status: 400 })

  const service = createSupabaseServiceClient()

  const [{ data: customer }, { data: recentOrders }] = await Promise.all([
    service
      .from('customers')
      .select('*')
      .eq('store_id', STORE_ID)
      .eq('shopify_customer_id', shopify_customer_id)
      .single(),
    service
      .from('orders')
      .select('order_number, total_price, financial_status, fulfillment_status, processed_at, line_items')
      .eq('store_id', STORE_ID)
      .eq('customer_id', shopify_customer_id)
      .order('processed_at', { ascending: false })
      .limit(10),
  ])

  if (!customer) return Response.json({ error: 'Customer not found' }, { status: 404 })

  const orderSummary = (recentOrders ?? [])
    .map((o) => `- Order ${o.order_number}: $${o.total_price} (${o.financial_status}, ${o.processed_at?.split('T')[0]})`)
    .join('\n')

  const prompt = `You are a customer insights AI for a beauty retail brand (LashBox LA).

CUSTOMER PROFILE:
- Name: ${customer.first_name ?? ''} ${customer.last_name ?? ''}
- Email: ${customer.email ?? 'unknown'}
- Total orders: ${customer.orders_count}
- Total spent: $${customer.total_spent}
- Tags: ${(customer.tags ?? []).join(', ') || 'none'}

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
