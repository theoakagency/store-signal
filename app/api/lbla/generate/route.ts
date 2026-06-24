import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createSupabaseServiceClient } from '@/lib/supabase'

// Public endpoint — no user auth required (LBLA team tool)
// Does NOT save generations to the authed content_generations table;
// saves to lbla_generation_log instead.

export const maxDuration = 60

const STORE_ID  = '00000000-0000-0000-0000-000000000002'
const TENANT_ID = '00000000-0000-0000-0000-000000000001'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ShopifyVariant {
  title: string
  price: string
}

interface ShopifyProductData {
  title: string
  body_html: string
  variants: ShopifyVariant[]
  tags: string
  product_type: string
}

interface StyleRuleRow {
  category: string
  rule: string
}

interface TopProductRow {
  product_title: string
  total_revenue: number
}

interface StoreRow {
  shopify_domain: string | null
  shopify_access_token: string | null
}

interface KlaviyoCampaignRow {
  name: string | null
  subject: string | null
  send_time: string | null
  open_rate: number | null
}

interface CustomerOverlapRow {
  total_customers: number
  segment_counts: Record<string, number> | null
  ltv_stats: Record<string, { count: number; totalRevenue: number }> | null
}

interface RechargeMetricsRow {
  active_subscribers: number | null
  mrr: number | null
  avg_subscription_value: number | null
  interval_breakdown: Record<string, { count: number; mrr: number; pct: number }> | null
}

interface ProductStatRow {
  revenue_90d: number
  total_quantity_sold: number
  repeat_purchase_rate: number
  avg_days_to_repurchase: number
  subscription_conversion_rate: number
  is_subscribable: boolean
}

interface AffinityRow {
  product_b: string
  co_purchase_rate: number
  lift: number
}

// ── Audience map (hardcoded descriptions) ─────────────────────────────────────

const AUDIENCE_MAP: Record<string, string> = {
  'all-lash-artists':         'Broad audience of working lash artists. Assume professional, licensed, and actively seeing clients. Write for someone who knows their craft.',
  'new-lash-artists':         'Artists in their first 1-2 years. Still building confidence, clientele, and systems. Respond to reassurance, education, and community. May be price-conscious.',
  'established-lash-artists': 'Experienced artists with a full book. Value efficiency, consistency, and quality over price. They know what works and why.',
  'volume-specialists':       'Speed-focused artists doing 3+ clients per day. Care deeply about set time, retention, and consistency across long days. Every second counts.',
  'lash-lift-specialists':    'Artists offering or actively considering lash lift services. Care about technique, chemical safety, client results, and differentiating their menu.',
  'salon-owners':             'Managing a team of artists. Think in terms of staff training, bulk purchasing, margin, and standardizing products across their business.',
  'students':                 'Pre-licensed or recently licensed. Not yet making professional purchases at scale. Respond to education, inspiration, and brand familiarity.',
  'lapsed-customers':         'Have not ordered in 90+ days. May have switched suppliers or gone quiet. Need a reason to return -- relevance, value, or something new.',
  'subscribers':              'Active Recharge subscribers. Already committed to the brand. Reward loyalty, offer exclusives, and reinforce the value of staying subscribed.',
}

// ── Section 1: Shopify product fetch ─────────────────────────────────────────

async function fetchShopifyProduct(
  storeRow: StoreRow | null,
  productFocus: string,
): Promise<ShopifyProductData | null> {
  if (!storeRow?.shopify_domain || !storeRow?.shopify_access_token) return null

  const match = productFocus.match(/\/products\/([^/?#]+)/)
  if (!match) return null
  const handle = match[1]

  try {
    const res = await fetch(
      `https://${storeRow.shopify_domain}/admin/api/2024-10/products.json?handle=${handle}&fields=title,body_html,variants,tags,product_type`,
      {
        headers: { 'X-Shopify-Access-Token': storeRow.shopify_access_token },
        signal: AbortSignal.timeout(5000),
      },
    )
    if (!res.ok) return null
    const data = await res.json() as { products?: ShopifyProductData[] }
    return data.products?.[0] ?? null
  } catch {
    return null
  }
}

function buildShopifyBlock(product: ShopifyProductData): string {
  const desc = product.body_html
    ?.replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300) || ''

  const variantStr = (product.variants ?? [])
    .map((v) => `${v.title}${v.price ? ` ($${v.price})` : ''}`)
    .filter((t) => !t.startsWith('Default Title'))
    .slice(0, 8)
    .join(', ')

  const lines = [
    `PRODUCT DETAILS (live from Shopify):`,
    `- Title: ${product.title}`,
    desc ? `- Description: ${desc}` : '',
    variantStr ? `- Variants: ${variantStr}` : '',
    product.tags ? `- Tags: ${product.tags}` : '',
    product.product_type ? `- Product type: ${product.product_type}` : '',
  ].filter(Boolean)

  return lines.join('\n')
}

// ── Section 2: Klaviyo campaign history ───────────────────────────────────────

function buildCampaignsBlock(campaigns: KlaviyoCampaignRow[]): string {
  if (!campaigns.length) return ''
  const lines = campaigns.map((c) => {
    const date = c.send_time
      ? new Date(c.send_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : 'unknown date'
    const rate = c.open_rate != null ? ` — open rate: ${(Number(c.open_rate) * 100).toFixed(1)}%` : ''
    return `- "${c.name ?? 'Unnamed'}" sent ${date}${rate}`
  })
  return [
    'RECENT CAMPAIGNS (avoid repeating these angles):',
    ...lines,
    'IMPORTANT: Do not repeat subject line angles, hooks, or themes already used in these campaigns. Find a fresh angle.',
  ].join('\n')
}

// ── Section 3: Audience stats ─────────────────────────────────────────────────

function buildAudienceStatsBlock(
  persona: string,
  overlap: CustomerOverlapRow | null,
  recharge: RechargeMetricsRow | null,
): string {
  if (!overlap && !recharge) return ''

  const seg   = overlap?.segment_counts ?? {}
  const ltv   = overlap?.ltv_stats ?? {}
  const total = overlap?.total_customers ?? 0

  const lines: string[] = []

  const personaLabel: Record<string, string> = {
    'all-lash-artists':         'All Lash Artists',
    'new-lash-artists':         'New Lash Artists',
    'established-lash-artists': 'Established Lash Artists',
    'volume-specialists':       'Volume Specialists',
    'lash-lift-specialists':    'Lash Lift Specialists',
    'salon-owners':             'Salon Owners',
    'students':                 'Students / Pre-Licensed',
    'lapsed-customers':         'Lapsed Customers',
    'subscribers':              'Active Subscribers',
  }

  lines.push(`AUDIENCE DATA (${personaLabel[persona] ?? persona}):`)

  if (persona === 'all-lash-artists' || persona === 'volume-specialists' || persona === 'lash-lift-specialists' || persona === 'salon-owners') {
    if (total > 0) lines.push(`- Total customer base: ${total.toLocaleString()} customers`)
    const activeCount = (seg['VIP'] ?? 0) + (seg['Active'] ?? 0)
    if (activeCount > 0) lines.push(`- Active buyers: ${activeCount.toLocaleString()} (VIP + Active segments)`)
    if (ltv['Diamond']) {
      const d = ltv['Diamond']
      lines.push(`- Top-tier (Diamond) customers: ${d.count.toLocaleString()}, avg LTV $${Math.round(d.totalRevenue / Math.max(d.count, 1)).toLocaleString()}`)
    }

  } else if (persona === 'new-lash-artists' || persona === 'students') {
    const newCount = seg['New'] ?? 0
    if (newCount > 0) lines.push(`- New customers in base: ${newCount.toLocaleString()}`)
    if (total > 0) lines.push(`- New as % of total: ${Math.round((newCount / total) * 100)}%`)

  } else if (persona === 'established-lash-artists') {
    const vipCount = seg['VIP'] ?? 0
    const activeCount = seg['Active'] ?? 0
    if (vipCount > 0) lines.push(`- VIP customers: ${vipCount.toLocaleString()}`)
    if (activeCount > 0) lines.push(`- Active customers: ${activeCount.toLocaleString()}`)
    if (ltv['Gold']) {
      const g = ltv['Gold']
      lines.push(`- Gold-tier avg LTV: $${Math.round(g.totalRevenue / Math.max(g.count, 1)).toLocaleString()}`)
    }

  } else if (persona === 'lapsed-customers') {
    const lapsedCount = (seg['Lapsed'] ?? 0) + (seg['At Risk'] ?? 0)
    if (lapsedCount > 0) lines.push(`- Lapsed / At Risk customers: ${lapsedCount.toLocaleString()}`)
    if (total > 0 && lapsedCount > 0) lines.push(`- Share of base: ${Math.round((lapsedCount / total) * 100)}%`)
    lines.push('- These customers have not ordered in 90+ days and may have switched suppliers')

  } else if (persona === 'subscribers') {
    if (recharge?.active_subscribers != null) {
      lines.push(`- Active subscribers: ${Number(recharge.active_subscribers).toLocaleString()}`)
    }
    if (recharge?.mrr != null) {
      lines.push(`- Monthly recurring revenue: $${Number(recharge.mrr).toLocaleString()}`)
    }
    if (recharge?.avg_subscription_value != null) {
      lines.push(`- Avg subscription value: $${Number(recharge.avg_subscription_value).toFixed(2)}/month`)
    }
    if (recharge?.interval_breakdown) {
      const topInterval = Object.entries(recharge.interval_breakdown)
        .sort(([, a], [, b]) => b.count - a.count)[0]
      if (topInterval) {
        lines.push(`- Most common reorder interval: ${topInterval[0]} (${topInterval[1].pct}% of subscribers)`)
      }
    }
  }

  if (lines.length <= 1) return '' // Only had header, no real stats
  lines.push('Write content that speaks to this specific group\'s behavior and value to the business.')
  return lines.join('\n')
}

// ── Section 6: Product performance ───────────────────────────────────────────

function buildProductPerformanceBlock(
  stats: ProductStatRow[],
  affinity: AffinityRow | null,
): string {
  if (!stats.length) return ''

  // Aggregate across variants
  const agg = stats.reduce(
    (acc, r) => ({
      revenue_90d:                   acc.revenue_90d + Number(r.revenue_90d),
      total_quantity_sold:           acc.total_quantity_sold + Number(r.total_quantity_sold),
      repeat_purchase_rate:          acc.repeat_purchase_rate + Number(r.repeat_purchase_rate),
      avg_days_to_repurchase:        acc.avg_days_to_repurchase + Number(r.avg_days_to_repurchase),
      subscription_conversion_rate:  acc.subscription_conversion_rate + Number(r.subscription_conversion_rate),
      is_subscribable:               acc.is_subscribable || r.is_subscribable,
    }),
    { revenue_90d: 0, total_quantity_sold: 0, repeat_purchase_rate: 0, avg_days_to_repurchase: 0, subscription_conversion_rate: 0, is_subscribable: false },
  )

  const n = stats.length
  const avgRepeatRate   = Math.round((agg.repeat_purchase_rate / n) * 100)
  const avgDays         = Math.round(agg.avg_days_to_repurchase / n)
  const avgSubRate      = Math.round((agg.subscription_conversion_rate / n) * 100)

  const lines: string[] = [
    'PRODUCT PERFORMANCE CONTEXT (from store data):',
    `- Revenue (90d): $${Math.round(agg.revenue_90d).toLocaleString()}`,
    `- Units sold (90d): ${agg.total_quantity_sold.toLocaleString()}`,
    `- Repeat purchase rate: ${avgRepeatRate}%`,
    avgDays > 0 ? `- Avg reorder interval: ${avgDays} days` : '',
    agg.is_subscribable ? `- Subscription conversion rate: ${avgSubRate}%` : '',
    affinity ? `- Top bought-with product: ${affinity.product_b} (${Math.round(affinity.co_purchase_rate * 100)}% co-purchase rate)` : '',
  ].filter(Boolean)

  lines.push('')
  lines.push('Use this data to write copy that reflects real buying behavior:')
  if (avgRepeatRate >= 30) lines.push('- High repeat rate: reference the restock/reorder habit and reliability')
  if (agg.is_subscribable && avgSubRate >= 5) lines.push(`- ${avgSubRate}% of buyers subscribe: mention the subscription option`)
  if (affinity) lines.push(`- Frequently bought with ${affinity.product_b}: consider mentioning as a complement or bundle`)

  return lines.join('\n')
}

// ── Section 3: Email format instructions ─────────────────────────────────────

function buildFormatBlock(fmt: string | null | undefined): string {
  if (fmt === 'structured') {
    return `EMAIL FORMAT: Structured
- Start with one short punchy header line inside the body (not the subject line)
- Follow with 1-2 short paragraphs of context
- Include a bulleted list of 3-5 specific product benefits, features, or steps -- each bullet max 20 words, specific not generic
- End with one clear CTA sentence
- Maximum 220 words total body
- Use **Header text** for the header line and - item for bullets in the body field so they render correctly`
  }
  if (fmt === 'short_punchy') {
    return `EMAIL FORMAT: Short & Punchy
- Two paragraphs maximum
- Under 100 words total body
- Get to the point in the first sentence -- no warm-up
- No headers, no bullets
- Every sentence earns its place -- cut anything that doesn't add meaning`
  }
  // conversational (default)
  return `EMAIL FORMAT: Conversational
- Flowing prose only -- no headers, no bullet points, no bold text
- 2-4 short paragraphs
- Maximum 180 words in the body
- Should read like a knowledgeable colleague writing directly to another artist
- No section breaks, no formatting symbols`
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    channel: 'email' | 'sms' | 'push'
    contentType?: string
    topic: string
    productFocus?: string | null
    audience?: string | null
    customAudience?: string | null
    tones?: string[]
    talkingPoints?: string | null
    emailFormat?: 'conversational' | 'structured' | 'short_punchy' | null
    // promotion-specific (passed through)
    offerType?: string | null
    discountAmount?: string | null
    promoCode?: string | null
    offerEndDate?: string | null
    offerDetails?: string | null
    // event-specific
    eventName?: string | null
    eventDate?: string | null
    eventUrl?: string | null
    // landing-page / collection
    landingPageUrl?: string | null
    collectionUrl?: string | null
  }

  const { channel, contentType, topic, productFocus, audience, customAudience, tones, talkingPoints, emailFormat } = body

  if (!channel || !topic) {
    return Response.json({ error: 'channel and topic are required' }, { status: 400 })
  }

  const service = createSupabaseServiceClient()

  // ── Phase 1: all Supabase queries in parallel ─────────────────────────────
  const isProductUrl = productFocus?.includes('lashboxla.com/products/') ?? false

  const [
    { data: styleRulesData },
    { data: topProductsData },
    { data: storeData },
    { data: campaignsData },
    { data: overlapData },
    { data: rechargeData },
  ] = await Promise.all([
    service
      .from('style_guide_rules')
      .select('category, rule')
      .eq('store_id', STORE_ID)
      .eq('active', true)
      .order('sort_order'),

    service
      .from('product_stats')
      .select('product_title, total_revenue')
      .eq('tenant_id', TENANT_ID)
      .order('total_revenue', { ascending: false })
      .limit(5),

    // Section 1: Shopify credentials
    (service
      .from('stores')
      .select('shopify_domain, shopify_access_token')
      .eq('id', STORE_ID)
      .single()) as unknown as Promise<{ data: StoreRow | null; error: unknown }>,

    // Section 2: Klaviyo campaigns — note: column is `name`, not `campaign_name`
    (service
      .from('klaviyo_campaigns')
      .select('name, subject, send_time, open_rate')
      .eq('tenant_id', TENANT_ID)
      .not('send_time', 'is', null)
      .order('send_time', { ascending: false })
      .limit(5)) as unknown as Promise<{ data: KlaviyoCampaignRow[] | null; error: unknown }>,

    // Section 3: Audience segment + LTV stats
    (service
      .from('customer_overlap_cache')
      .select('total_customers, segment_counts, ltv_stats')
      .eq('tenant_id', TENANT_ID)
      .single()) as unknown as Promise<{ data: CustomerOverlapRow | null; error: unknown }>,

    // Section 3: Recharge subscriber metrics
    (service
      .from('recharge_metrics_cache')
      .select('active_subscribers, mrr, avg_subscription_value, interval_breakdown')
      .eq('tenant_id', TENANT_ID)
      .single()) as unknown as Promise<{ data: RechargeMetricsRow | null; error: unknown }>,
  ])

  // ── Phase 2: Shopify API (conditional, sequential) ────────────────────────
  let shopifyProduct: ShopifyProductData | null = null
  let resolvedProductTitle: string | null = null

  if (productFocus) {
    if (isProductUrl) {
      shopifyProduct = await fetchShopifyProduct(storeData, productFocus)
      resolvedProductTitle = shopifyProduct?.title ?? null
    } else {
      resolvedProductTitle = productFocus
    }
  }

  // ── Phase 3: Product stats + affinity (if product known) ─────────────────
  let productStatsRows: ProductStatRow[] = []
  let topAffinity: AffinityRow | null = null

  if (resolvedProductTitle) {
    const [{ data: statsData }, { data: affinityData }] = await Promise.all([
      (service
        .from('product_stats')
        .select('revenue_90d, total_quantity_sold, repeat_purchase_rate, avg_days_to_repurchase, subscription_conversion_rate, is_subscribable')
        .eq('tenant_id', TENANT_ID)
        .ilike('product_title', `%${resolvedProductTitle.slice(0, 40)}%`)
        .limit(10)) as unknown as Promise<{ data: ProductStatRow[] | null; error: unknown }>,

      (service
        .from('product_affinities')
        .select('product_b, co_purchase_rate, lift')
        .eq('tenant_id', TENANT_ID)
        .ilike('product_a', `%${resolvedProductTitle.slice(0, 40)}%`)
        .order('lift', { ascending: false })
        .limit(1)) as unknown as Promise<{ data: AffinityRow[] | null; error: unknown }>,
    ])

    productStatsRows = statsData ?? []
    topAffinity = affinityData?.[0] ?? null
  }

  // ── Build prompt blocks ───────────────────────────────────────────────────

  // Style guide (existing)
  const rules        = (styleRulesData ?? []) as StyleRuleRow[]
  const avoidRules   = rules.filter((r) => r.category === 'avoid')
  const enforceRules = rules.filter((r) => r.category === 'enforce')
  const vocabRules   = rules.filter((r) => r.category === 'vocabulary')
  const exampleRules = rules.filter((r) => r.category === 'examples')

  const styleBlock = rules.length === 0 ? '' : [
    'STYLE RULES — FOLLOW STRICTLY:',
    avoidRules.length > 0   ? `Never do these:\n${avoidRules.map((r) => `- ${r.rule}`).join('\n')}`   : '',
    enforceRules.length > 0 ? `Always do these:\n${enforceRules.map((r) => `- ${r.rule}`).join('\n')}` : '',
    vocabRules.length > 0   ? `Vocabulary:\n${vocabRules.map((r) => `- ${r.rule}`).join('\n')}`        : '',
    exampleRules.length > 0 ? `Write in the style of these examples:\n${exampleRules.map((r) => `- ${r.rule}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n')

  // Top products (existing)
  const topProductLines = ((topProductsData ?? []) as TopProductRow[])
    .map((p) => `  - ${p.product_title}: $${Math.round(Number(p.total_revenue)).toLocaleString()} revenue`)
    .join('\n')

  // Section 1: Shopify product details
  const shopifyBlock = shopifyProduct ? buildShopifyBlock(shopifyProduct) : ''

  // Section 2: Klaviyo recent campaigns
  const campaignsBlock = buildCampaignsBlock((campaignsData ?? []) as KlaviyoCampaignRow[])

  // Section 3: Audience stats
  const audienceStatsBlock = buildAudienceStatsBlock(
    audience ?? 'all-lash-artists',
    (overlapData ?? null) as CustomerOverlapRow | null,
    (rechargeData ?? null) as RechargeMetricsRow | null,
  )

  // Section 6: Product performance
  const productPerfBlock = buildProductPerformanceBlock(productStatsRows, topAffinity)

  // Audience description (hardcoded + enhanced)
  const audienceGuidance = AUDIENCE_MAP[audience ?? ''] ?? AUDIENCE_MAP['all-lash-artists']

  // Content type context
  const ct = contentType ?? 'product'
  let contentContextBlock = ''
  if (productFocus?.trim()) {
    contentContextBlock = `FOCUS:\n- ${productFocus}`
  }
  if (ct === 'promotion') {
    contentContextBlock = `CONTENT TYPE: Promotion\n- Focus: ${productFocus || topic}`
  }

  // ── Assemble system prompt ────────────────────────────────────────────────

  const systemPrompt = [
    `You are the in-house copywriter for LashBox LA (lashboxla.com), a professional lash and lash lift supply company serving licensed lash artists and salon owners. You have deep knowledge of the lash industry.`,

    `TOP PRODUCTS FOR CONTEXT:\n${topProductLines || '  (no product data available)'}`,

    contentContextBlock || null,

    shopifyBlock || null,

    productPerfBlock || null,

    `BRAND VOICE:
- Educational and empowering -- teach, don't just sell
- Professional peer-to-peer -- artist to artist, not brand to consumer
- Never generic, never pushy. Specific over vague.
- Reference real concerns: client retention, technique results, restock timing, business growth
- Avoid: "game-changer", "elevate your business", "unlock your potential"
- Write like someone who understands what it means to be behind the bed managing 6+ clients a day`,

    `AUDIENCE CONTEXT:\n${audienceGuidance}${customAudience ? `\nAdditional specificity: ${customAudience}. Factor this into the tone and references used.` : ''}`,

    audienceStatsBlock || null,

    campaignsBlock || null,

    styleBlock || null,

    channel === 'email' ? buildFormatBlock(emailFormat) : null,

    `FORMATTING CONSTRAINTS -- APPLY TO EVERY FIELD INCLUDING SUBJECTS AND PREHEADERS:
- Never use em dashes (--) or en dashes (-) anywhere. Use a comma, period, or rewrite the clause instead.
- Never use more than one exclamation point across all three versions combined.
- Never use "game-changer", "elevate", "unlock", "revolutionary", "cutting-edge", or "state-of-the-art".`,

    `RESPONSE FORMAT: Return ONLY valid JSON, no markdown, no code fences, no preamble.\n${
      channel === 'email'
        ? `{\n  "versions": [\n    { "subject": "...", "preheader": "...", "body": "..." },\n    { "subject": "...", "preheader": "...", "body": "..." },\n    { "subject": "...", "preheader": "...", "body": "..." }\n  ]\n}\nFor Structured format: body may use **Header text** for a bold header line and - item for bullet list items. Plain prose only for other formats.`
        : channel === 'sms'
        ? `{\n  "versions": [\n    { "message": "... (under 160 characters)" },\n    { "message": "... (under 160 characters)" },\n    { "message": "... (under 160 characters)" }\n  ]\n}`
        : `{\n  "versions": [\n    { "title": "... (under 40 chars)", "message": "... (under 100 chars)" },\n    { "title": "... (under 40 chars)", "message": "... (under 100 chars)" },\n    { "title": "... (under 40 chars)", "message": "... (under 100 chars)" }\n  ]\n}`
    }\nEach version must take a meaningfully different angle.`,
  ]
    .filter((s): s is string => s != null && s.length > 0)
    .join('\n\n')

  // ── User prompt ───────────────────────────────────────────────────────────

  const toneList = (tones ?? []).join(', ') || 'Educational'
  const userPrompt = `Generate 3 versions of ${channel} content for LashBox LA.

Channel: ${channel.toUpperCase()}
Topic / Theme: ${topic}
${productFocus ? `Product Focus: ${productFocus}` : ''}
${audience ? `Target Audience: ${audience}` : ''}
Tone / Angle: ${toneList}
${talkingPoints ? `Key Talking Points:\n${talkingPoints}` : ''}

Write 3 distinct versions, each taking a different angle suited to the tone(s) requested. Make the copy feel specific to LashBox LA's brand -- never generic beauty brand language.${channel === 'sms' ? ' Each SMS must be under 160 characters -- tight, clear call to action.' : channel === 'push' ? ' Push title under 40 chars, message under 100 chars. High urgency, direct.' : ''}`

  // ── Call Claude ───────────────────────────────────────────────────────────

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  let parsed: { versions: unknown[] }

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
      .replace(/ — /g, ', ')
      .replace(/—/g, ', ')
      .replace(/ – /g, ' - ')
      .replace(/–/g, '-')

    parsed = JSON.parse(cleaned) as { versions: unknown[] }
  } catch (err) {
    return Response.json({ error: `Generation failed: ${(err as Error).message}` }, { status: 500 })
  }

  // ── Section 4: Save to log (fire and forget) ──────────────────────────────
  void service.from('lbla_generation_log').insert({
    tenant_id:      TENANT_ID,
    channel,
    content_type:   ct,
    topic,
    product_focus:  productFocus ?? null,
    audience:       audience ?? null,
    custom_audience: customAudience ?? null,
    tones:          tones ?? null,
    talking_points: talkingPoints ?? null,
    output:         parsed,
  })

  return Response.json({ success: true, data: parsed })
}
