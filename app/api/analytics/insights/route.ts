import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'

export const maxDuration = 60

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

export interface AnalyticsInsight {
  title: string
  description: string
  metric: string
  action: string
  priority: 'Low' | 'Medium' | 'High'
}

export async function POST(_req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createSupabaseServiceClient()

  const [
    { data: sessions },
    { data: pages },
    { data: monthly },
    { data: metaMetrics },
  ] = await Promise.all([
    service.from('analytics_sessions').select('channel, sessions, conversions, revenue').eq('tenant_id', TENANT_ID).eq('date_range', '90d').order('sessions', { ascending: false }),
    service.from('analytics_pages').select('page_path, sessions, conversions').eq('tenant_id', TENANT_ID).order('sessions', { ascending: false }).limit(10),
    service.from('analytics_monthly').select('month, sessions').eq('tenant_id', TENANT_ID).order('month', { ascending: true }),
    service.from('meta_metrics_cache').select('metric_name, metric_value').eq('tenant_id', TENANT_ID),
  ])

  if ((sessions ?? []).length === 0) {
    return Response.json({ error: 'No analytics data — sync GA4 first' }, { status: 400 })
  }

  const meta: Record<string, number> = {}
  for (const r of metaMetrics ?? []) meta[r.metric_name] = Number(r.metric_value)

  const totalSessions = (sessions ?? []).reduce((s, r) => s + r.sessions, 0)

  const last2 = (monthly ?? []).slice(-2)
  const momPct = last2.length === 2 && last2[0].sessions > 0
    ? ((last2[1].sessions - last2[0].sessions) / last2[0].sessions) * 100
    : null

  const channelLines = (sessions ?? []).map((r) => {
    const cvr = r.sessions > 0 ? ((r.conversions / r.sessions) * 100).toFixed(1) : '0.0'
    const share = totalSessions > 0 ? ((r.sessions / totalSessions) * 100).toFixed(0) : '0'
    return `- ${r.channel}: ${r.sessions.toLocaleString()} sessions (${share}% share), CVR ${cvr}%, Revenue $${Math.round(r.revenue)}`
  })

  const pageLines = (pages ?? []).slice(0, 8).map((p) => {
    const cvr = p.sessions > 0 ? ((p.conversions / p.sessions) * 100).toFixed(1) : '0.0'
    return `- ${p.page_path}: ${p.sessions.toLocaleString()} sessions, CVR ${cvr}%`
  })

  const sections: string[] = []

  sections.push(`CHANNEL PERFORMANCE (90d):
${channelLines.join('\n')}
Month-over-month sessions: ${momPct != null ? `${momPct >= 0 ? '+' : ''}${momPct.toFixed(1)}%` : 'insufficient data'}`)

  if (pageLines.length > 0) {
    sections.push(`TOP LANDING PAGES (90d):
${pageLines.join('\n')}`)
  }

  if (Object.keys(meta).length > 0) {
    sections.push(`META ADS (30d) — for cross-platform context:
- Spend: $${(meta['total_ad_spend_30d'] ?? 0).toFixed(0)}
- ROAS: ${(meta['total_roas_30d'] ?? 0).toFixed(2)}×
- Cost per purchase: $${(meta['cost_per_purchase_30d'] ?? 0).toFixed(0)}
- Purchases: ${(meta['total_purchases_30d'] ?? 0).toFixed(0)}`)
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const prompt = `${sections.join('\n\n')}

You are analyzing Google Analytics 4 data for LashBox LA (lashboxla.com), a professional eyelash extension supply store. Generate 4 actionable insights. Focus on:
1. Channel efficiency — especially CVR gaps between paid channels (e.g. Paid Social vs Paid Search) and what they mean for budget allocation
2. The session trend (month-over-month) — which channels likely drive the change and what to do
3. Landing page optimization — what the high-CVR pages reveal about intent and content that converts
4. Cross-platform connection — link the GA4 channel data to Meta Ads spend/ROAS to identify where budget should shift

Return ONLY a valid JSON array (no markdown fences):
[
  {
    "title": "Short insight title",
    "description": "2-3 sentences explaining what the data reveals and why it matters",
    "metric": "The key stat driving this insight",
    "action": "1-2 sentence specific next step",
    "priority": "Low" | "Medium" | "High"
  }
]`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : '[]'
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const insights = JSON.parse(cleaned) as AnalyticsInsight[]

    return Response.json({ insights })
  } catch (err) {
    return Response.json({ error: `AI analysis failed: ${(err as Error).message}` }, { status: 500 })
  }
}
