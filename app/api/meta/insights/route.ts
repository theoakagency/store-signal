import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'

export const maxDuration = 30

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

export async function POST(_req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createSupabaseServiceClient()
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const { data: campaigns } = await service
    .from('meta_campaigns')
    .select('name, status, objective, spend, impressions, clicks, ctr, purchases, purchase_value, roas')
    .eq('tenant_id', TENANT_ID)
    .order('spend', { ascending: false })

  if (!campaigns || campaigns.length === 0) {
    return Response.json({ error: 'No campaign data — run a sync first' }, { status: 400 })
  }

  const totalSpend = campaigns.reduce((s, c) => s + c.spend, 0)
  const active = campaigns.filter((c) => c.status === 'ACTIVE')
  const paused = campaigns.filter((c) => c.status === 'PAUSED' && c.spend > 0)
  const pausedHighRoas = paused.filter((c) => c.roas >= 1.5).sort((a, b) => b.roas - a.roas)

  const campaignList = campaigns
    .filter((c) => c.spend > 0)
    .map((c) => {
      const funnel = inferFunnelStage(c.name, c.objective ?? '')
      return `- "${c.name}" [${c.status}] [${funnel}]: $${c.spend.toFixed(0)} spend, ${c.roas.toFixed(2)}× ROAS, ${c.purchases} purchases, ${c.ctr.toFixed(2)}% CTR`
    })
    .join('\n')

  const prompt = `You are a Meta Ads strategist analyzing the campaign portfolio for LashBox LA (lashboxla.com), a professional eyelash extension supply brand.

ACCOUNT OVERVIEW (last 90 days):
- Total spend: $${totalSpend.toFixed(0)}
- Active campaigns: ${active.length}
- Paused campaigns with significant spend: ${paused.length}
- Paused campaigns with ROAS ≥ 1.5×: ${pausedHighRoas.map((c) => `"${c.name}" (${c.roas.toFixed(2)}×)`).join(', ') || 'none'}

ALL CAMPAIGNS WITH SPEND:
${campaignList}

Answer these three questions with specific data references:

1. PAUSED HIGH-ROAS CAMPAIGNS: Why might the highest-ROAS campaigns be paused despite strong performance? Give 2-3 specific hypotheses based on the campaign names and objectives. What should the team investigate before reactivating?

2. BUDGET REALLOCATION: If $5,000/month were shifted from the lowest-performing active campaigns to the top performers (by ROAS), estimate the revenue impact. Be specific about which campaigns to reduce and which to scale.

3. FUNNEL ANALYSIS: Based on the campaign names (TOF/MOF/BOF/CRM signals), assess the sophistication of this ad strategy. Are they over-investing in any funnel stage? What is missing?

Return ONLY valid JSON (no markdown):
{
  "paused_analysis": "3-4 sentences",
  "budget_reallocation": "3-4 sentences with specific $ estimates",
  "funnel_analysis": "3-4 sentences on funnel structure and gaps"
}`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : '{}'
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    return Response.json(JSON.parse(cleaned))
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 })
  }
}

function inferFunnelStage(name: string, objective: string): string {
  const n = name.toLowerCase()
  const o = objective.toLowerCase()
  if (n.includes('tof') || n.includes('top of') || n.includes('prospecting') || n.includes('prosp') || o.includes('brand_awareness') || o.includes('reach')) return 'TOF'
  if (n.includes('mof') || n.includes('middle of') || n.includes('consideration') || o.includes('traffic') || o.includes('engagement') || o.includes('video_views')) return 'MOF'
  if (n.includes('bof') || n.includes('bottom of') || n.includes('retarget') || n.includes('rta') || o.includes('conversions') || o.includes('catalog')) return 'BOF'
  if (n.includes('crm') || n.includes('customer') || n.includes('lal') || n.includes('lookalike') || n.includes('loyal')) return 'CRM'
  if (o.includes('conversions') || o.includes('purchase')) return 'BOF'
  return 'Unknown'
}
