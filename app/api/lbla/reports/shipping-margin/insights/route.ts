/**
 * POST /api/lbla/reports/shipping-margin/insights
 * Requires a signed-in user; /lbla + /api/lbla are gated behind Supabase login in proxy.ts (LBLA team tool)
 *
 * User-triggered only (button click on the shipping margin report) — unlike
 * /api/klaviyo/insights, this must NOT auto-fire on page load.
 *
 * Unlike the other AI insight routes (Klaviyo, analytics-overview, ...), this
 * one does not query the database itself. It's handed the exact aggregates the
 * shipping-margin report already computed and displayed (by_tier, by_bucket,
 * free_shipping_threshold, loss_leaders) and is instructed to reason only over
 * those numbers — so the AI's narrative can never drift from what's on screen.
 */
import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createSupabaseServerClient } from '@/lib/supabase'

export const maxDuration = 60

interface TierRow { method: string; orders: number; avg_charged: number; avg_paid: number; avg_margin: number; total_margin: number }
interface BucketRow { label: string; min: number; orders: number; pct_free: number; avg_label_cost: number; avg_margin: number; total_margin: number }
interface LossLeader { order_number: string; method: string; charged: number; paid: number; gap: number; subtotal: number }
interface FreeShippingThreshold { detected: boolean; subtotal_min: number | null; bucket_label: string | null; pct_free_at_threshold: number | null }

interface InsightsRequestBody {
  range: { start: string; end: string }
  summary: { shipping_collected: number; shipping_paid: number; net_margin: number; margin_pct: number | null; orders: number }
  by_tier: TierRow[]
  by_bucket: BucketRow[]
  free_shipping_threshold: FreeShippingThreshold
  free_shipping: { orders: number; carrier_cost: number }
  loss_leaders: LossLeader[]
}

export interface ShippingMarginSuggestion {
  area: 'free_shipping_threshold' | 'tier_pricing' | 'rate_alignment'
  supported: boolean
  title: string
  detail: string
}

function isValidBody(body: unknown): body is InsightsRequestBody {
  if (!body || typeof body !== 'object') return false
  const b = body as Record<string, unknown>
  return (
    !!b.range && !!b.summary && Array.isArray(b.by_tier) && Array.isArray(b.by_bucket) &&
    !!b.free_shipping_threshold && !!b.free_shipping && Array.isArray(b.loss_leaders)
  )
}

const usd = (n: number) => `$${n.toFixed(2)}`
const pct = (n: number | null) => (n == null ? 'n/a' : `${(n * 100).toFixed(1)}%`)

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!isValidBody(body)) {
    return Response.json({ error: 'Missing or malformed report data in request body' }, { status: 400 })
  }
  const { range, summary, by_tier, by_bucket, free_shipping_threshold, free_shipping, loss_leaders } = body

  if (summary.orders === 0) {
    return Response.json({ error: 'No matched orders in this range — nothing to analyze' }, { status: 400 })
  }

  const tierSummary = by_tier
    .map((t) => `- "${t.method}" | ${t.orders} orders | avg charged ${usd(t.avg_charged)} | avg carrier cost ${usd(t.avg_paid)} | avg margin ${usd(t.avg_margin)} | total margin ${usd(t.total_margin)}`)
    .join('\n')

  const bucketSummary = by_bucket
    .map((b) => `- ${b.label} (subtotal) | ${b.orders} orders | ${pct(b.pct_free)} free shipping | avg carrier cost ${usd(b.avg_label_cost)} | avg margin ${usd(b.avg_margin)}`)
    .join('\n')

  const thresholdSummary = free_shipping_threshold.detected
    ? `Detected: free shipping becomes the norm (${pct(free_shipping_threshold.pct_free_at_threshold)}+ of orders) starting at the "${free_shipping_threshold.bucket_label}" bucket (order subtotal >= $${free_shipping_threshold.subtotal_min}) and stays the norm for every higher bucket.`
    : 'Not detected: no order-value bucket shows free shipping becoming and staying the norm for all higher buckets. Free shipping in this data does not clearly track a single order-value threshold.'

  const lossLeaderSummary = loss_leaders
    .slice(0, 10)
    .map((l) => `- #${l.order_number} | ${l.method} | subtotal ${usd(l.subtotal)} | charged ${usd(l.charged)} | carrier cost ${usd(l.paid)} | lost ${usd(l.gap)}`)
    .join('\n')

  const prompt = `You are a shipping and logistics analyst reviewing a shipping-margin report for LashBox LA, a beauty/lash retail brand, covering ${range.start} to ${range.end}.

You must reason ONLY from the numbers given below. Do not invent additional figures, estimate carrier rates that aren't shown, or perform calculations beyond what's needed to describe these numbers in plain language. If the data does not clearly support a conclusion in one of the three areas below, say so explicitly rather than force a recommendation — these are decision-support suggestions for a human to consider, not directives.

OVERALL SUMMARY:
- Shipping collected from customers: ${usd(summary.shipping_collected)}
- Paid to carriers (label + insurance): ${usd(summary.shipping_paid)}
- Net shipping margin: ${usd(summary.net_margin)} (${pct(summary.margin_pct)} of collected)
- Matched orders analyzed: ${summary.orders}

MARGIN BY SHIPPING TIER:
${tierSummary || 'No tier data'}

MARGIN BY ORDER-VALUE BUCKET:
${bucketSummary || 'No bucket data'}

FREE-SHIPPING THRESHOLD DETECTION:
${thresholdSummary}
- Total carrier cost of ALL free-shipping orders in range: ${usd(free_shipping.carrier_cost)} across ${free_shipping.orders} orders.

BIGGEST SHIPPING LOSSES (individual orders where carrier cost most exceeded what the customer was charged):
${lossLeaderSummary || 'No loss-leader orders in this range'}

Write:
1. A short plain-language "summary" (2-4 sentences) of the overall shipping margin picture in this range.
2. Exactly 3 "suggestions", one for each of these areas, in this order:
   a. "free_shipping_threshold" — whether the free-shipping threshold should be raised, based on the order-value bucket data and the cost of free shipping above the current threshold. If no threshold was detected, say so and explain why the data doesn't support a threshold-based recommendation.
   b. "tier_pricing" — whether any specific shipping tier/method appears underpriced or overpriced, based on the margin-by-tier table. If no tier stands out, say so.
   c. "rate_alignment" — whether shipping rates in general appear misaligned with actual carrier costs, based on the overall summary and loss-leader orders. If margins look healthy and losses look like isolated exceptions, say so.

For each suggestion, set "supported" to true only if the data clearly supports a specific recommendation for that area; set it to false if the data is inconclusive or doesn't show a clear pattern, and explain why in "detail" instead of forcing a recommendation.

Return ONLY a JSON object — no markdown, no code fences:
{
  "summary": "<2-4 sentences>",
  "suggestions": [
    { "area": "free_shipping_threshold", "supported": true | false, "title": "<short title, max 10 words>", "detail": "<2-3 sentences grounded in the numbers above, phrased as something to consider>" },
    { "area": "tier_pricing", "supported": true | false, "title": "<short title, max 10 words>", "detail": "<2-3 sentences grounded in the numbers above, phrased as something to consider>" },
    { "area": "rate_alignment", "supported": true | false, "title": "<short title, max 10 words>", "detail": "<2-3 sentences grounded in the numbers above, phrased as something to consider>" }
  ]
}`

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : '{}'
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const parsed: { summary: string; suggestions: ShippingMarginSuggestion[] } = JSON.parse(cleaned)
    return Response.json(parsed)
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 })
  }
}
