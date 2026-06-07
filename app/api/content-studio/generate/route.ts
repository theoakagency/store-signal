import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'

// NO AI CALLS from cron — this is a user-triggered endpoint only

export const maxDuration = 60

const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const STORE_ID  = '00000000-0000-0000-0000-000000000002'

const AUDIENCE_MAP: Record<string, string> = {
  'all-lash-artists':        'Broad audience of working lash artists. Assume professional, licensed, and actively seeing clients. Write for someone who knows their craft.',
  'new-lash-artists':         'Artists in their first 1-2 years. Still building confidence, clientele, and systems. Respond to reassurance, education, and community. May be price-conscious.',
  'established-lash-artists': 'Experienced artists with a full book. Value efficiency, consistency, and quality over price. They know what works and why.',
  'volume-specialists':       'Speed-focused artists doing 3+ clients per day. Care deeply about set time, retention, and consistency across long days. Every second counts.',
  'lash-lift-specialists':    'Artists offering or actively considering lash lift services. Care about technique, chemical safety, client results, and differentiating their menu.',
  'salon-owners':             'Managing a team of artists. Think in terms of staff training, bulk purchasing, margin, and standardizing products across their business.',
  'students':                 'Pre-licensed or recently licensed. Not yet making professional purchases at scale. Respond to education, inspiration, and brand familiarity.',
  'lapsed-customers':         'Have not ordered in 90+ days. May have switched suppliers or gone quiet. Need a reason to return — relevance, value, or something new.',
  'subscribers':              'Active Recharge subscribers. Already committed to the brand. Reward loyalty, offer exclusives, and reinforce the value of staying subscribed.',
}

// ── Product / collection resolver ─────────────────────────────────────────────

interface ResolvedProduct {
  type: 'product' | 'collection' | 'text'
  title: string
  description: string | null
  variants: string | null
  productType: string | null
  tags: string | null
}

async function resolveProduct(
  productFocus: string,
  shopifyStore: string,
  shopifyToken: string,
): Promise<ResolvedProduct | null> {
  if (!productFocus.trim()) return null

  const isUrl =
    productFocus.includes('lashboxla.com/products/') ||
    productFocus.includes('lashboxla.com/collections/')

  if (!isUrl) {
    return { type: 'text', title: productFocus, description: null, variants: null, productType: null, tags: null }
  }

  const match = productFocus.match(/\/(products|collections)\/([^/?#]+)/)
  if (!match) return null

  const [, type, handle] = match

  try {
    if (type === 'products') {
      const res = await fetch(
        `https://${shopifyStore}/admin/api/2024-10/products.json?handle=${handle}&fields=title,body_html,variants,product_type,tags`,
        { headers: { 'X-Shopify-Access-Token': shopifyToken } },
      )
      if (!res.ok) return null
      const data = await res.json() as { products?: { title: string; body_html: string; variants: { title: string }[]; product_type: string; tags: string }[] }
      const product = data.products?.[0]
      if (!product) return null

      const description = product.body_html
        ?.replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 1000) || null

      const variants = product.variants
        ?.map((v) => v.title)
        .filter((t) => t !== 'Default Title')
        .slice(0, 10)
        .join(', ') || null

      return {
        type: 'product',
        title: product.title,
        description,
        variants,
        productType: product.product_type || null,
        tags: product.tags || null,
      }
    }

    if (type === 'collections') {
      // Try custom collections first, then smart collections
      const headers = { 'X-Shopify-Access-Token': shopifyToken }
      const url = (kind: string) =>
        `https://${shopifyStore}/admin/api/2024-10/${kind}.json?handle=${handle}&fields=title,body_html`

      const [customRes, smartRes] = await Promise.all([
        fetch(url('custom_collections'), { headers }).then((r) => r.json() as Promise<{ custom_collections?: { title: string; body_html: string }[] }>),
        fetch(url('smart_collections'),  { headers }).then((r) => r.json() as Promise<{ smart_collections?:  { title: string; body_html: string }[] }>),
      ])

      const collection = customRes.custom_collections?.[0] ?? smartRes.smart_collections?.[0]
      if (!collection) return null

      const description = collection.body_html
        ?.replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 500) || null

      return { type: 'collection', title: collection.title, description, variants: null, productType: null, tags: null }
    }
  } catch {
    // Shopify fetch failed — fall through to text fallback
  }

  return { type: 'text', title: productFocus, description: null, variants: null, productType: null, tags: null }
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createSupabaseServiceClient()

  const body = await req.json()
  const {
    channel,
    contentType,
    topic,
    productFocus,
    audience,
    customAudience,
    tones,
    talkingPoints,
    // promotion fields
    offerType,
    discountAmount,
    promoCode,
    offerEndDate,
    offerDetails,
    // event fields
    eventName,
    eventDate,
    eventUrl,
    // landing-page fields
    landingPageUrl,
    landingPageDescription,
    // collection field
    collectionUrl,
  } = body as {
    channel: 'email' | 'sms' | 'push'
    contentType?: string
    topic: string
    productFocus?: string | null
    audience?: string | null
    customAudience?: string | null
    tones?: string[]
    talkingPoints?: string | null
    offerType?: string | null
    discountAmount?: string | null
    promoCode?: string | null
    offerEndDate?: string | null
    offerDetails?: string | null
    eventName?: string | null
    eventDate?: string | null
    eventUrl?: string | null
    landingPageUrl?: string | null
    landingPageDescription?: string | null
    collectionUrl?: string | null
  }

  if (!channel || !topic) {
    return Response.json({ error: 'channel and topic are required' }, { status: 400 })
  }

  // ── Fetch live context ────────────────────────────────────────────────────

  const [
    { data: topProducts },
    { data: klaviyoCampaigns },
    { data: profileRows },
    { data: shopifyStoreRow },
    { data: styleRules },
  ] = await Promise.all([
    service
      .from('product_stats')
      .select('product_title, total_revenue, total_quantity_sold')
      .eq('tenant_id', TENANT_ID)
      .order('total_revenue', { ascending: false })
      .limit(5),

    service
      .from('klaviyo_campaigns')
      .select('open_rate, click_rate, revenue_attributed')
      .eq('tenant_id', TENANT_ID)
      .not('open_rate', 'is', null)
      .order('send_time', { ascending: false })
      .limit(10),

    service
      .from('customer_profiles')
      .select('segment')
      .eq('tenant_id', TENANT_ID)
      .not('segment', 'is', null),

    service
      .from('stores')
      .select('shopify_domain, shopify_access_token')
      .eq('id', STORE_ID)
      .single(),

    service
      .from('style_guide_rules')
      .select('category, rule')
      .eq('store_id', STORE_ID)
      .eq('active', true)
      .order('sort_order'),
  ])

  // Resolve product/collection if a focus was provided
  const resolvedProduct = productFocus
    ? await resolveProduct(
        productFocus,
        shopifyStoreRow?.shopify_domain ?? process.env.SHOPIFY_RETAIL_STORE ?? '',
        shopifyStoreRow?.shopify_access_token ?? '',
      )
    : null

  // Aggregate email stats
  const campaigns = klaviyoCampaigns ?? []
  const avgOpenRate = campaigns.length > 0
    ? campaigns.reduce((s, c) => s + Number(c.open_rate ?? 0), 0) / campaigns.length
    : null
  const avgClickRate = campaigns.length > 0
    ? campaigns.reduce((s, c) => s + Number(c.click_rate ?? 0), 0) / campaigns.length
    : null

  // Group segment counts
  const segmentMap: Record<string, number> = {}
  for (const row of profileRows ?? []) {
    const seg = row.segment as string
    segmentMap[seg] = (segmentMap[seg] ?? 0) + 1
  }

  // Top products context block
  const topProductLines = (topProducts ?? [])
    .map((p) => `  • ${p.product_title}: $${Number(p.total_revenue).toLocaleString('en-US', { maximumFractionDigits: 0 })} revenue, ${p.total_quantity_sold?.toLocaleString()} units sold`)
    .join('\n')

  // Segment context block
  const segmentLines = Object.entries(segmentMap)
    .sort((a, b) => b[1] - a[1])
    .map(([seg, count]) => `  • ${seg}: ${count.toLocaleString()} customers`)
    .join('\n')

  // ── Content context block (replaces old productBlock) ────────────────────

  function buildContentContext(): string {
    const ct = contentType ?? 'product'

    if (ct === 'product' || ct === 'educational') {
      if (!resolvedProduct) return ''
      const lines = [
        resolvedProduct.type === 'product' ? 'PRODUCT FOCUS:' : 'COLLECTION FOCUS:',
        resolvedProduct.type === 'product' ? [
          `- Name: ${resolvedProduct.title}`,
          resolvedProduct.productType  ? `- Type: ${resolvedProduct.productType}` : '',
          resolvedProduct.variants     ? `- Variants available: ${resolvedProduct.variants}` : '',
          resolvedProduct.description  ? `- Product description: ${resolvedProduct.description}` : '',
          resolvedProduct.tags         ? `- Tags: ${resolvedProduct.tags}` : '',
          'Use specific details from this product description in the copy.',
        ].filter(Boolean).join('\n') : '',
        resolvedProduct.type === 'collection' ? [
          `- Collection: ${resolvedProduct.title}`,
          resolvedProduct.description ? `- Collection description: ${resolvedProduct.description}` : '',
          "Write copy that speaks to the breadth of this collection.",
        ].filter(Boolean).join('\n') : '',
        resolvedProduct.type === 'text' ? `- Product reference: ${resolvedProduct.title}` : '',
      ].filter(Boolean).join('\n')
      return lines
    }

    if (ct === 'promotion') {
      const lines = [
        'PROMOTION DETAILS:',
        offerType ? `- Offer type: ${offerType}` : '',
        discountAmount ? `- Discount: ${discountAmount}` : '',
        promoCode ? `- Promo code: ${promoCode}` : '',
        offerEndDate ? `- Offer ends: ${offerEndDate}` : '',
        offerDetails ? `- Additional details: ${offerDetails}` : '',
        resolvedProduct ? `- Featured product: ${resolvedProduct.title}` : '',
        resolvedProduct?.description ? `- Product description: ${resolvedProduct.description}` : '',
        'Create urgency around the offer. Include the promo code prominently if provided.',
      ].filter(Boolean).join('\n')
      return lines
    }

    if (ct === 'event') {
      const lines = [
        'EVENT DETAILS:',
        eventName ? `- Event name: ${eventName}` : '',
        eventDate ? `- Date: ${eventDate}` : '',
        eventUrl ? `- Registration/details URL: ${eventUrl}` : '',
        'Drive registrations or attendance. Create excitement around the event.',
      ].filter(Boolean).join('\n')
      return lines
    }

    if (ct === 'landing-page') {
      const lines = [
        'LANDING PAGE DETAILS:',
        landingPageUrl ? `- URL: ${landingPageUrl}` : '',
        landingPageDescription ? `- Page purpose: ${landingPageDescription}` : '',
        'Drive clicks to this page. Copy should clearly communicate the value of visiting.',
      ].filter(Boolean).join('\n')
      return lines
    }

    if (ct === 'collection') {
      const lines = [
        collectionUrl ? `COLLECTION URL: ${collectionUrl}` : '',
        resolvedProduct ? `Collection name: ${resolvedProduct.title}` : '',
        resolvedProduct?.description ? `Collection description: ${resolvedProduct.description}` : '',
      ].filter(Boolean).join('\n')
      return lines
    }

    // brand / other / educational with no product — no extra context block
    return ''
  }

  const contentContextBlock = buildContentContext()

  const emailPerfBlock = avgOpenRate !== null
    ? `Current email performance baseline: ${(avgOpenRate * 100).toFixed(1)}% avg open rate, ${avgClickRate !== null ? (avgClickRate * 100).toFixed(1) + '%' : 'N/A'} avg click rate`
    : 'Email performance data not yet synced'

  // ── Dynamic style rules block ─────────────────────────────────────────────

  const rules = styleRules ?? []
  console.log('[content-studio/generate] styleRules from DB:', rules.length, '| store_id:', STORE_ID)

  const avoidRules   = rules.filter((r) => r.category === 'avoid')
  const enforceRules = rules.filter((r) => r.category === 'enforce')
  const vocabRules   = rules.filter((r) => r.category === 'vocabulary')
  const exampleRules = rules.filter((r) => r.category === 'examples')

  const styleBlock = rules.length === 0 ? '' : [
    'STYLE RULES — FOLLOW STRICTLY:',
    avoidRules.length > 0
      ? `Never do these:\n${avoidRules.map((r) => `- ${r.rule}`).join('\n')}`
      : '',
    enforceRules.length > 0
      ? `Always do these:\n${enforceRules.map((r) => `- ${r.rule}`).join('\n')}`
      : '',
    vocabRules.length > 0
      ? `Vocabulary:\n${vocabRules.map((r) => `- ${r.rule}`).join('\n')}`
      : '',
    exampleRules.length > 0
      ? `Write in the style of these examples:\n${exampleRules.map((r) => `- ${r.rule}`).join('\n')}`
      : '',
  ].filter(Boolean).join('\n\n')

  // ── Audience guidance ─────────────────────────────────────────────────────

  const audienceGuidance = AUDIENCE_MAP[audience ?? ''] ?? AUDIENCE_MAP['all-lash-artists']

  // ── Prompts ───────────────────────────────────────────────────────────────

  const systemPrompt = `You are the in-house copywriter for LashBox LA (lashboxla.com), a professional lash and lash lift supply company serving licensed lash artists and salon owners. You have deep knowledge of the lash industry.

LIVE STORE CONTEXT (use this to make copy specific and grounded):
Top products by revenue:
${topProductLines || '  (no product data synced yet)'}
${emailPerfBlock}
Customer segments:
${segmentLines || '  (no segment data synced yet)'}
${contentContextBlock ? '\n' + contentContextBlock : ''}

BRAND VOICE:
- Educational and empowering — teach, don't just sell
- Professional peer-to-peer — artist to artist, not brand to consumer
- Never generic, never pushy. Specific over vague.
- Reference real concerns: client retention, technique results, restock timing, business growth
- Avoid: "game-changer", "elevate your business", "unlock your potential"
- Write like someone who understands what it means to be behind the bed managing 6+ clients a day

AUDIENCE CONTEXT:
${audienceGuidance}
${customAudience ? `Additional specificity: ${customAudience}. Factor this into the tone and references used.` : ''}
${styleBlock ? '\n' + styleBlock + '\n' : ''}
FORMATTING CONSTRAINTS — APPLY TO EVERY FIELD INCLUDING SUBJECTS AND PREHEADERS:
- Never use em dashes (—) or en dashes (–) anywhere in the output. Use a comma, period, or rewrite the clause instead.
- Never use more than one exclamation point across all three versions combined.
- Never use "game-changer", "elevate", "unlock", "revolutionary", "cutting-edge", or "state-of-the-art".

RESPONSE FORMAT: Return ONLY valid JSON, no markdown, no code fences, no preamble.
${channel === 'email' ? `{
  "versions": [
    { "subject": "...", "preheader": "...", "body": "..." },
    { "subject": "...", "preheader": "...", "body": "..." },
    { "subject": "...", "preheader": "...", "body": "..." }
  ]
}` : channel === 'sms' ? `{
  "versions": [
    { "message": "... (under 160 characters)" },
    { "message": "... (under 160 characters)" },
    { "message": "... (under 160 characters)" }
  ]
}` : `{
  "versions": [
    { "title": "... (under 40 chars)", "message": "... (under 100 chars)" },
    { "title": "... (under 40 chars)", "message": "... (under 100 chars)" },
    { "title": "... (under 40 chars)", "message": "... (under 100 chars)" }
  ]
}`}
Each version must take a meaningfully different angle.`

  const toneList = (tones ?? []).join(', ') || 'Educational'
  const userPrompt = `Generate 3 versions of ${channel} content for LashBox LA.

Channel: ${channel.toUpperCase()}
Topic / Theme: ${topic}
${productFocus ? `Product Focus: ${productFocus}` : ''}
${audience ? `Target Audience: ${audience}` : ''}
Tone / Angle: ${toneList}
${talkingPoints ? `Key Talking Points: ${talkingPoints}` : ''}

Write 3 distinct versions, each taking a different angle suited to the tone(s) requested. Make the copy feel specific to LashBox LA's brand — never generic beauty brand language.${channel === 'email' ? ' Email body should be 100-200 words, conversational but professional.' : channel === 'sms' ? ' Each SMS must be under 160 characters — tight, clear call to action.' : ' Push title under 40 chars, message under 100 chars. High urgency, direct.'}`

  // ── Call Anthropic ────────────────────────────────────────────────────────

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
      .replace(/ — /g, ', ')   // em-dash with spaces → comma
      .replace(/—/g, ', ')     // bare em-dash → comma
      .replace(/ – /g, ' - ')  // en-dash with spaces → hyphen
      .replace(/–/g, '-')      // bare en-dash → hyphen
    parsed = JSON.parse(cleaned)
  } catch (err) {
    return Response.json({ error: `AI generation failed: ${(err as Error).message}` }, { status: 500 })
  }

  // ── Save to DB ────────────────────────────────────────────────────────────

  const { data: saved, error: dbErr } = await service
    .from('content_generations')
    .insert({
      store_id:        STORE_ID,
      user_id:         user.id,
      channel,
      content_type:    contentType ?? 'product',
      topic,
      product_focus:   productFocus ?? null,
      audience:        audience ?? null,
      custom_audience: customAudience ?? null,
      tones:           tones ?? [],
      talking_points:  talkingPoints ?? null,
      versions:        parsed,
    })
    .select('id, channel, content_type, topic, product_focus, audience, custom_audience, tones, talking_points, versions, created_at')
    .single()

  if (dbErr) {
    // Return the generation even if save fails — don't block the user
    return Response.json({ success: true, data: parsed, saved: null, saveError: dbErr.message })
  }

  return Response.json({ success: true, data: parsed, saved })
}
