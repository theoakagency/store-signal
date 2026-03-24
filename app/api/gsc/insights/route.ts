import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

export const maxDuration = 60

// ── GET: return cached insights ───────────────────────────────────────────────

export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createSupabaseServiceClient()
  const { data } = await service
    .from('gsc_insights_cache')
    .select('insights, calculated_at')
    .eq('tenant_id', TENANT_ID)
    .maybeSingle()

  return Response.json({
    insights: data?.insights ?? [],
    calculated_at: data?.calculated_at ?? null,
  })
}

// ── POST: regenerate insights via Claude ─────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createSupabaseServiceClient()
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  // Fetch all data in parallel
  const [{ data: keywords }, { data: pages }, { data: monthly }] = await Promise.all([
    service
      .from('gsc_keywords')
      .select('query, clicks, impressions, ctr, position')
      .eq('tenant_id', TENANT_ID)
      .order('clicks', { ascending: false })
      .limit(50),
    service
      .from('gsc_pages')
      .select('page, clicks, impressions, ctr, position, clicks_prior')
      .eq('tenant_id', TENANT_ID)
      .order('clicks', { ascending: false })
      .limit(100),
    service
      .from('gsc_monthly_clicks')
      .select('month, clicks, impressions')
      .eq('tenant_id', TENANT_ID)
      .order('month', { ascending: true }),
  ])

  if (!keywords || keywords.length === 0) {
    return Response.json({ error: 'No GSC data available — run a sync first' }, { status: 400 })
  }

  // Compute overview metrics
  const total90d = (monthly ?? []).slice(-3).reduce((s, m) => s + m.clicks, 0)
  const prior90d = (monthly ?? []).slice(-6, -3).reduce((s, m) => s + m.clicks, 0)
  const totalImpr90d = (monthly ?? []).slice(-3).reduce((s, m) => s + m.impressions, 0)
  const priorImpr90d = (monthly ?? []).slice(-6, -3).reduce((s, m) => s + m.impressions, 0)
  const clickDeltaPct = prior90d > 0 ? ((total90d - prior90d) / prior90d) * 100 : 0
  const imprDeltaPct = priorImpr90d > 0 ? ((totalImpr90d - priorImpr90d) / priorImpr90d) * 100 : 0

  const kwWithCtr = keywords.filter((k) => k.ctr != null)
  const avgCTR = kwWithCtr.length > 0
    ? kwWithCtr.reduce((s, k) => s + (k.ctr ?? 0), 0) / kwWithCtr.length
    : 0
  const kwWithPos = keywords.filter((k) => k.position != null)
  const avgPos = kwWithPos.length > 0
    ? kwWithPos.reduce((s, k) => s + (k.position ?? 0), 0) / kwWithPos.length
    : 0
  const page2Plus = kwWithPos.filter((k) => (k.position ?? 0) > 20).length

  // Key keyword/page groups
  const top10ByClicks = keywords.slice(0, 10)
  const highImpLowCtr = keywords
    .filter((k) => k.impressions > 100 && (k.ctr ?? 1) < 0.03)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 10)
  const quickWins = kwWithPos
    .filter((k) => (k.position ?? 0) >= 4 && (k.position ?? 0) <= 10)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 10)
  const losingPages = (pages ?? [])
    .filter((p) => p.clicks_prior > p.clicks && p.clicks_prior > 10)
    .sort((a, b) => (b.clicks_prior - b.clicks) - (a.clicks_prior - a.clicks))
    .slice(0, 10)
  const highImpLowCtrPages = (pages ?? [])
    .filter((p) => p.impressions > 200 && (p.ctr ?? 1) < 0.02)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 5)

  // Format helpers
  const fmtKw = (k: typeof keywords[0]) =>
    `"${k.query}" — ${k.clicks} clicks, ${k.impressions} impressions, ${((k.ctr ?? 0) * 100).toFixed(1)}% CTR, position ${(k.position ?? 0).toFixed(1)}`
  const fmtPage = (p: NonNullable<typeof pages>[0]) =>
    `${p.page.replace(/^https?:\/\/[^/]+/, '') || '/'} — ${p.clicks} clicks now (was ${p.clicks_prior}), ${p.impressions} impressions, ${((p.ctr ?? 0) * 100).toFixed(1)}% CTR, pos ${(p.position ?? 0).toFixed(1)}`

  const dataStr = `
OVERVIEW (last 90 days vs prior 90 days):
- Total clicks: ${total90d.toLocaleString()} (${clickDeltaPct >= 0 ? '+' : ''}${clickDeltaPct.toFixed(1)}%)
- Total impressions: ${totalImpr90d.toLocaleString()} (${imprDeltaPct >= 0 ? '+' : ''}${imprDeltaPct.toFixed(1)}%)
- Average CTR: ${(avgCTR * 100).toFixed(2)}%
- Average position: ${avgPos.toFixed(1)}
- Keywords on page 2+ (position > 20): ${page2Plus}

TOP 10 KEYWORDS BY CLICKS:
${top10ByClicks.map((k, i) => `${i + 1}. ${fmtKw(k)}`).join('\n')}

HIGH IMPRESSION / LOW CTR KEYWORDS (CTR < 3%):
${highImpLowCtr.length > 0
    ? highImpLowCtr.map((k, i) => `${i + 1}. ${fmtKw(k)}`).join('\n')
    : 'None identified'}

POSITION 4–10 KEYWORDS (quick win opportunities — almost page 1):
${quickWins.length > 0
    ? quickWins.map((k, i) => `${i + 1}. ${fmtKw(k)}`).join('\n')
    : 'None identified'}

PAGES WITH BIGGEST TRAFFIC DECLINE:
${losingPages.length > 0
    ? losingPages.map((p, i) => `${i + 1}. ${fmtPage(p)}`).join('\n')
    : 'No significant declines detected'}

PAGES WITH HIGH IMPRESSIONS BUT LOW CTR (< 2%):
${highImpLowCtrPages.length > 0
    ? highImpLowCtrPages.map((p, i) => `${i + 1}. ${fmtPage(p)}`).join('\n')
    : 'None identified'}
`.trim()

  const systemPrompt = `You are analyzing Google Search Console data for LashBox LA (lashboxla.com), a professional eyelash extension supply store that sells to lash artists and estheticians. The site has been experiencing declining organic traffic. Analyze the search data provided and give specific, actionable insights. Focus on: quick wins (keywords close to page 1), CTR improvement opportunities (high impressions but low clicks suggesting meta description or title issues), content gaps, and the overall health of their organic search presence. Be direct and specific — reference actual keyword names and page URLs from the data.`

  const userPrompt = `${dataStr}

Generate 5–7 specific, actionable insights. Return ONLY a valid JSON array (no markdown, no code fences):
[
  {
    "category": "Quick Win" | "CTR Opportunity" | "Traffic Loss" | "Content Gap" | "Technical",
    "title": "Specific insight title referencing actual data",
    "description": "2–3 sentences with specific data points from the search data above",
    "action": "1–2 sentences with concrete next step the team can take this week",
    "impact": "Low" | "Medium" | "High"
  }
]`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : '[]'
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const insights = JSON.parse(cleaned)

    // Cache the results
    const now = new Date().toISOString()
    await service
      .from('gsc_insights_cache')
      .upsert({ tenant_id: TENANT_ID, insights, calculated_at: now }, { onConflict: 'tenant_id' })

    return Response.json({ insights, calculated_at: now })
  } catch (err) {
    return Response.json({ error: `AI analysis failed: ${(err as Error).message}` }, { status: 500 })
  }
}
