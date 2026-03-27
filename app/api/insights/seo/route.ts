import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'

export const maxDuration = 60

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

export async function POST(_req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createSupabaseServiceClient()

  const [{ data: metrics }, { data: lostKeywords }, { data: gaps }, { data: competitors }] = await Promise.all([
    service.from('semrush_metrics_cache').select('*').eq('tenant_id', TENANT_ID).maybeSingle(),
    service
      .from('semrush_keywords')
      .select('keyword, position, previous_position, position_change, search_volume')
      .eq('tenant_id', TENANT_ID)
      .gt('position_change', 5)
      .order('search_volume', { ascending: false })
      .limit(10),
    service
      .from('semrush_keyword_gaps')
      .select('keyword, competitor_domain, competitor_position, our_position, search_volume')
      .eq('tenant_id', TENANT_ID)
      .order('search_volume', { ascending: false })
      .limit(15),
    service
      .from('semrush_competitors')
      .select('domain, common_keywords, organic_traffic')
      .eq('tenant_id', TENANT_ID)
      .order('common_keywords', { ascending: false })
      .limit(5),
  ])

  if (!metrics) {
    return Response.json({ error: 'No SEMrush data available — sync first' }, { status: 400 })
  }

  const trend = (metrics.traffic_trend as Array<{ date: string; organic_traffic: number }> | null) ?? []
  const latestTraffic = trend[trend.length - 1]?.organic_traffic ?? 0
  const priorTraffic = trend[trend.length - 3]?.organic_traffic ?? 0
  const trafficChange = priorTraffic > 0
    ? ((latestTraffic - priorTraffic) / priorTraffic * 100).toFixed(1) + '%'
    : 'N/A'

  const now = new Date()
  const d30Start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const d90Start = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
  const fmtDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const window30 = `${fmtDate(d30Start)} – ${fmtDate(now)}`
  const window90 = `${fmtDate(d90Start)} – ${fmtDate(now)}`

  const context = `
SEO DATA SUMMARY — LashBox LA (lashboxla.com)
DATA NOTE: Keyword rankings are current snapshot. Traffic trend covers last 90 days (${window90}). Gained/lost counts cover last 30 days (${window30}).
- Organic keywords ranking: ${metrics.organic_keywords_total?.toLocaleString() ?? 'unknown'}
- Est. monthly organic traffic: ${metrics.organic_traffic_estimate?.toLocaleString() ?? 'unknown'}
- Traffic change (last 90 days, ${window90}): ${trafficChange}
- Keywords lost (last 30 days, ${window30}): ${metrics.lost_keywords_30d ?? 0}
- Keywords gained (last 30 days, ${window30}): ${metrics.gained_keywords_30d ?? 0}

TOP COMPETITORS (current snapshot):
${(competitors ?? []).map((c) => `- ${c.domain}: ${c.common_keywords} common keywords, ~${c.organic_traffic?.toLocaleString()} organic traffic`).join('\n')}

LOST RANKINGS — last 30 days (${window30}), top by search volume:
${(lostKeywords ?? []).map((k) => `- "${k.keyword}": was #${k.previous_position}, now #${k.position} (dropped ${k.position_change}, ${k.search_volume?.toLocaleString()} monthly searches)`).join('\n')}

KEYWORD GAPS — competitor ranking, we're not (current snapshot):
${(gaps ?? []).map((g) => `- "${g.keyword}": ${g.competitor_domain} ranks #${g.competitor_position}, we rank ${g.our_position ? '#' + g.our_position : 'not at all'} (${g.search_volume?.toLocaleString()} monthly searches)`).join('\n')}

QUICK WIN OPPORTUNITIES — positions 4-10 (current snapshot):
${((metrics.keyword_opportunities as Array<{ keyword: string; position: number; search_volume: number }> | null) ?? []).slice(0, 5).map((k) => `- "${k.keyword}": position #${k.position}, ${k.search_volume?.toLocaleString()} monthly searches`).join('\n')}
`.trim()

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    messages: [{
      role: 'user',
      content: `You are an SEO analyst for a beauty/lash brand (LashBox LA). Analyze this SEMrush data and provide specific, actionable insights in 4 concise bullet points covering: (1) why traffic is trending the way it is, (2) the highest-priority lost ranking to recover and why, (3) the best keyword gap opportunity and the content needed to capture it, and (4) the single most important SEO action to take in the next 30 days. Be specific and data-driven — reference actual keywords and numbers. Keep each bullet to 2-3 sentences max.

${context}`,
    }],
  })

  const insight = message.content[0].type === 'text' ? message.content[0].text : ''
  return Response.json({ insight })
}
