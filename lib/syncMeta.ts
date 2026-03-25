import { createSupabaseServiceClient } from '@/lib/supabase'
import { getCampaigns, getAccountInsights } from '@/lib/meta'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

export async function runMetaSync(token: string, accountId: string) {
  const service = createSupabaseServiceClient()

  const [campaigns, summary30d] = await Promise.all([
    getCampaigns(token, accountId, 'last_90d'),
    getAccountInsights(token, accountId, 'last_30d'),
  ])

  if (campaigns.length > 0) {
    const rows = campaigns.map((c) => ({
      id: c.id,
      tenant_id: TENANT_ID,
      name: c.name,
      status: c.status,
      objective: c.objective,
      spend: c.spend,
      impressions: c.impressions,
      clicks: c.clicks,
      ctr: c.ctr,
      cpc: c.cpc,
      cpm: c.cpm,
      purchases: c.purchases,
      purchase_value: c.purchase_value,
      roas: c.roas,
      reach: c.reach,
      frequency: c.frequency,
      date_start: c.date_start || null,
      date_stop: c.date_stop || null,
      updated_at: new Date().toISOString(),
    }))

    const { error } = await service.from('meta_campaigns').upsert(rows, { onConflict: 'id' })
    if (error) throw new Error(`Campaigns upsert failed: ${error.message}`)
  }

  const activeCampaigns = campaigns.filter((c) => c.status === 'ACTIVE')
  const belowOneRoas = campaigns.filter((c) => c.spend > 0 && c.roas < 1)
  const best = campaigns.reduce((b, c) => (c.roas > b.roas ? c : b), campaigns[0])
  const worst = campaigns.filter((c) => c.spend > 0).reduce((w, c) => (c.roas < w.roas ? c : w), campaigns.find((c) => c.spend > 0) ?? campaigns[0])
  const totalSpend30 = summary30d.spend
  const totalPurchases30 = summary30d.purchases
  const cpp30 = totalPurchases30 > 0 ? totalSpend30 / totalPurchases30 : 0

  const metricRows = [
    { metric_name: 'total_ad_spend_30d',     metric_value: totalSpend30 },
    { metric_name: 'total_roas_30d',          metric_value: summary30d.roas },
    { metric_name: 'cost_per_purchase_30d',   metric_value: cpp30 },
    { metric_name: 'total_purchases_30d',     metric_value: totalPurchases30 },
    { metric_name: 'campaigns_below_1x_roas', metric_value: belowOneRoas.length },
    { metric_name: 'active_campaign_count',   metric_value: activeCampaigns.length },
    { metric_name: 'best_campaign_roas',      metric_value: best?.roas ?? 0 },
    { metric_name: 'worst_campaign_roas',     metric_value: worst?.roas ?? 0 },
  ]

  await service.from('meta_metrics_cache').upsert(
    metricRows.map((m) => ({ tenant_id: TENANT_ID, ...m, calculated_at: new Date().toISOString() })),
    { onConflict: 'tenant_id,metric_name' }
  )

  return {
    synced: campaigns.length,
    best_campaign: best?.name ?? null,
    worst_campaign: worst?.name ?? null,
    total_spend_30d: totalSpend30,
    roas_30d: summary30d.roas,
    campaigns_below_1x: belowOneRoas.length,
  }
}
