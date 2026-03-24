/**
 * POST /api/insights/products
 * Generates AI product analysis using product_stats, product_affinities,
 * and purchase_sequences data.
 */
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

  const [{ data: topProducts }, { data: topAffinities }, { data: topSequences }, { data: subOpps }] =
    await Promise.all([
      service.from('product_stats')
        .select('product_title, total_revenue, unique_customers, repeat_purchase_rate, avg_days_to_repurchase, subscription_conversion_rate, revenue_12m, total_orders')
        .eq('tenant_id', TENANT_ID)
        .order('total_revenue', { ascending: false })
        .limit(10),
      service.from('product_affinities')
        .select('product_a, product_b, co_purchase_count, co_purchase_rate, lift')
        .eq('tenant_id', TENANT_ID)
        .order('lift', { ascending: false })
        .limit(10),
      service.from('purchase_sequences')
        .select('first_product, second_product, sequence_count, avg_days_between, ltv_of_customers_in_sequence')
        .eq('tenant_id', TENANT_ID)
        .order('ltv_of_customers_in_sequence', { ascending: false })
        .limit(10),
      service.from('product_stats')
        .select('product_title, repeat_purchase_rate, avg_days_to_repurchase, subscription_conversion_rate, unique_customers')
        .eq('tenant_id', TENANT_ID)
        .gt('repeat_purchase_rate', 0.3)
        .lt('subscription_conversion_rate', 0.1)
        .order('repeat_purchase_rate', { ascending: false })
        .limit(5),
    ])

  if (!topProducts || topProducts.length === 0) {
    return Response.json({ error: 'No product data — run analysis first' }, { status: 400 })
  }

  const context = `
TOP PRODUCTS BY REVENUE:
${(topProducts).map((p) => `- "${p.product_title}": $${Number(p.total_revenue).toLocaleString()} all-time revenue ($${Number(p.revenue_12m).toLocaleString()} last 12m), ${p.unique_customers} buyers, ${(Number(p.repeat_purchase_rate) * 100).toFixed(0)}% repeat rate, ${p.avg_days_to_repurchase ? Math.round(Number(p.avg_days_to_repurchase)) + ' avg days to repurchase' : 'no repurchase data'}, ${(Number(p.subscription_conversion_rate) * 100).toFixed(0)}% subscribe`).join('\n')}

TOP AFFINITY PAIRS (frequently bought together, sorted by lift):
${(topAffinities ?? []).map((a) => `- "${a.product_a}" + "${a.product_b}": ${a.co_purchase_count} co-purchases, ${(Number(a.co_purchase_rate) * 100).toFixed(1)}% of orders contain both, ${Number(a.lift).toFixed(1)}× lift`).join('\n')}

TOP PURCHASE SEQUENCES (first purchase → second purchase within 90 days):
${(topSequences ?? []).map((s) => `- "${s.first_product}" → "${s.second_product}": ${s.sequence_count} customers, avg ${Math.round(Number(s.avg_days_between))} days between, avg customer LTV $${Number(s.ltv_of_customers_in_sequence).toLocaleString()}`).join('\n')}

SUBSCRIPTION OPPORTUNITIES (high repeat purchase rate, low subscription conversion):
${(subOpps ?? []).map((p) => `- "${p.product_title}": ${(Number(p.repeat_purchase_rate) * 100).toFixed(0)}% repeat rate, only ${(Number(p.subscription_conversion_rate) * 100).toFixed(0)}% convert to subscription, ${p.unique_customers} total buyers, reorder every ~${p.avg_days_to_repurchase ? Math.round(Number(p.avg_days_to_repurchase)) : '?'} days`).join('\n')}
`.trim()

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 900,
    messages: [{
      role: 'user',
      content: `You are a retail merchandising analyst for a beauty/lash brand (LashBox LA). Analyze this product data and answer exactly these 6 questions as 6 numbered bullet points. Be specific — use actual product names and numbers. Be direct and actionable.

1. What is the single most important product for customer retention and why?
2. Which product is underperforming relative to its potential (good customer count but low repeat rate or flat revenue trend)?
3. What bundle would you recommend creating based on affinity data, and what should the bundle price be?
4. Which purchase sequence leads to the highest-LTV customers, and what does this reveal about the customer journey?
5. Are there any products that should be considered for discontinuation based on weak repeat rates and low revenue?
6. What is the single biggest subscription expansion opportunity based on the repeat purchase vs subscription conversion gap?

Keep each answer to 2–3 sentences max.

${context}`,
    }],
  })

  const insight = message.content[0].type === 'text' ? message.content[0].text : ''
  return Response.json({ insight })
}
