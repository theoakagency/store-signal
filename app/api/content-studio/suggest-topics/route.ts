import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const STORE_ID  = '00000000-0000-0000-0000-000000000002'

function getSeason(month: number): string {
  if (month >= 2 && month <= 4) return 'spring'
  if (month >= 5 && month <= 7) return 'summer'
  if (month >= 8 && month <= 10) return 'fall'
  return 'winter'
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createSupabaseServiceClient()

  const body = await req.json()
  const { productFocus } = body as { productFocus?: string | null }

  // ── Fetch context ─────────────────────────────────────────────────────────

  const [
    { data: topProducts },
    { data: recentCampaigns },
    { data: shopifyStoreRow },
    { data: styleRules },
  ] = await Promise.all([
    service
      .from('product_stats')
      .select('product_title, total_revenue, total_quantity_sold')
      .eq('tenant_id', TENANT_ID)
      .gt('revenue_30d', 0)
      .order('revenue_30d', { ascending: false })
      .limit(5),

    service
      .from('klaviyo_campaigns')
      .select('campaign_name, open_rate, click_rate, send_time')
      .eq('tenant_id', TENANT_ID)
      .not('open_rate', 'is', null)
      .order('open_rate', { ascending: false })
      .limit(3),

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

  let resolvedProductTitle: string | null = null

  const isProductUrl = productFocus && (
    productFocus.includes('lashboxla.com/products/') ||
    productFocus.includes('lashboxla.com/collections/')
  )

  if (isProductUrl && shopifyStoreRow?.shopify_domain && shopifyStoreRow?.shopify_access_token) {
    const match = productFocus!.match(/\/(products|collections)\/([^/?#]+)/)
    if (match) {
      const [, type, handle] = match
      try {
        const endpoint = type === 'products'
          ? `https://${shopifyStoreRow.shopify_domain}/admin/api/2024-10/products.json?handle=${handle}&fields=title`
          : `https://${shopifyStoreRow.shopify_domain}/admin/api/2024-10/custom_collections.json?handle=${handle}&fields=title`
        const res = await fetch(endpoint, {
          headers: { 'X-Shopify-Access-Token': shopifyStoreRow.shopify_access_token },
        })
        if (res.ok) {
          const data = await res.json() as Record<string, { title: string }[]>
          const items = data.products ?? data.custom_collections ?? data.smart_collections ?? []
          if (items[0]?.title) resolvedProductTitle = items[0].title
        }
      } catch {
        // fall through — product title stays null
      }
    }
  } else if (productFocus && !isProductUrl) {
    resolvedProductTitle = productFocus
  }

  // ── Calendar context ──────────────────────────────────────────────────────

  const now = new Date()
  const month = now.toLocaleString('en-US', { month: 'long' })
  const season = getSeason(now.getMonth())

  // ── Style rules ───────────────────────────────────────────────────────────

  const rules = styleRules ?? []
  const avoidRules = rules.filter((r) => r.category === 'avoid')
  const vocabRules  = rules.filter((r) => r.category === 'vocabulary')

  // ── Build prompt ──────────────────────────────────────────────────────────

  const topProductLines = (topProducts ?? [])
    .map((p) => `- ${p.product_title} ($${Number(p.total_revenue ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })} in last 30 days)`)
    .join('\n')

  const campaignLines = (recentCampaigns ?? [])
    .map((c) => `- "${c.campaign_name}" (${(Number(c.open_rate ?? 0) * 100).toFixed(1)}% open rate)`)
    .join('\n')

  const systemPrompt = `You are a marketing strategist for LashBox LA (lashboxla.com), a professional lash supply company selling to licensed lash artists. Generate specific, actionable campaign topic ideas based on live store data. Topics should be concrete angles a copywriter can immediately work with, not vague themes.
${avoidRules.length > 0 ? `\nNever use these in topic suggestions:\n${avoidRules.map((r) => `- ${r.rule}`).join('\n')}` : ''}
${vocabRules.length > 0 ? `\nVocabulary rules:\n${vocabRules.map((r) => `- ${r.rule}`).join('\n')}` : ''}

Return ONLY a valid JSON array of exactly 6 topic strings. No preamble, no markdown, no explanation.`

  const userPrompt = `Current month: ${month}
Season: ${season}

Top selling products right now:
${topProductLines || '  (no product data available)'}

Recent high-performing email topics:
${campaignLines || '  (no campaign data available)'}
${resolvedProductTitle ? `\nSelected product focus: ${resolvedProductTitle}` : ''}

Generate 6 specific campaign topic ideas for this month. Each should be a concrete angle, not a generic theme.

Good examples:
- "Why lash artists are switching to Lash Alchemist mid-summer"
- "The fill appointment checklist your clients wish you'd send them"
- "CC curl is back in stock — here is how to use it on monolids"

Bad examples:
- "Summer lash tips"
- "New products"
- "Client retention"`

  // ── Call Anthropic ────────────────────────────────────────────────────────

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : '[]'
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const topics = JSON.parse(cleaned) as string[]

    return Response.json({ topics })
  } catch (err) {
    return Response.json({ error: `Topic suggestion failed: ${(err as Error).message}` }, { status: 500 })
  }
}
