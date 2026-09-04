import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { subjectLabel, goalLabel, goalTone, offerTypeLabel } from '@/lib/contentStudioOptions'

// Requires a signed-in user; /lbla + /api/lbla are gated behind Supabase login in proxy.ts (LBLA team tool)
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

interface ShopifyCollectionData {
  id: number
  title: string
  body_html: string
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

// ── Section 1: Shopify product / collection resolver ─────────────────────────
//
// Ported from /api/content-studio/generate so collection URLs resolve instead of
// falling through as a raw URL string. Products additionally carry variant
// prices, and collections carry the products they contain (LBLA-specific).

type ResolvedFocus =
  | {
      type: 'product'
      title: string
      description: string | null
      variants: string | null
      tags: string | null
      productType: string | null
    }
  | {
      type: 'collection'
      title: string
      description: string | null
      products: string[]
    }
  | { type: 'text'; title: string }

const SHOPIFY_TIMEOUT_MS = 5000

function stripHtml(html: string | null | undefined, limit: number): string | null {
  return html
    ?.replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit) || null
}

async function resolveFocus(
  storeRow: StoreRow | null,
  productFocus: string,
): Promise<ResolvedFocus | null> {
  if (!productFocus.trim()) return null

  const isUrl =
    productFocus.includes('lashboxla.com/products/') ||
    productFocus.includes('lashboxla.com/collections/')

  // A typed product name, not a URL — kept as free text, as before.
  if (!isUrl) return { type: 'text', title: productFocus }

  if (!storeRow?.shopify_domain || !storeRow?.shopify_access_token) {
    return { type: 'text', title: productFocus }
  }

  const match = productFocus.match(/\/(products|collections)\/([^/?#]+)/)
  if (!match) return { type: 'text', title: productFocus }

  const [, kind, handle] = match
  const store   = storeRow.shopify_domain
  const headers = { 'X-Shopify-Access-Token': storeRow.shopify_access_token }
  const get = (path: string) =>
    fetch(`https://${store}/admin/api/2024-10/${path}`, {
      headers,
      signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS),
    })

  try {
    if (kind === 'products') {
      const res = await get(`products.json?handle=${handle}&fields=title,body_html,variants,tags,product_type`)
      if (!res.ok) return { type: 'text', title: productFocus }
      const data = await res.json() as { products?: ShopifyProductData[] }
      const product = data.products?.[0]
      if (!product) return { type: 'text', title: productFocus }

      // Variants keep their prices — the LBLA prompt has always shown these.
      const variants = (product.variants ?? [])
        .map((v) => `${v.title}${v.price ? ` ($${v.price})` : ''}`)
        .filter((t) => !t.startsWith('Default Title'))
        .slice(0, 8)
        .join(', ') || null

      return {
        type: 'product',
        title: product.title,
        description: stripHtml(product.body_html, 300),
        variants,
        tags: product.tags || null,
        productType: product.product_type || null,
      }
    }

    // Collections: custom first, then smart. Both need the id to list products.
    const [customRes, smartRes] = await Promise.all([
      get(`custom_collections.json?handle=${handle}&fields=id,title,body_html`)
        .then((r) => r.json() as Promise<{ custom_collections?: ShopifyCollectionData[] }>)
        .catch(() => ({ custom_collections: undefined })),
      get(`smart_collections.json?handle=${handle}&fields=id,title,body_html`)
        .then((r) => r.json() as Promise<{ smart_collections?: ShopifyCollectionData[] }>)
        .catch(() => ({ smart_collections: undefined })),
    ])

    const collection = customRes.custom_collections?.[0] ?? smartRes.smart_collections?.[0]
    if (!collection) return { type: 'text', title: productFocus }

    let productTitles: string[] = []
    try {
      const prodRes = await get(`products.json?collection_id=${collection.id}&fields=title&limit=20`)
      if (prodRes.ok) {
        const prodData = await prodRes.json() as { products?: { title: string }[] }
        productTitles = (prodData.products ?? []).map((p) => p.title).filter(Boolean)
      }
    } catch {
      // Collection still usable without its product list.
    }

    return {
      type: 'collection',
      title: collection.title,
      description: stripHtml(collection.body_html, 500),
      products: productTitles,
    }
  } catch {
    // Timeout or network failure — fall back to the raw string.
    return { type: 'text', title: productFocus }
  }
}

function buildFocusItemLine(focus: ResolvedFocus): string {
  if (focus.type === 'product') {
    return [
      `- ${focus.title}`,
      focus.description ? `  Description: ${focus.description}` : '',
      focus.variants    ? `  Variants: ${focus.variants}` : '',
      focus.productType ? `  Type: ${focus.productType}` : '',
    ].filter(Boolean).join('\n')
  }
  if (focus.type === 'collection') {
    return [
      `- ${focus.title} (collection)`,
      focus.description     ? `  Description: ${focus.description}` : '',
      focus.products.length ? `  Includes: ${focus.products.join(', ')}` : '',
    ].filter(Boolean).join('\n')
  }
  return `- ${focus.title}`
}

function buildFocusBlock(focus: ResolvedFocus): string {
  if (focus.type === 'product') {
    return [
      'PRODUCT DETAILS (live from Shopify):',
      `- Title: ${focus.title}`,
      focus.description ? `- Description: ${focus.description}` : '',
      focus.variants    ? `- Variants: ${focus.variants}` : '',
      focus.tags        ? `- Tags: ${focus.tags}` : '',
      focus.productType ? `- Product type: ${focus.productType}` : '',
    ].filter(Boolean).join('\n')
  }

  if (focus.type === 'collection') {
    return [
      'COLLECTION DETAILS (live from Shopify):',
      `- Collection: ${focus.title}`,
      focus.description       ? `- Description: ${focus.description}` : '',
      focus.products.length   ? `- Products in this collection: ${focus.products.join(', ')}` : '',
      'Write copy that speaks to the breadth of this collection.',
    ].filter(Boolean).join('\n')
  }

  return ''
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

// ── Section 3: Customer base context ─────────────────────────────────────────
// Was persona-driven; the persona dropdown is gone, so this is now plain store
// context (the equivalent of the dashboard route's "Customer segments" block).
// It is store data, not the user's audience — those stay separate in the prompt.

function buildCustomerBaseBlock(
  overlap: CustomerOverlapRow | null,
  recharge: RechargeMetricsRow | null,
): string {
  if (!overlap && !recharge) return ''

  const seg   = overlap?.segment_counts ?? {}
  const ltv   = overlap?.ltv_stats ?? {}
  const total = overlap?.total_customers ?? 0

  const lines: string[] = ['CUSTOMER BASE (store context):']

  if (total > 0) lines.push(`- Total customer base: ${total.toLocaleString()} customers`)

  const activeCount = (seg['VIP'] ?? 0) + (seg['Active'] ?? 0)
  if (activeCount > 0) lines.push(`- Active buyers: ${activeCount.toLocaleString()} (VIP + Active segments)`)

  const lapsedCount = (seg['Lapsed'] ?? 0) + (seg['At Risk'] ?? 0)
  if (lapsedCount > 0) lines.push(`- Lapsed / At Risk: ${lapsedCount.toLocaleString()}`)

  const newCount = seg['New'] ?? 0
  if (newCount > 0) lines.push(`- New customers: ${newCount.toLocaleString()}`)

  for (const tier of ['Diamond', 'Gold'] as const) {
    const t = ltv[tier]
    if (t?.count) {
      lines.push(`- ${tier}-tier: ${t.count.toLocaleString()} customers, avg LTV $${Math.round(t.totalRevenue / Math.max(t.count, 1)).toLocaleString()}`)
    }
  }

  if (recharge?.active_subscribers) {
    lines.push(`- Active subscribers: ${recharge.active_subscribers.toLocaleString()}`)
  }

  if (lines.length <= 1) return ''
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

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    channel: 'email' | 'sms' | 'push'
    subject?: string
    goal?: string
    historyLabel?: string | null
    products?: string[] | null
    audience?: string | null
    talkingPoints?: string | null
    pageUrl?: string | null
    offerType?: string | null
    discountAmount?: string | null
    promoCode?: string | null
    length?: 'short' | 'long' | null
    files?: { name: string; base64: string }[] | null
  }

  const {
    channel, subject, goal, historyLabel, products,
    audience, talkingPoints, pageUrl,
    offerType, discountAmount, promoCode,
    length, files,
  } = body

  if (!channel || !historyLabel) {
    return Response.json({ error: 'channel and historyLabel are required' }, { status: 400 })
  }

  const focusEntries = subject === 'products' ? (products ?? []).filter((p) => p?.trim()) : []

  const service = createSupabaseServiceClient()

  // ── Phase 1: all Supabase queries in parallel ─────────────────────────────
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

  // ── Phase 2: Shopify API — resolve every selected entry ───────────────────
  const resolvedFocuses = (
    await Promise.all(focusEntries.map((entry) => resolveFocus(storeData, entry)))
  ).filter((f): f is ResolvedFocus => f != null)

  // Only products (resolved or typed by name) drive the product_stats and
  // product_affinities lookups. A collection title would never match a product
  // row, and the raw URL that used to land here matched nothing at all.
  const resolvedProductTitles = resolvedFocuses
    .filter((f) => f.type === 'product' || f.type === 'text')
    .map((f) => f.title)

  // ── Phase 3: Product stats + affinity, per resolved product ──────────────
  const perfBlocks = (
    await Promise.all(
      resolvedProductTitles.map(async (title) => {
        const [{ data: statsData }, { data: affinityData }] = await Promise.all([
          (service
            .from('product_stats')
            .select('revenue_90d, total_quantity_sold, repeat_purchase_rate, avg_days_to_repurchase, subscription_conversion_rate, is_subscribable')
            .eq('tenant_id', TENANT_ID)
            .ilike('product_title', `%${title.slice(0, 40)}%`)
            .limit(10)) as unknown as Promise<{ data: ProductStatRow[] | null; error: unknown }>,

          (service
            .from('product_affinities')
            .select('product_b, co_purchase_rate, lift')
            .eq('tenant_id', TENANT_ID)
            .ilike('product_a', `%${title.slice(0, 40)}%`)
            .order('lift', { ascending: false })
            .limit(1)) as unknown as Promise<{ data: AffinityRow[] | null; error: unknown }>,
        ])

        const block = buildProductPerformanceBlock(statsData ?? [], affinityData?.[0] ?? null)
        // Name the product when several are in play, so the numbers stay attributable.
        return block && resolvedProductTitles.length > 1
          ? block.replace('PRODUCT PERFORMANCE CONTEXT (from store data):', `PRODUCT PERFORMANCE — ${title}:`)
          : block
      }),
    )
  ).filter(Boolean)

  // ── Build prompt blocks ───────────────────────────────────────────────────

  // Style guide (existing)
  const rules        = (styleRulesData ?? []) as StyleRuleRow[]
  const avoidRules   = rules.filter((r) => r.category === 'avoid')
  const enforceRules = rules.filter((r) => r.category === 'enforce')
  const vocabRules   = rules.filter((r) => r.category === 'vocabulary')
  const exampleRules = rules.filter((r) => r.category === 'examples')

  // Absolute requirements, not guidance. Mechanical rules (punctuation, banned
  // phrases) must never reach the output — a downstream pass otherwise has to
  // clean up after a rule the model was already given.
  const styleBlock = rules.length === 0 ? '' : [
    'STYLE RULES — THESE ARE HARD REQUIREMENTS, NOT PREFERENCES:',
    'Every rule below applies to every one of the three versions, and to every field including subjects and preheaders. A version that breaks any of them is unusable. Check each version against this list before returning it.',
    avoidRules.length > 0   ? `NEVER do these, without exception:\n${avoidRules.map((r) => `- ${r.rule}`).join('\n')}`   : '',
    enforceRules.length > 0 ? `ALWAYS do these, without exception:\n${enforceRules.map((r) => `- ${r.rule}`).join('\n')}` : '',
    vocabRules.length > 0   ? `Vocabulary — these are binding:\n${vocabRules.map((r) => `- ${r.rule}`).join('\n')}`        : '',
    exampleRules.length > 0 ? `Match the style of these examples:\n${exampleRules.map((r) => `- ${r.rule}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n')

  // Top products (existing)
  const topProductLines = ((topProductsData ?? []) as TopProductRow[])
    .map((p) => `  - ${p.product_title}: $${Math.round(Number(p.total_revenue)).toLocaleString()} revenue`)
    .join('\n')

  // Section 1: resolved product / collection details.
  // One item keeps the single-block shape exactly; several become a PRODUCTS list.
  const focusBlock =
    resolvedFocuses.length === 0 ? ''
    : resolvedFocuses.length === 1 ? buildFocusBlock(resolvedFocuses[0])
    : [
        'PRODUCTS IN THIS SEND:',
        ...resolvedFocuses.map((f) => buildFocusItemLine(f)),
        'Give each item a real reason to be here. Do not treat the list as interchangeable.',
      ].join('\n\n')

  // Subject 'page' carries a URL instead of products.
  const pageBlock = subject === 'page' && pageUrl
    ? [
        'PAGE DETAILS:',
        `- URL: ${pageUrl}`,
        'Drive clicks to this page. Copy should clearly communicate the value of visiting.',
      ].join('\n')
    : ''

  // Offer block belongs to the goal, independent of subject.
  const offerBlock = goal === 'promote'
    ? [
        'PROMOTION DETAILS:',
        offerType ? `- Offer type: ${offerTypeLabel(offerType)}` : '',
        discountAmount ? `- Discount: ${discountAmount}` : '',
        promoCode ? `- Promo code: ${promoCode}` : '',
        'Include the promo code prominently if provided.',
      ].filter(Boolean).join('\n')
    : ''

  // Explicit word targets: generations were running 400+ words unprompted.
  const LENGTH_TARGETS: Record<string, Record<string, string>> = {
    email: {
      short: 'LENGTH TARGET: 90-130 words in the body. This is a hard ceiling, not a suggestion. Cut anything that does not earn its place. Two to three short paragraphs.',
      long:  'LENGTH TARGET: 200-260 words in the body. Use the extra room for specifics and detail, not for warm-up or restatement.',
    },
    push: {
      short: 'LENGTH TARGET: 8-12 words in the message. One clear idea, nothing more.',
      long:  'LENGTH TARGET: 13-18 words in the message, still inside the 100 character cap.',
    },
  }
  const lengthBlock = LENGTH_TARGETS[channel]?.[length ?? 'short'] ?? ''

  // Audience is a constraint, not context. Without the explicit "every version"
  // wording the model honours it in one version and defaults to a general
  // working artist in the other two. Omitted entirely when blank.
  const audienceText = (audience ?? '').trim()
  const audienceBlock = audienceText
    ? `AUDIENCE: ${audienceText}
This is a constraint, not background. Every one of the three versions must be written for this specific audience, with no exceptions. Frame the copy around their situation, what they already know, and what would actually move them: the assumptions you make, the concerns you name, and the reference points you reach for should all follow from who they are. Do not write for a general working artist in any version.`
    : ''

  // Section 2: Klaviyo recent campaigns
  const campaignsBlock = buildCampaignsBlock((campaignsData ?? []) as KlaviyoCampaignRow[])

  // Section 3: customer base (store context, not the requested audience)
  const customerBaseBlock = buildCustomerBaseBlock(
    (overlapData ?? null) as CustomerOverlapRow | null,
    (rechargeData ?? null) as RechargeMetricsRow | null,
  )

  // Section 6: Product performance, one block per resolved product
  const productPerfBlock = perfBlocks.join('\n\n')

  // ── Assemble system prompt ────────────────────────────────────────────────

  const systemPrompt = [
    `You are the in-house copywriter for LashBox LA (lashboxla.com), a professional lash and lash lift supply company serving licensed lash artists and salon owners. You have deep knowledge of the lash industry.`,

    `TOP PRODUCTS FOR CONTEXT:\n${topProductLines || '  (no product data available)'}`,

    `SUBJECT: ${subjectLabel(subject)}\nGOAL: ${goalLabel(goal)}\nTONE: ${goalTone(goal)}`,

    focusBlock || null,

    pageBlock || null,

    offerBlock || null,

    productPerfBlock || null,

    `BRAND VOICE:
- Educational and empowering -- teach, don't just sell
- Professional peer-to-peer -- artist to artist, not brand to consumer
- Never generic, never pushy. Specific over vague.
- Reference real concerns: client retention, technique results, restock timing, business growth
- Avoid: "game-changer", "elevate your business", "unlock your potential"
- Write like someone who understands what it means to be behind the bed managing 6+ clients a day`,

    customerBaseBlock || null,

    campaignsBlock || null,

    audienceBlock || null,

    lengthBlock || null,

    styleBlock || null,

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

  const briefLines = [
    `Channel: ${channel.toUpperCase()}`,
    talkingPoints ? `Key Talking Points:\n${talkingPoints}` : '',
  ].filter(Boolean).join('\n')

  // Reference PDFs are attached to the user message as document blocks. They are
  // read for this generation only and never stored.
  const attachments = (files ?? []).filter((f) => f?.base64 && f?.name)
  const attachmentIntro = attachments.length
    ? `REFERENCE FILES: ${attachments.length} document${attachments.length !== 1 ? 's' : ''} (${attachments.map((f) => f.name).join(', ')}) ${attachments.length !== 1 ? 'are' : 'is'} attached above. The user supplied ${attachments.length !== 1 ? 'them' : 'it'} as reference material for this specific campaign. Read ${attachments.length !== 1 ? 'them' : 'it'} and let the detail inform the copy: facts, positioning, product specifics, and anything the campaign hinges on. They do NOT override the style rules in the system prompt, which remain binding in full — if a reference file's own wording breaks a style rule, follow the style rule.

`
    : ''

  const userPrompt = `${attachmentIntro}Generate 3 versions of ${channel} content for LashBox LA.

${briefLines}

Write 3 distinct versions, each taking a meaningfully different angle. Make the copy feel specific to LashBox LA's brand -- never generic beauty brand language.${channel === 'sms' ? ' Each SMS must be under 160 characters -- tight, clear call to action.' : channel === 'push' ? ' Push title under 40 chars, message under 100 chars. High urgency, direct.' : ''}`

  // ── Call Claude ───────────────────────────────────────────────────────────

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  let parsed: { versions: unknown[] }

  // Documents first, then the text — the standard ordering for document blocks.
  const userContent: Anthropic.ContentBlockParam[] = [
    ...attachments.map((f) => ({
      type: 'document' as const,
      source: {
        type: 'base64' as const,
        media_type: 'application/pdf' as const,
        data: f.base64,
      },
      title: f.name,
    })),
    { type: 'text' as const, text: userPrompt },
  ]

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
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
    const detail = (err as Error).message
    // Copy written from a brief that was never read is worse than an error, so
    // say plainly that the attachments are implicated.
    if (attachments.length) {
      return Response.json({
        error: `Generation failed and your reference files were not used: ${detail}`,
        detail: `Attached: ${attachments.map((f) => f.name).join(', ')}. Nothing was generated. Remove or replace the files and try again.`,
      }, { status: 500 })
    }
    return Response.json({ error: `Generation failed: ${detail}` }, { status: 500 })
  }

  // ── Section 4: Save to log ────────────────────────────────────────────────
  // Awaited: a silent failure here meant generations vanished from history with
  // no signal. The copy is still returned even when the save fails.
  const { error: saveErr } = await service.from('lbla_generation_log').insert({
    tenant_id:      TENANT_ID,
    channel,
    subject:        subject ?? 'none',
    goal:           goal ?? 'educate',
    topic:          historyLabel,
    product_focus:  focusEntries.length ? focusEntries.join(', ') : null,
    audience:       audienceText || null,
    talking_points: talkingPoints ?? null,
    source_files:   attachments.length ? attachments.map((f) => f.name) : null,
    output:         parsed,
  })

  if (saveErr) {
    return Response.json({ success: true, data: parsed, saveError: saveErr.message })
  }

  return Response.json({ success: true, data: parsed })
}
