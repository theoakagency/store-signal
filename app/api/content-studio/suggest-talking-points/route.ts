import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'

const STORE_ID = '00000000-0000-0000-0000-000000000002'

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createSupabaseServiceClient()

  const body = await req.json()
  const { productFocus, topic, channel } = body as {
    productFocus?: string | null
    topic: string
    channel: string
  }

  // ── Fetch Shopify token + style rules in parallel ─────────────────────────

  const [{ data: shopifyStoreRow }, { data: styleRules }] = await Promise.all([
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

  // ── Resolve product if URL ────────────────────────────────────────────────

  let productDescription: string | null = null
  let variants: string | null = null
  let tags: string | null = null

  const isProductUrl = productFocus && productFocus.includes('lashboxla.com/products/')

  if (isProductUrl && shopifyStoreRow?.shopify_domain && shopifyStoreRow?.shopify_access_token) {
    const match = productFocus!.match(/\/products\/([^/?#]+)/)
    if (match) {
      const handle = match[1]
      try {
        const res = await fetch(
          `https://${shopifyStoreRow.shopify_domain}/admin/api/2024-10/products.json?handle=${handle}&fields=title,body_html,variants,tags`,
          { headers: { 'X-Shopify-Access-Token': shopifyStoreRow.shopify_access_token } },
        )
        if (res.ok) {
          const data = await res.json() as {
            products?: {
              title: string
              body_html: string
              variants: { title: string }[]
              tags: string
            }[]
          }
          const product = data.products?.[0]
          if (product) {
            productDescription = product.body_html
              ?.replace(/<[^>]*>/g, ' ')
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 1000) || null

            variants = product.variants
              ?.map((v) => v.title)
              .filter((t) => t !== 'Default Title')
              .slice(0, 10)
              .join(', ') || null

            tags = product.tags || null
          }
        }
      } catch {
        // fall through — use topic alone
      }
    }
  }

  // ── Style rules ───────────────────────────────────────────────────────────

  const rules = styleRules ?? []
  const avoidRules = rules.filter((r) => r.category === 'avoid')
  const vocabRules  = rules.filter((r) => r.category === 'vocabulary')

  // ── Build prompt ──────────────────────────────────────────────────────────

  const systemPrompt = `You are a copywriter for LashBox LA (lashboxla.com), a professional lash supply company. Generate specific, concrete talking points for ${channel} copy written for licensed lash artists. Talking points should be usable facts, benefits, or angles — not generic statements.
${avoidRules.length > 0 ? `\nNever use these:\n${avoidRules.map((r) => `- ${r.rule}`).join('\n')}` : ''}
${vocabRules.length > 0 ? `\nVocabulary:\n${vocabRules.map((r) => `- ${r.rule}`).join('\n')}` : ''}

Return ONLY a valid JSON array of exactly 5 talking point strings. No preamble, no markdown.`

  const userPrompt = `Topic: ${topic || 'general lash supply content'}
Channel: ${channel}
${productDescription ? `Product description: ${productDescription}` : ''}
${variants ? `Available variants: ${variants}` : ''}
${tags ? `Product tags: ${tags}` : ''}

Generate 5 specific talking points a copywriter could use directly.

Good examples:
- "Sets in 1-2 seconds, ideal for speed artists doing 3+ clients per day"
- "Available in 8 curl types including CC curl for hooded eyes"
- "Subscription customers save 15% and never run out mid-week"

Bad examples:
- "Great quality"
- "Clients will love it"
- "Popular product"`

  // ── Call Anthropic ────────────────────────────────────────────────────────

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : '[]'
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const talkingPoints = JSON.parse(cleaned) as string[]

    return Response.json({ talkingPoints })
  } catch (err) {
    return Response.json({ error: `Talking point suggestion failed: ${(err as Error).message}` }, { status: 500 })
  }
}
