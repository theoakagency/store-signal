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

  const [{ data: metaCampaigns }, { data: googleCampaigns }] = await Promise.all([
    service.from('meta_campaigns').select('name, spend, roas, status, purchases, purchase_value').eq('tenant_id', TENANT_ID).order('spend', { ascending: false }).limit(15),
    service.from('google_campaigns').select('name, spend, roas, campaign_type, status, conversions, conversion_value, data_source').eq('tenant_id', TENANT_ID).order('conversion_value', { ascending: false }).limit(10),
  ])

  const hasData = (metaCampaigns?.length ?? 0) > 0 || (googleCampaigns?.length ?? 0) > 0
  if (!hasData) {
    return Response.json({ insight: 'No ad platform data available. Connect Meta Ads or Google Ads and run a sync first.' })
  }

  const now = new Date()
  const d90Start = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
  const fmtDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const window90 = `${fmtDate(d90Start)} – ${fmtDate(now)}`

  // Meta rollup
  const metaSpend = (metaCampaigns ?? []).reduce((s, c) => s + c.spend, 0)
  const metaRevenue = (metaCampaigns ?? []).reduce((s, c) => s + c.purchase_value, 0)
  const metaPurchases = (metaCampaigns ?? []).reduce((s, c) => s + c.purchases, 0)
  const metaRoas = metaSpend > 0 ? metaRevenue / metaSpend : 0
  const metaCpp = metaPurchases > 0 ? metaSpend / metaPurchases : 0
  const metaPaused = (metaCampaigns ?? []).filter((c) => c.status?.toLowerCase() === 'paused')
  const metaPausedHighRoas = metaPaused.filter((c) => c.roas >= 3)

  // Google rollup — GA4 fallback if spend is $0 across all campaigns
  const googleIsGa4 = (googleCampaigns ?? []).every((c) => c.data_source === 'ga4')
  const googleRevenue = (googleCampaigns ?? []).reduce((s, c) => s + (c.conversion_value ?? 0), 0)
  const googleConversions = (googleCampaigns ?? []).reduce((s, c) => s + (c.conversions ?? 0), 0)
  const googleSpend = (googleCampaigns ?? []).reduce((s, c) => s + c.spend, 0)

  const metaSection = metaSpend > 0 ? `
META ADS — last 90 days (${window90}):
- Total spend: $${metaSpend.toFixed(0)}
- Total revenue: $${metaRevenue.toFixed(0)}
- ROAS: ${metaRoas.toFixed(2)}×
- Purchases: ${metaPurchases}
- Cost per purchase: $${metaCpp.toFixed(2)}
- Paused campaigns with ROAS ≥3×: ${metaPausedHighRoas.length} (potential budget opportunity)
Top campaigns by spend:
${(metaCampaigns ?? []).slice(0, 8).map((c) => `  "${c.name}" — $${c.spend.toFixed(0)} spend, ${c.roas?.toFixed(2) ?? '0'}× ROAS, ${c.purchases} purchases [${c.status}]`).join('\n')}` : 'Meta: not connected'

  const googleSection = googleIsGa4 ? `
GOOGLE ADS — GA4 data, last 90 days (${window90}) — direct spend pending API approval:
- Revenue attributed to Google campaigns (from GA4): $${googleRevenue.toFixed(0)}
- Conversions: ${googleConversions.toFixed(0)}
- Spend: unknown (Google Ads API developer token pending approval)
Top campaigns by revenue:
${(googleCampaigns ?? []).slice(0, 5).map((c) => `  "${c.name}" — $${(c.conversion_value ?? 0).toFixed(0)} revenue, ${(c.conversions ?? 0).toFixed(0)} conversions [GA4]`).join('\n')}` : googleSpend > 0 ? `
GOOGLE ADS — last 90 days (${window90}):
- Spend: $${googleSpend.toFixed(0)}
- Revenue: $${googleRevenue.toFixed(0)}
- Conversions: ${googleConversions.toFixed(0)}
Top campaigns:
${(googleCampaigns ?? []).slice(0, 5).map((c) => `  "${c.name}" — $${c.spend.toFixed(0)} spend, ${c.roas?.toFixed(2) ?? '0'}× ROAS`).join('\n')}` : 'Google Ads: not connected'

  const context = `
ADVERTISING PERFORMANCE — LashBox LA (lashboxla.com)
DATA NOTE: All figures cover the last 90 days (${window90}). Do not compare these figures to metrics from other time windows.
${metaSection}
${googleSection}
`.trim()

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 450,
    messages: [{
      role: 'user',
      content: `${context}

You are an advertising strategist. Write ONE paragraph (4-5 sentences) recommending how to allocate budget. Be specific:
- Reference exact ROAS numbers and spend figures
- If Meta has paused campaigns with high ROAS, flag them as budget opportunities (these campaigns were paused but were performing well)
- If Google data is from GA4 (no spend data), note the gap and suggest running both platforms together once Google Ads API is approved
- Give a concrete budget recommendation (shift X% toward the better-performing platform)
Be direct and actionable — no filler.`,
    }],
  })

  const insight = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
  return Response.json({ insight })
}
