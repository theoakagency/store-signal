import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'

// NO AI CALLS from cron — this is a user-triggered endpoint only

export const maxDuration = 60

const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const STORE_ID  = '00000000-0000-0000-0000-000000000002'

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
    { data: focusProduct },
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

    productFocus
      ? service
          .from('product_stats')
          .select('product_title, total_revenue, total_quantity_sold, repeat_purchase_rate')
          .eq('tenant_id', TENANT_ID)
          .ilike('product_title', `%${productFocus}%`)
          .order('total_revenue', { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

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

  // Specific product block (if selected)
  const fp = focusProduct as {
    product_title: string
    total_revenue: number
    total_quantity_sold: number
    repeat_purchase_rate: number
  } | null
  const focusProductBlock = fp
    ? `Selected product stats: "${fp.product_title}", ${fp.total_quantity_sold?.toLocaleString()} units sold, $${Number(fp.total_revenue).toLocaleString('en-US', { maximumFractionDigits: 0 })} total revenue, ${(Number(fp.repeat_purchase_rate) * 100).toFixed(0)}% repeat purchase rate`
    : productFocus
    ? `Selected product: "${productFocus}" (no detailed stats available)`
    : null

  const emailPerfBlock = avgOpenRate !== null
    ? `Current email performance baseline: ${(avgOpenRate * 100).toFixed(1)}% avg open rate, ${avgClickRate !== null ? (avgClickRate * 100).toFixed(1) + '%' : 'N/A'} avg click rate`
    : 'Email performance data not yet synced'

  // ── Prompts ───────────────────────────────────────────────────────────────

  const systemPrompt = `You are the in-house copywriter for LashBox LA (lashboxla.com), a professional lash and lash lift supply company serving licensed lash artists and salon owners. You have deep knowledge of the lash industry.

LIVE STORE CONTEXT (use this to make copy specific and grounded):
Top products by revenue:
${topProductLines || '  (no product data synced yet)'}
${emailPerfBlock}
Customer segments:
${segmentLines || '  (no segment data synced yet)'}
${focusProductBlock ? focusProductBlock : ''}

BRAND VOICE:
- Educational and empowering — teach, don't just sell
- Professional peer-to-peer — artist to artist, not brand to consumer
- Never generic, never pushy. Specific over vague.
- Reference real concerns: client retention, technique results, restock timing, business growth
- Avoid: "game-changer", "elevate your business", "unlock your potential"
- Write like someone who understands what it means to be behind the bed managing 6+ clients a day

AUDIENCE: Licensed lash artists who are professional restockers, not impulse buyers. 3-12 month adoption arc for new techniques. They care about retention time, client satisfaction, application speed, consistency of results.

STYLE RULES — FOLLOW STRICTLY:
- Never use em dashes (—) or en dashes (–) anywhere in the output. Use a comma, period, or rewrite the sentence instead.
- Never use the word "game-changer" or "game changer"
- Never use "elevate", "unlock", "empower" as verbs directed at the reader
- Never open an email with "I hope this finds you well" or any variant
- Never use exclamation points more than once per version
- Write in second person ("you", "your clients") not third person ("lash artists")
- Sentence length should vary — mix short punchy sentences with longer ones. Avoid uniform rhythm.
- Never use the Oxford comma
- Numbers under 10 are written out (one, two, three). 10 and above use numerals.

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
