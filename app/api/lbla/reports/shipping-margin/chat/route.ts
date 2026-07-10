/**
 * POST /api/lbla/reports/shipping-margin/chat
 * Requires a signed-in user; /lbla + /api/lbla are gated behind Supabase login in proxy.ts (LBLA team tool)
 *
 * Multi-turn Q&A over the shipping-margin report. Same grounding principle as
 * the /insights route on this page: this route does NOT query the database. It
 * is handed the exact aggregates the report already computed and displayed
 * (summary, by_tier, by_bucket incl. avg order value, free_shipping_threshold,
 * free_shipping cost, cancelled-with-label, loss_leaders) and is instructed to
 * answer ONLY from those numbers. If a question can't be answered from this
 * data, it must say so rather than guess or imply it could look something up.
 *
 * Deliberately NOT sent: the report's per-order `detail` array. That's raw
 * order-level data; the contract is "reason over computed aggregates, not raw
 * orders." loss_leaders (a small curated slice of worst-margin orders the
 * report already surfaces) is included because it's part of what's on screen.
 *
 * Unlike /insights (a one-shot structured-JSON summary → Haiku), this is a
 * conversational, analytical exchange, so it uses claude-sonnet-4-6 — the same
 * model the in-repo chat agent (app/api/agent/chat/route.ts) uses — and passes
 * the full turn history to Anthropic so follow-up questions keep context.
 */
import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createSupabaseServerClient } from '@/lib/supabase'

export const maxDuration = 60

// Guardrails on the incoming conversation.
const MAX_MESSAGES = 40
const MAX_CONTENT_CHARS = 4000

// ── Report data shape (aggregates only — no per-order detail) ────────────────

interface TierRow { method: string; orders: number; avg_charged: number; avg_paid: number; avg_margin: number; total_margin: number }
interface BucketRow { label: string; min: number; orders: number; pct_free: number; avg_order_value: number; avg_label_cost: number; avg_margin: number; total_margin: number }
interface LossLeader { order_number: string; method: string; charged: number; paid: number; gap: number; subtotal: number }
interface FreeShippingThreshold { detected: boolean; subtotal_min: number | null; bucket_label: string | null; pct_free_at_threshold: number | null }

interface ReportData {
  range: { start: string; end: string }
  coverage: { total_paid_orders: number; shipped_orders: number; pos_orders: number; matched_orders: number; unmatched_shipped: number; match_rate: number }
  summary: { shipping_collected: number; shipping_paid: number; net_margin: number; margin_pct: number | null; orders: number }
  by_tier: TierRow[]
  by_bucket: BucketRow[]
  free_shipping_threshold: FreeShippingThreshold
  free_shipping: { orders: number; carrier_cost: number }
  cancelled_with_label: { orders: number; carrier_cost: number }
  loss_leaders: LossLeader[]
}

interface ChatMessage { role: 'user' | 'assistant'; content: string }

interface ChatRequestBody {
  report: ReportData
  messages: ChatMessage[]
}

function isReportData(r: unknown): r is ReportData {
  if (!r || typeof r !== 'object') return false
  const b = r as Record<string, unknown>
  return (
    !!b.range && !!b.coverage && !!b.summary &&
    Array.isArray(b.by_tier) && Array.isArray(b.by_bucket) &&
    !!b.free_shipping_threshold && !!b.free_shipping &&
    !!b.cancelled_with_label && Array.isArray(b.loss_leaders)
  )
}

function isValidMessages(m: unknown): m is ChatMessage[] {
  if (!Array.isArray(m) || m.length === 0 || m.length > MAX_MESSAGES) return false
  return m.every(
    (x) =>
      x && typeof x === 'object' &&
      (x.role === 'user' || x.role === 'assistant') &&
      typeof x.content === 'string' &&
      x.content.trim().length > 0 &&
      x.content.length <= MAX_CONTENT_CHARS
  )
}

const usd = (n: number) => `$${n.toFixed(2)}`
const pct = (n: number | null) => (n == null ? 'n/a' : `${(n * 100).toFixed(1)}%`)

function buildSystemPrompt(report: ReportData): string {
  const { range, coverage, summary, by_tier, by_bucket, free_shipping_threshold, free_shipping, cancelled_with_label, loss_leaders } = report

  const tierLines = by_tier
    .map((t) => `- "${t.method}" | ${t.orders} orders | avg charged ${usd(t.avg_charged)} | avg carrier cost ${usd(t.avg_paid)} | avg margin ${usd(t.avg_margin)} | total margin ${usd(t.total_margin)}`)
    .join('\n')

  const bucketLines = by_bucket
    .map((b) => `- ${b.label} subtotal | ${b.orders} orders | avg order value ${usd(b.avg_order_value)} | ${pct(b.pct_free)} free shipping | avg carrier cost ${usd(b.avg_label_cost)} | avg margin ${usd(b.avg_margin)} | total margin ${usd(b.total_margin)}`)
    .join('\n')

  const thresholdLine = free_shipping_threshold.detected
    ? `Detected: free shipping steps up to the norm (${pct(free_shipping_threshold.pct_free_at_threshold)} of orders) at the "${free_shipping_threshold.bucket_label}" bucket (order subtotal >= $${free_shipping_threshold.subtotal_min}), corroborated by those free orders riding a "Free Shipping"-named tier rather than a discount code.`
    : 'Not detected: no order-value bucket shows a clear step up into free shipping being the norm corroborated by a "Free Shipping"-named tier. Free shipping in this data does not clearly track a single order-value threshold.'

  const lossLines = loss_leaders
    .slice(0, 15)
    .map((l) => `- #${l.order_number} | ${l.method} | subtotal ${usd(l.subtotal)} | charged ${usd(l.charged)} | carrier cost ${usd(l.paid)} | lost ${usd(l.gap)}`)
    .join('\n')

  return `You are a shipping and logistics analyst helping the LashBox LA team understand a shipping-margin report through a back-and-forth conversation. LashBox LA is a professional lash-supply retail brand. The report covers ${range.start} to ${range.end}. All shipping costs here are CARRIER LABEL COST ONLY (label + insurance) — never boxes, packing materials, or labor.

STRICT GROUNDING RULES — follow these on every answer:
- Answer ONLY from the computed report figures provided below. This is the complete set of data you have.
- You MAY do arithmetic and comparison on these numbers (rank tiers, sum buckets, compare margins, weigh the cost of free shipping against AOV, etc.), but you must NEVER invent or estimate a figure that isn't derivable from what's here — no made-up carrier rates, competitor benchmarks, seasonality, or order-level data beyond the loss leaders listed.
- If a question cannot be answered from this data, say so plainly and name what additional data would be needed. Do NOT guess, and do NOT imply you can look anything up or run a query — you cannot; you only have the numbers below.
- Be concise and specific. Cite the actual numbers you're reasoning from so the team can check your answer against the tables on screen.
- These are decision-support answers for a human, not directives. When the data is genuinely inconclusive, say so rather than forcing a recommendation.

=== REPORT DATA (${range.start} to ${range.end}) ===

OVERALL SUMMARY:
- Shipping collected from customers: ${usd(summary.shipping_collected)}
- Paid to carriers (label + insurance): ${usd(summary.shipping_paid)}
- Net shipping margin: ${usd(summary.net_margin)} (${pct(summary.margin_pct)} of collected)
- Matched orders analyzed: ${summary.orders}

COVERAGE (how much of shipping activity this report captures):
- Total paid orders: ${coverage.total_paid_orders} | Shipped (non-POS): ${coverage.shipped_orders} | In-store pickup (POS): ${coverage.pos_orders}
- Matched to a shipping label: ${coverage.matched_orders} | Unmatched shipped: ${coverage.unmatched_shipped} | Match rate: ${pct(coverage.match_rate)}
- Figures below cover matched orders only.

MARGIN BY SHIPPING TIER (the shipping method the customer selected at checkout):
${tierLines || 'No tier data'}

MARGIN BY ORDER-VALUE BUCKET (bucketed on order subtotal, before shipping and tax):
${bucketLines || 'No bucket data'}

FREE-SHIPPING THRESHOLD DETECTION:
${thresholdLine}
- Total carrier cost of ALL free-shipping orders in range: ${usd(free_shipping.carrier_cost)} across ${free_shipping.orders} orders.

CANCELLED-AFTER-LABEL (real carrier cost, zero revenue — excluded from the margin figures above):
- ${cancelled_with_label.orders} cancelled orders had a paid label, costing ${usd(cancelled_with_label.carrier_cost)} in carrier cost with no offsetting revenue.

BIGGEST SHIPPING LOSSES (individual orders where carrier cost most exceeded what the customer was charged; this is the complete loss-leader list the report surfaces):
${lossLines || 'No loss-leader orders in this range'}

=== END REPORT DATA ===`
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as ChatRequestBody | null
  if (!body || !isReportData(body.report)) {
    return Response.json({ error: 'Missing or malformed report data in request body' }, { status: 400 })
  }
  if (!isValidMessages(body.messages)) {
    return Response.json({ error: 'Missing or malformed messages in request body' }, { status: 400 })
  }
  if (body.messages[body.messages.length - 1].role !== 'user') {
    return Response.json({ error: 'The last message must be from the user' }, { status: 400 })
  }
  if (body.report.summary.orders === 0) {
    return Response.json({ error: 'No matched orders in this range — nothing to analyze' }, { status: 400 })
  }

  const system = buildSystemPrompt(body.report)
  const messages = body.messages.map((m) => ({ role: m.role, content: m.content }))

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system,
      messages,
    })
    const answer = message.content[0]?.type === 'text' ? message.content[0].text.trim() : ''
    if (!answer) return Response.json({ error: 'The model returned an empty answer' }, { status: 502 })
    return Response.json({ answer })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 })
  }
}
