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

  const [{ data: metaMetrics }, { data: metaCampaigns }, { data: googleMetrics }, { data: googleCampaigns }] = await Promise.all([
    service.from('meta_metrics_cache').select('metric_name, metric_value').eq('tenant_id', TENANT_ID),
    service.from('meta_campaigns').select('name, spend, roas, status').eq('tenant_id', TENANT_ID).order('spend', { ascending: false }).limit(10),
    service.from('google_metrics_cache').select('metric_name, metric_value').eq('tenant_id', TENANT_ID),
    service.from('google_campaigns').select('name, spend, roas, campaign_type, status').eq('tenant_id', TENANT_ID).order('spend', { ascending: false }).limit(10),
  ])

  const metaM: Record<string, number> = {}
  for (const r of metaMetrics ?? []) metaM[r.metric_name] = Number(r.metric_value)
  const googleM: Record<string, number> = {}
  for (const r of googleMetrics ?? []) googleM[r.metric_name] = Number(r.metric_value)

  const hasData = (metaMetrics?.length ?? 0) > 0 || (googleMetrics?.length ?? 0) > 0
  if (!hasData) {
    return Response.json({ insight: 'No ad platform data available. Connect Meta Ads or Google Ads and run a sync first.' })
  }

  const context = `
ADVERTISING PERFORMANCE — LashBox LA (lashboxla.com)

META ADS (30d):
- Total spend: $${(metaM['total_ad_spend_30d'] ?? 0).toFixed(0)}
- ROAS: ${(metaM['total_roas_30d'] ?? 0).toFixed(2)}×
- Cost per purchase: $${(metaM['cost_per_purchase_30d'] ?? 0).toFixed(0)}
- Purchases: ${(metaM['total_purchases_30d'] ?? 0).toFixed(0)}
- Campaigns below 1× ROAS: ${(metaM['campaigns_below_1x_roas'] ?? 0).toFixed(0)}
Top Meta campaigns:
${(metaCampaigns ?? []).map((c) => `  "${c.name}" — $${c.spend.toFixed(0)} spend, ${c.roas.toFixed(2)}× ROAS`).join('\n')}

GOOGLE ADS (30d):
- Total spend: $${(googleM['total_ad_spend_30d'] ?? 0).toFixed(0)}
- ROAS: ${(googleM['total_roas_30d'] ?? 0).toFixed(2)}×
- Cost per conversion: $${(googleM['cost_per_conversion_30d'] ?? 0).toFixed(0)}
- Conversions: ${(googleM['total_conversions_30d'] ?? 0).toFixed(0)}
- Campaigns below 1× ROAS: ${(googleM['campaigns_below_1x_roas'] ?? 0).toFixed(0)}
Top Google campaigns:
${(googleCampaigns ?? []).map((c) => `  "${c.name}" (${c.campaign_type}) — $${c.spend.toFixed(0)} spend, ${c.roas.toFixed(2)}× ROAS`).join('\n')}
`.trim()

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    messages: [{
      role: 'user',
      content: `${context}\n\nYou are an advertising strategist. Based on this data, write ONE paragraph (3-4 sentences) recommending how to allocate budget between Meta and Google Ads. Be specific — reference actual ROAS numbers, name campaigns to pause or scale, and estimate the impact. Be direct and actionable.`,
    }],
  })

  const insight = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
  return Response.json({ insight })
}
