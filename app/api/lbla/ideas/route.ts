import { NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase'

// Requires a signed-in user; /lbla + /api/lbla are gated behind Supabase login in proxy.ts (LBLA team tool)
// NO AI CALLS — ideas are generated from store data only

export const maxDuration = 300

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

// ── DB row types ──────────────────────────────────────────────────────────────

interface ProductStatRow {
  product_title: string
  revenue_90d: number
  revenue_30d: number
  total_revenue: number
  repeat_purchase_rate: number
  avg_days_to_repurchase: number
  subscription_conversion_rate: number
  is_subscribable: boolean
}

interface AffinityRow {
  product_a: string
  product_b: string
  co_purchase_rate: number
  lift: number
}

interface KlaviyoCampaign {
  name: string | null
  subject: string | null
  send_time: string | null
  open_rate: number | null
  click_rate: number | null
  revenue_attributed: number | null
}

interface OverlapRow {
  total_customers: number
  segment_counts: Record<string, number> | null
  ltv_stats: Record<string, { count: number; totalRevenue: number }> | null
}

interface RechargeRow {
  active_subscribers: number | null
  mrr: number | null
  churn_rate_30d: number | null
  interval_breakdown: Record<string, { count: number; mrr: number; pct: number }> | null
}

// ── Aggregated product type ───────────────────────────────────────────────────

interface ProductAgg {
  product_title: string
  revenue_90d: number
  revenue_30d: number
  total_revenue: number
  repeat_purchase_rate: number
  avg_days_to_repurchase: number
  subscription_conversion_rate: number
  is_subscribable: boolean
}

// ── Public API types ──────────────────────────────────────────────────────────

export interface IdeaItem {
  id: string
  category: 'restock' | 'subscription_upsell' | 'bundle' | 'winback' | 'declining' | 'churn_risk' | 'followup'
  title: string
  description: string
  why_now: string
  opportunity_score: number
  suggested_channel: 'Email' | 'SMS' | 'Push' | 'All'
  suggested_audience: string
  suggested_angle: 'Educational' | 'Promotional' | 'Launch Hype' | 'Urgency'
  suggested_content_type: 'Product' | 'Collection' | 'Promotion' | 'Educational'
  product_focus?: string
  prefill: {
    channel: string
    contentType: string
    productFocus?: string
    audience: string
    tone: string
    customAudienceDetail?: string
    promotionDetails?: string
    whatShouldClaudeKnow?: string
  }
}

interface IdeaCandidate extends IdeaItem {
  raw_score: number
}

export interface IdeasResponse {
  ideas: IdeaItem[]
  whats_working: {
    campaign_name: string
    send_date: string
    open_rate: number
    revenue_attributed: number
  }[]
  data_snapshot: {
    total_customers: number
    lapsed_count: number
    active_subscribers: number
    mrr: number
    churn_rate: number
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function aggregateProducts(rows: ProductStatRow[]): ProductAgg[] {
  const map = new Map<string, ProductAgg>()
  for (const row of rows) {
    const existing = map.get(row.product_title)
    if (existing) {
      existing.revenue_90d += Number(row.revenue_90d)
      existing.revenue_30d += Number(row.revenue_30d)
      existing.total_revenue += Number(row.total_revenue)
      // Take the max rate across variants — if any variant is high-repeat, the product is
      existing.repeat_purchase_rate = Math.max(existing.repeat_purchase_rate, Number(row.repeat_purchase_rate))
      existing.subscription_conversion_rate = Math.max(existing.subscription_conversion_rate, Number(row.subscription_conversion_rate))
      existing.is_subscribable = existing.is_subscribable || row.is_subscribable
      // Average avg_days_to_repurchase
      existing.avg_days_to_repurchase =
        existing.avg_days_to_repurchase > 0 && Number(row.avg_days_to_repurchase) > 0
          ? (existing.avg_days_to_repurchase + Number(row.avg_days_to_repurchase)) / 2
          : Math.max(existing.avg_days_to_repurchase, Number(row.avg_days_to_repurchase))
    } else {
      map.set(row.product_title, {
        product_title: row.product_title,
        revenue_90d: Number(row.revenue_90d),
        revenue_30d: Number(row.revenue_30d),
        total_revenue: Number(row.total_revenue),
        repeat_purchase_rate: Number(row.repeat_purchase_rate),
        avg_days_to_repurchase: Number(row.avg_days_to_repurchase),
        subscription_conversion_rate: Number(row.subscription_conversion_rate),
        is_subscribable: row.is_subscribable,
      })
    }
  }
  return Array.from(map.values())
}

function daysSinceProductCampaign(
  productTitle: string,
  campaigns: KlaviyoCampaign[],
): number | null {
  const needle = productTitle.slice(0, 25).toLowerCase()
  const now = Date.now()
  const matches = campaigns
    .filter(
      (c) =>
        c.send_time != null &&
        (c.name?.toLowerCase().includes(needle) || c.subject?.toLowerCase().includes(needle)),
    )
    .map((c) => Math.round((now - new Date(c.send_time!).getTime()) / 86_400_000))
    .sort((a, b) => a - b)
  return matches.length > 0 ? matches[0] : null
}

function normalizeScores(ideas: IdeaCandidate[]): void {
  if (!ideas.length) return
  // Use log1p to compress large outlier values so scores spread more evenly
  const logs = ideas.map((i) => Math.log1p(Math.max(0, i.raw_score)))
  const min = Math.min(...logs)
  const max = Math.max(...logs)
  ideas.forEach((idea, idx) => {
    if (max === min) {
      idea.opportunity_score = 70
    } else {
      idea.opportunity_score = Math.round(30 + ((logs[idx] - min) / (max - min)) * 70)
    }
  })
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function GET() {
  const service = createSupabaseServiceClient()

  // ── Parallel DB queries ────────────────────────────────────────────────────
  const [
    { data: productRows },
    { data: affinityRows },
    { data: campaignRows },
    { data: overlapRow },
    { data: rechargeRow },
  ] = await Promise.all([
    service
      .from('product_stats')
      .select(
        'product_title, revenue_90d, revenue_30d, total_revenue, repeat_purchase_rate, avg_days_to_repurchase, subscription_conversion_rate, is_subscribable',
      )
      .eq('tenant_id', TENANT_ID)
      .gt('revenue_90d', 0),

    service
      .from('product_affinities')
      .select('product_a, product_b, co_purchase_rate, lift')
      .eq('tenant_id', TENANT_ID)
      .order('lift', { ascending: false })
      .limit(10),

    service
      .from('klaviyo_campaigns')
      .select('name, subject, send_time, open_rate, click_rate, revenue_attributed')
      .eq('tenant_id', TENANT_ID)
      .not('send_time', 'is', null)
      .order('send_time', { ascending: false })
      .limit(30),

    service
      .from('customer_overlap_cache')
      .select('total_customers, segment_counts, ltv_stats')
      .eq('tenant_id', TENANT_ID)
      .single(),

    service
      .from('recharge_metrics_cache')
      .select('active_subscribers, mrr, churn_rate_30d, interval_breakdown')
      .eq('tenant_id', TENANT_ID)
      .single(),
  ])

  const products = aggregateProducts((productRows ?? []) as ProductStatRow[])
  const affinities = (affinityRows ?? []) as AffinityRow[]
  const campaigns = (campaignRows ?? []) as KlaviyoCampaign[]
  const overlap = (overlapRow ?? null) as OverlapRow | null
  const recharge = (rechargeRow ?? null) as RechargeRow | null

  // Build a product map for fast lookups in bundle scoring
  const productMap = new Map<string, ProductAgg>()
  products.forEach((p) => productMap.set(p.product_title, p))

  const now = Date.now()
  const sixtyDaysAgo = now - 60 * 24 * 60 * 60 * 1000

  const candidates: IdeaCandidate[] = []

  // ── Category 1: Restock reminders ─────────────────────────────────────────
  {
    const restockPool: IdeaCandidate[] = []
    for (const product of products) {
      if (product.repeat_purchase_rate < 0.30 || product.avg_days_to_repurchase <= 0) continue

      const daysSince = daysSinceProductCampaign(product.product_title, campaigns)
      // Skip if we sent a relevant campaign more recently than the reorder interval
      if (daysSince !== null && daysSince < product.avg_days_to_repurchase) continue

      const repeatPct = Math.round(product.repeat_purchase_rate * 100)
      const avgDays = Math.round(product.avg_days_to_repurchase)
      const whyNow = daysSince != null
        ? `${repeatPct}% of buyers reorder every ~${avgDays} days — last relevant campaign was ${daysSince} days ago`
        : `${repeatPct}% of buyers reorder every ~${avgDays} days — no recent campaign found for this product`

      restockPool.push({
        id: `restock-${restockPool.length}`,
        category: 'restock',
        title: `Restock reminder: ${product.product_title}`,
        description: `${repeatPct}% of buyers reorder this product on a predictable cycle. A timely reminder drives repeat revenue with minimal effort.`,
        why_now: whyNow,
        raw_score: product.repeat_purchase_rate * product.revenue_90d,
        opportunity_score: 0,
        suggested_channel: 'Email',
        suggested_audience: 'active-customers',
        suggested_angle: avgDays < 45 ? 'Urgency' : 'Educational',
        suggested_content_type: 'Product',
        product_focus: product.product_title,
        prefill: {
          channel: 'email',
          contentType: 'product',
          productFocus: product.product_title,
          audience: 'active-customers',
          tone: avgDays < 45 ? 'Urgency' : 'Educational',
          whatShouldClaudeKnow: `This is a friendly restock reminder. Do NOT mention specific days, intervals, data points, or statistics in the copy — these feel cold and transactional. Instead write as a knowledgeable peer reminding them why this product belongs in their regular rotation. Focus on 2-3 specific product benefits that matter to working artists, and make it easy to act. Warm and confident, not pushy.`,
        },
      })
    }
    restockPool.sort((a, b) => b.raw_score - a.raw_score)
    candidates.push(...restockPool.slice(0, 5))
  }

  // ── Category 2: Subscription upsell ───────────────────────────────────────
  {
    const subPool: IdeaCandidate[] = []
    for (const product of products) {
      if (!product.is_subscribable || product.subscription_conversion_rate <= 0) continue
      if (product.repeat_purchase_rate < 0.20) continue
      if (product.subscription_conversion_rate >= 0.30) continue

      const gap = product.repeat_purchase_rate - product.subscription_conversion_rate
      if (gap < 0.10) continue

      const repeatPct = Math.round(product.repeat_purchase_rate * 100)
      const subPct = Math.round(product.subscription_conversion_rate * 100)
      const gapPct = Math.round(gap * 100)

      subPool.push({
        id: `subscription_upsell-${subPool.length}`,
        category: 'subscription_upsell',
        title: `Subscription upsell: ${product.product_title}`,
        description: `${repeatPct}% of buyers reorder this product but only ${subPct}% subscribe. Converting even a fraction drives predictable MRR.`,
        why_now: `${repeatPct}% of buyers reorder this product but only ${subPct}% have subscribed — ${gapPct}% gap is untapped subscription revenue`,
        raw_score: gap * product.revenue_90d,
        opportunity_score: 0,
        suggested_channel: 'Email',
        suggested_audience: 'active-customers',
        suggested_angle: 'Promotional',
        suggested_content_type: 'Product',
        product_focus: product.product_title,
        prefill: {
          channel: 'email',
          contentType: 'product',
          productFocus: product.product_title,
          audience: 'active-customers',
          tone: 'Promotional',
          whatShouldClaudeKnow: `${repeatPct}% of buyers reorder this product but only ${subPct}% are subscribers. The goal is to convert regular reorders to subscriptions. Emphasize convenience, reliability, and never running out. A small discount or perk for subscribing can help.`,
        },
      })
    }
    subPool.sort((a, b) => b.raw_score - a.raw_score)
    candidates.push(...subPool.slice(0, 3))
  }

  // ── Category 3: Bundle opportunities ──────────────────────────────────────
  {
    let bundleCount = 0
    for (const aff of affinities) {
      if (bundleCount >= 3) break
      if (aff.co_purchase_rate < 0.20 || aff.lift < 1.5) continue

      const productA = productMap.get(aff.product_a)
      const productB = productMap.get(aff.product_b)
      const combinedRevenue = (productA?.revenue_90d ?? 0) + (productB?.revenue_90d ?? 0)
      const coPct = Math.round(aff.co_purchase_rate * 100)

      candidates.push({
        id: `bundle-${bundleCount}`,
        category: 'bundle',
        title: `Bundle opportunity: ${aff.product_a} + ${aff.product_b}`,
        description: `These two products are purchased together more than expected. A cross-sell or bundle campaign increases average order value with no new audience needed.`,
        why_now: `${coPct}% of customers who buy ${aff.product_a} also buy ${aff.product_b} (${aff.lift.toFixed(1)}x lift above random chance)`,
        raw_score: aff.lift * combinedRevenue,
        opportunity_score: 0,
        suggested_channel: 'Email',
        suggested_audience: 'general-audience',
        suggested_angle: 'Promotional',
        suggested_content_type: 'Product',
        product_focus: aff.product_a,
        prefill: {
          channel: 'email',
          contentType: 'product',
          productFocus: aff.product_a,
          audience: 'general-audience',
          tone: 'Promotional',
          whatShouldClaudeKnow: `${coPct}% of customers who buy this product also buy ${aff.product_b} — ${aff.lift.toFixed(1)}x more often than chance. Mention ${aff.product_b} as a natural complement, pairing, or bundle. The cross-sell angle should feel like a recommendation, not a sales pitch.`,
        },
      })
      bundleCount++
    }
  }

  // ── Category 4: Lapsed customer win-back ──────────────────────────────────
  {
    const lapsedCount =
      (overlap?.segment_counts?.['Lapsed'] ?? 0) +
      (overlap?.segment_counts?.['At Risk'] ?? 0)

    if (lapsedCount > 1000) {
      const bronzeData = overlap?.ltv_stats?.['Bronze']
      const avgBronzeLtv = bronzeData && bronzeData.count > 0
        ? Math.round(bronzeData.totalRevenue / bronzeData.count)
        : 150

      const potentialValue = Math.round(lapsedCount * avgBronzeLtv * 0.05)

      candidates.push({
        id: 'winback-0',
        category: 'winback',
        title: 'Lapsed customer win-back',
        description: `${lapsedCount.toLocaleString()} customers haven't ordered in 90+ days. A targeted re-engagement campaign can recover meaningful revenue without paid acquisition.`,
        why_now: `${lapsedCount.toLocaleString()} customers haven't ordered in 90+ days — potential recovery value of ~$${potentialValue.toLocaleString()} at a 5% reactivation rate`,
        raw_score: lapsedCount * avgBronzeLtv,
        opportunity_score: 0,
        suggested_channel: 'Email',
        suggested_audience: 'lapsed-customers',
        suggested_angle: 'Urgency',
        suggested_content_type: 'Product',
        prefill: {
          channel: 'email',
          contentType: 'product',
          audience: 'lapsed-customers',
          tone: 'Urgency',
          whatShouldClaudeKnow: `This email targets ${lapsedCount.toLocaleString()} customers who haven't ordered in 90+ days. Lead with the product, not guilt. Give them a compelling reason to return — something new, something they're missing, or a genuine value. Avoid sounding desperate.`,
        },
      })
    }
  }

  // ── Category 5: Declining product revenue ─────────────────────────────────
  {
    const decliningPool: IdeaCandidate[] = []
    for (const product of products) {
      if (product.total_revenue < 5_000) continue
      if (product.revenue_30d <= 0 || product.revenue_90d <= 0) continue

      const expected30d = product.revenue_90d / 3 // 90d average monthly pace
      if (expected30d <= 0) continue
      const declineFactor = 1 - product.revenue_30d / expected30d
      if (declineFactor < 0.40) continue // only flag if last 30d is < 60% of expected

      decliningPool.push({
        id: `declining-${decliningPool.length}`,
        category: 'declining',
        title: `Revive momentum: ${product.product_title}`,
        description: `Revenue dropped significantly in the last 30 days. A targeted campaign could recover momentum before the decline compounds.`,
        why_now: `Last 30 days: $${Math.round(product.revenue_30d).toLocaleString()} — ${Math.round(declineFactor * 100)}% below the prior 90-day pace of ~$${Math.round(expected30d).toLocaleString()}/month`,
        raw_score: product.total_revenue * declineFactor,
        opportunity_score: 0,
        suggested_channel: 'Email',
        suggested_audience: 'active-customers',
        suggested_angle: 'Promotional',
        suggested_content_type: 'Product',
        product_focus: product.product_title,
        prefill: {
          channel: 'email',
          contentType: 'product',
          productFocus: product.product_title,
          audience: 'active-customers',
          tone: 'Promotional',
          whatShouldClaudeKnow: `Revenue on this product declined ${Math.round(declineFactor * 100)}% last month vs. the 90-day average. A campaign could reverse this trend. Consider a promotional angle, a feature many buyers don't know about, or framing a new use case.`,
        },
      })
    }
    decliningPool.sort((a, b) => b.raw_score - a.raw_score)
    candidates.push(...decliningPool.slice(0, 3))
  }

  // ── Category 6: Subscription churn risk ───────────────────────────────────
  {
    const churnRate = Number(recharge?.churn_rate_30d ?? 0)
    const mrr = Number(recharge?.mrr ?? 0)

    if (churnRate > 0.05 && mrr > 0) {
      const mrrAtRisk = Math.round(mrr * churnRate)
      const churnPct = Math.round(churnRate * 100)
      const activeSubs = Number(recharge?.active_subscribers ?? 0)

      candidates.push({
        id: 'churn_risk-0',
        category: 'churn_risk',
        title: 'Subscriber retention campaign',
        description: `Churn is elevated this month. A value-reinforcing email to subscribers can reduce cancellations without discounting.`,
        why_now: `${churnPct}% subscriber churn rate this month — $${mrrAtRisk.toLocaleString()} MRR at risk (${Math.round(churnRate * activeSubs)} subscribers)`,
        raw_score: churnRate * mrr,
        opportunity_score: 0,
        suggested_channel: 'Email',
        suggested_audience: 'active-customers',
        suggested_angle: 'Educational',
        suggested_content_type: 'Educational',
        prefill: {
          channel: 'email',
          contentType: 'educational',
          audience: 'active-customers',
          tone: 'Educational',
          customAudienceDetail: 'Active subscribers — remind them why staying subscribed is worth it',
          whatShouldClaudeKnow: `Subscriber churn is ${churnPct}% this month, putting $${mrrAtRisk.toLocaleString()} MRR at risk. This email should reinforce the value of the subscription — convenience, savings, never running out of product mid-appointment. Do not make it sound like a retention play. Make it feel like a genuine value reminder from a brand that cares about their business.`,
        },
      })
    }
  }

  // ── Category 7: High performer follow-up ──────────────────────────────────
  {
    const recentCampaigns = campaigns.filter(
      (c) => c.send_time != null && new Date(c.send_time).getTime() > sixtyDaysAgo,
    )
    if (recentCampaigns.length > 0) {
      const best = recentCampaigns.reduce((b, c) =>
        Number(c.open_rate ?? 0) > Number(b.open_rate ?? 0) ? c : b,
      )
      const openPct = Math.round(Number(best.open_rate ?? 0) * 100)
      const sendDate = best.send_time
        ? new Date(best.send_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : 'recently'

      candidates.push({
        id: 'followup-0',
        category: 'followup',
        title: `Follow-up: "${best.name ?? 'Top Campaign'}"`,
        description: `Your highest-performing recent campaign. A follow-up that builds on the same angle captures the audience that didn't convert the first time.`,
        why_now: `"${best.name ?? 'This campaign'}" got ${openPct}% open rate on ${sendDate} — your audience is engaged on this topic`,
        raw_score: Number(best.open_rate ?? 0) * 10_000,
        opportunity_score: 0,
        suggested_channel: 'Email',
        suggested_audience: 'general-audience',
        suggested_angle: 'Educational',
        suggested_content_type: 'Product',
        prefill: {
          channel: 'email',
          contentType: 'product',
          audience: 'general-audience',
          tone: 'Educational',
          whatShouldClaudeKnow: `This is a follow-up to "${best.name ?? 'a recent campaign'}" which got ${openPct}% open rate on ${sendDate}. Build on the same topic or angle but find a fresh approach. Do not repeat the same subject line hook. Aim at people who opened but didn't convert, or who missed the first send.`,
        },
      })
    }
  }

  // ── Score + rank + deduplicate ─────────────────────────────────────────────

  normalizeScores(candidates)
  candidates.sort((a, b) => b.opportunity_score - a.opportunity_score)

  const seenProducts = new Set<string>()
  const finalIdeas: IdeaItem[] = []

  for (const idea of candidates) {
    if (idea.product_focus) {
      if (seenProducts.has(idea.product_focus)) continue
      seenProducts.add(idea.product_focus)
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { raw_score: _raw, ...publicIdea } = idea
    finalIdeas.push(publicIdea)
    if (finalIdeas.length >= 12) break
  }

  // ── What's working ─────────────────────────────────────────────────────────

  const whatsWorking = campaigns
    .filter((c) => c.send_time != null && new Date(c.send_time).getTime() > sixtyDaysAgo && c.open_rate != null)
    .sort((a, b) => Number(b.open_rate ?? 0) - Number(a.open_rate ?? 0))
    .slice(0, 3)
    .map((c) => ({
      campaign_name: c.name ?? 'Unnamed Campaign',
      send_date: c.send_time ?? '',
      open_rate: Number(c.open_rate ?? 0),
      revenue_attributed: Number(c.revenue_attributed ?? 0),
    }))

  // ── Data snapshot ──────────────────────────────────────────────────────────

  const lapsedCount =
    (overlap?.segment_counts?.['Lapsed'] ?? 0) +
    (overlap?.segment_counts?.['At Risk'] ?? 0)

  const dataSnapshot = {
    total_customers: overlap?.total_customers ?? 0,
    lapsed_count: lapsedCount,
    active_subscribers: Number(recharge?.active_subscribers ?? 0),
    mrr: Number(recharge?.mrr ?? 0),
    churn_rate: Number(recharge?.churn_rate_30d ?? 0),
  }

  return NextResponse.json({
    ideas: finalIdeas,
    whats_working: whatsWorking,
    data_snapshot: dataSnapshot,
  } satisfies IdeasResponse)
}
