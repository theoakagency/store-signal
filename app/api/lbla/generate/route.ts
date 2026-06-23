import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createSupabaseServiceClient } from '@/lib/supabase'

// Public endpoint — no user auth required (LBLA team tool)
// Does NOT save generations to DB

export const maxDuration = 60

const STORE_ID = '00000000-0000-0000-0000-000000000002'
const TENANT_ID = '00000000-0000-0000-0000-000000000001'

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

export async function POST(req: NextRequest) {
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
  } = body as {
    channel: 'email' | 'sms' | 'push'
    contentType?: string
    topic: string
    productFocus?: string | null
    audience?: string | null
    customAudience?: string | null
    tones?: string[]
    talkingPoints?: string | null
  }

  if (!channel || !topic) {
    return Response.json({ error: 'channel and topic are required' }, { status: 400 })
  }

  const service = createSupabaseServiceClient()

  const [{ data: styleRules }, { data: topProducts }] = await Promise.all([
    service
      .from('style_guide_rules')
      .select('category, rule')
      .eq('store_id', STORE_ID)
      .eq('active', true)
      .order('sort_order'),

    service
      .from('product_stats')
      .select('product_title, total_revenue, total_quantity_sold')
      .eq('tenant_id', TENANT_ID)
      .order('total_revenue', { ascending: false })
      .limit(5),
  ])

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

  const topProductLines = (topProducts ?? [])
    .map((p) => `  - ${p.product_title}: $${Number(p.total_revenue).toLocaleString('en-US', { maximumFractionDigits: 0 })} revenue`)
    .join('\n')

  const audienceGuidance = AUDIENCE_MAP[audience ?? ''] ?? AUDIENCE_MAP['all-lash-artists']

  const ct = contentType ?? 'product'
  let contentContextBlock = ''
  if (productFocus?.trim()) {
    contentContextBlock = `FOCUS:\n- ${productFocus}`
  }
  if (ct === 'promotion') {
    contentContextBlock = `CONTENT TYPE: Promotion\n- Focus: ${productFocus || topic}`
  }

  const systemPrompt = `You are the in-house copywriter for LashBox LA (lashboxla.com), a professional lash and lash lift supply company serving licensed lash artists and salon owners. You have deep knowledge of the lash industry.

TOP PRODUCTS FOR CONTEXT:
${topProductLines || '  (no product data available)'}
${contentContextBlock ? '\n' + contentContextBlock : ''}

BRAND VOICE:
- Educational and empowering -- teach, don't just sell
- Professional peer-to-peer -- artist to artist, not brand to consumer
- Never generic, never pushy. Specific over vague.
- Reference real concerns: client retention, technique results, restock timing, business growth
- Avoid: "game-changer", "elevate your business", "unlock your potential"
- Write like someone who understands what it means to be behind the bed managing 6+ clients a day

AUDIENCE CONTEXT:
${audienceGuidance}
${customAudience ? `Additional specificity: ${customAudience}. Factor this into the tone and references used.` : ''}
${styleBlock ? '\n' + styleBlock + '\n' : ''}
FORMATTING CONSTRAINTS -- APPLY TO EVERY FIELD INCLUDING SUBJECTS AND PREHEADERS:
- Never use em dashes (--) or en dashes (-) anywhere. Use a comma, period, or rewrite the clause instead.
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
${talkingPoints ? `Key Talking Points:\n${talkingPoints}` : ''}

Write 3 distinct versions, each taking a different angle suited to the tone(s) requested. Make the copy feel specific to LashBox LA's brand -- never generic beauty brand language.${channel === 'email' ? ' Email body should be 100-200 words, conversational but professional.' : channel === 'sms' ? ' Each SMS must be under 160 characters -- tight, clear call to action.' : ' Push title under 40 chars, message under 100 chars. High urgency, direct.'}`

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
    parsed = JSON.parse(cleaned)
  } catch (err) {
    return Response.json({ error: `Generation failed: ${(err as Error).message}` }, { status: 500 })
  }

  return Response.json({ success: true, data: parsed })
}
