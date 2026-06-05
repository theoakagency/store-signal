import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'

// NO AI CALLS from cron — this is a user-triggered endpoint only

export const maxDuration = 60

const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const STORE_ID  = '00000000-0000-0000-0000-000000000002'

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
  const { channel, topic, productFocus, audience, tones, talkingPoints } = body as {
    channel: 'email' | 'sms' | 'push'
    topic: string
    productFocus?: string | null
    audience?: string | null
    tones?: string[]
    talkingPoints?: string | null
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

  // Resolved product / collection context block
  const productBlock = resolvedProduct
    ? [
        'PRODUCT / COLLECTION FOCUS:',
        resolvedProduct.type === 'product' ? [
          `- Name: ${resolvedProduct.title}`,
          resolvedProduct.productType ? `- Type: ${resolvedProduct.productType}` : '',
          resolvedProduct.variants   ? `- Variants available: ${resolvedProduct.variants}` : '',
          resolvedProduct.description ? `- Product description: ${resolvedProduct.description}` : '',
          resolvedProduct.tags        ? `- Tags: ${resolvedProduct.tags}` : '',
          'Use specific details from this product description in the copy — reference actual specs, use cases, and differentiators rather than generic language.',
        ].filter(Boolean).join('\n') : '',
        resolvedProduct.type === 'collection' ? [
          `- Collection: ${resolvedProduct.title}`,
          resolvedProduct.description ? `- Collection description: ${resolvedProduct.description}` : '',
          'Write copy that speaks to the breadth of this collection and helps the reader navigate to what\'s right for them.',
        ].filter(Boolean).join('\n') : '',
        resolvedProduct.type === 'text' ? `- Product reference: ${resolvedProduct.title}` : '',
      ].filter(Boolean).join('\n')
    : ''

  const emailPerfBlock = avgOpenRate !== null
    ? `Current email performance baseline: ${(avgOpenRate * 100).toFixed(1)}% avg open rate, ${avgClickRate !== null ? (avgClickRate * 100).toFixed(1) + '%' : 'N/A'} avg click rate`
    : 'Email performance data not yet synced'

  // ── Dynamic style rules block ─────────────────────────────────────────────

  const rules = styleRules ?? []
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

  // ── Prompts ───────────────────────────────────────────────────────────────

  const systemPrompt = `You are the in-house copywriter for LashBox LA (lashboxla.com), a professional lash and lash lift supply company serving licensed lash artists and salon owners. You have deep knowledge of the lash industry.

LIVE STORE CONTEXT (use this to make copy specific and grounded):
Top products by revenue:
${topProductLines || '  (no product data synced yet)'}
${emailPerfBlock}
Customer segments:
${segmentLines || '  (no segment data synced yet)'}
${productBlock ? '\n' + productBlock : ''}

BRAND VOICE:
- Educational and empowering — teach, don't just sell
- Professional peer-to-peer — artist to artist, not brand to consumer
- Never generic, never pushy. Specific over vague.
- Reference real concerns: client retention, technique results, restock timing, business growth
- Avoid: "game-changer", "elevate your business", "unlock your potential"
- Write like someone who understands what it means to be behind the bed managing 6+ clients a day

AUDIENCE: Licensed lash artists who are professional restockers, not impulse buyers. 3-12 month adoption arc for new techniques. They care about retention time, client satisfaction, application speed, consistency of results.
${styleBlock ? '\n' + styleBlock + '\n' : ''}
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
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    parsed = JSON.parse(cleaned)
  } catch (err) {
    return Response.json({ error: `AI generation failed: ${(err as Error).message}` }, { status: 500 })
  }

  // ── Save to DB ────────────────────────────────────────────────────────────

  const { data: saved, error: dbErr } = await service
    .from('content_generations')
    .insert({
      store_id:      STORE_ID,
      user_id:       user.id,
      channel,
      topic,
      product_focus: productFocus ?? null,
      audience:      audience ?? null,
      tones:         tones ?? [],
      talking_points: talkingPoints ?? null,
      versions:      parsed,
    })
    .select('id, channel, topic, product_focus, audience, tones, talking_points, versions, created_at')
    .single()

  if (dbErr) {
    // Return the generation even if save fails — don't block the user
    return Response.json({ success: true, data: parsed, saved: null, saveError: dbErr.message })
  }

  return Response.json({ success: true, data: parsed, saved })
}
