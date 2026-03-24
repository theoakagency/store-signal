import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

export const maxDuration = 30

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { page } = await req.json()
  if (!page) return Response.json({ error: 'Missing page URL' }, { status: 400 })

  const service = createSupabaseServiceClient()
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const [{ data: keywords }, { data: monthly }, { data: pageData }] = await Promise.all([
    service
      .from('gsc_keywords')
      .select('query, clicks, impressions, ctr, position')
      .eq('tenant_id', TENANT_ID)
      .order('clicks', { ascending: false })
      .limit(20),
    service
      .from('gsc_monthly_clicks')
      .select('month, clicks')
      .eq('tenant_id', TENANT_ID)
      .order('month', { ascending: true }),
    service
      .from('gsc_pages')
      .select('page, clicks, impressions, ctr, position, clicks_prior')
      .eq('tenant_id', TENANT_ID)
      .eq('page', page)
      .maybeSingle(),
  ])

  const total90d = (monthly ?? []).slice(-3).reduce((s, m) => s + m.clicks, 0)
  const prior90d = (monthly ?? []).slice(-6, -3).reduce((s, m) => s + m.clicks, 0)
  const sitewideTrend = prior90d > 0
    ? `${(((total90d - prior90d) / prior90d) * 100).toFixed(1)}% vs prior 90 days (sitewide)`
    : 'unknown sitewide trend'

  const path = page.replace(/^https?:\/\/[^/]+/, '') || '/'

  const prompt = `You are an SEO consultant diagnosing why a specific page is losing organic search traffic.

STORE: LashBox LA (lashboxla.com) — professional eyelash extension supply store for lash artists
SITEWIDE CLICK TREND: ${sitewideTrend}

PAGE LOSING TRAFFIC:
URL: ${page}
Path: ${path}
Current 90d clicks: ${pageData?.clicks ?? 'N/A'}
Prior 90d clicks: ${pageData?.clicks_prior ?? 'N/A'}
Click drop: ${pageData ? (pageData.clicks_prior - pageData.clicks) : 'N/A'}
Impressions: ${pageData?.impressions ?? 'N/A'}
CTR: ${pageData?.ctr != null ? (pageData.ctr * 100).toFixed(1) + '%' : 'N/A'}
Position: ${pageData?.position?.toFixed(1) ?? 'N/A'}

TOP SITE KEYWORDS (for context on what the site ranks for):
${(keywords ?? []).slice(0, 10).map((k) => `"${k.query}" — pos ${(k.position ?? 0).toFixed(1)}, ${k.clicks} clicks`).join('\n')}

Based on the page path ("${path}"), traffic data, and site keyword context, provide a concise diagnosis explaining the most likely reason for the traffic decline and one specific recommended action. Reference the actual URL path and numbers.

Return ONLY valid JSON (no markdown):
{"diagnosis": "2-3 sentences explaining the likely cause", "action": "1-2 sentences with a specific next step"}`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : '{}'
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    return Response.json(JSON.parse(cleaned))
  } catch (err) {
    return Response.json({ error: `Diagnosis failed: ${(err as Error).message}` }, { status: 500 })
  }
}
