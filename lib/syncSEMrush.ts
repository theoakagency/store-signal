import { createSupabaseServiceClient } from '@/lib/supabase'
import { getDomainOverview, getOrganicKeywords, getKeywordPositionChanges, getCompetitors, getKeywordGap, getBacklinkOverview } from '@/lib/semrush'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

export async function runSEMrushSync(apiKey: string, domain: string) {
  const service = createSupabaseServiceClient()

  // Step 1: Domain overview
  const overview = await getDomainOverview(apiKey, domain)

  // Steps 2 & 3: Keywords + position changes (parallel)
  const [keywords, lostKeywords] = await Promise.all([
    getOrganicKeywords(apiKey, domain, 100),
    getKeywordPositionChanges(apiKey, domain),
  ])

  if (keywords.length > 0) {
    const today = new Date().toISOString().slice(0, 10)
    const rows = keywords.map((k, i) => ({
      id: `${TENANT_ID}_${k.keyword.toLowerCase().replace(/\s+/g, '_').slice(0, 80)}_${i}`,
      tenant_id: TENANT_ID,
      keyword: k.keyword,
      position: k.position,
      previous_position: k.previousPosition,
      position_change: k.positionChange,
      search_volume: k.searchVolume,
      cpc: k.cpc,
      url: k.url || null,
      traffic_percent: k.trafficPercent,
      date_checked: today,
      updated_at: new Date().toISOString(),
    }))
    await service.from('semrush_keywords').upsert(rows, { onConflict: 'id' })
  }

  // Step 4: Competitors
  let competitors: Awaited<ReturnType<typeof getCompetitors>> = []
  try {
    competitors = await getCompetitors(apiKey, domain)
  } catch (e) {
    console.error('Competitors fetch error:', (e as Error).message)
  }

  if (competitors.length > 0) {
    const compRows = competitors.map((c, i) => ({
      id: `${TENANT_ID}_${c.domain.replace(/\./g, '_')}_${i}`,
      tenant_id: TENANT_ID,
      domain: c.domain,
      common_keywords: c.commonKeywords,
      organic_keywords: c.organicKeywords,
      organic_traffic: c.organicTraffic,
      organic_traffic_cost: c.organicCost,
      competition_level: c.competitionLevel,
      updated_at: new Date().toISOString(),
    }))
    await service.from('semrush_competitors').delete().eq('tenant_id', TENANT_ID)
    await service.from('semrush_competitors').insert(compRows)
  }

  // Step 5: Keyword gaps
  const allGaps: Awaited<ReturnType<typeof getKeywordGap>> = []
  for (const comp of competitors.slice(0, 3)) {
    try {
      const gaps = await getKeywordGap(apiKey, domain, comp.domain)
      allGaps.push(...gaps)
    } catch (e) {
      console.error(`Keyword gap error for ${comp.domain}:`, (e as Error).message)
    }
  }

  if (allGaps.length > 0) {
    const gapRows = allGaps.map((g, i) => ({
      id: `${TENANT_ID}_${g.keyword.toLowerCase().replace(/\s+/g, '_').slice(0, 60)}_${g.competitorDomain.replace(/\./g, '_')}_${i}`,
      tenant_id: TENANT_ID,
      keyword: g.keyword,
      competitor_domain: g.competitorDomain,
      competitor_position: g.competitorPosition,
      our_position: g.ourPosition,
      search_volume: g.searchVolume,
      opportunity_score: g.opportunityScore,
      created_at: new Date().toISOString(),
    }))
    await service.from('semrush_keyword_gaps').delete().eq('tenant_id', TENANT_ID)
    await service.from('semrush_keyword_gaps').insert(gapRows)
  }

  // Step 6: Backlinks
  let backlinks: Awaited<ReturnType<typeof getBacklinkOverview>> = { totalBacklinks: 0, referringDomains: 0, referringUrls: 0, referringIps: 0, authorityScore: 0 }
  try {
    backlinks = await getBacklinkOverview(apiKey, domain)
  } catch (e) {
    console.error('Backlinks fetch error:', (e as Error).message)
  }

  await service.from('semrush_backlinks').upsert({
    tenant_id: TENANT_ID,
    total_backlinks: backlinks.totalBacklinks,
    referring_domains: backlinks.referringDomains,
    authority_score: backlinks.authorityScore || null,
    calculated_at: new Date().toISOString(),
  }, { onConflict: 'tenant_id' })

  // Step 7: Traffic trend
  const { data: existingCache } = await service.from('semrush_metrics_cache').select('traffic_trend').eq('tenant_id', TENANT_ID).maybeSingle()
  const existingTrend = (existingCache?.traffic_trend as Array<{ date: string; organic_traffic: number; organic_keywords: number }> | null) ?? []
  const currentMonth = new Date().toISOString().slice(0, 7)
  const newPoint = { date: currentMonth, organic_traffic: overview.organicTraffic, organic_keywords: overview.organicKeywords }
  const trend = [...existingTrend.filter((m) => m.date !== currentMonth), newPoint]
    .sort((a, b) => a.date.localeCompare(b.date)).slice(-12)

  const quickWins = keywords
    .filter((k) => k.position >= 4 && k.position <= 10)
    .sort((a, b) => b.searchVolume - a.searchVolume)
    .slice(0, 20)
    .map((k) => ({ keyword: k.keyword, position: k.position, search_volume: k.searchVolume, url: k.url, traffic_percent: k.trafficPercent }))

  const lostCount = lostKeywords.filter((k) => k.positionChange > 5).length
  const gainedCount = keywords.filter((k) => k.positionChange < -1).length

  const { error: cacheError } = await service.from('semrush_metrics_cache').upsert({
    tenant_id: TENANT_ID,
    organic_keywords_total: overview.organicKeywords,
    organic_traffic_estimate: overview.organicTraffic,
    authority_score: backlinks.authorityScore || null,
    top_competitors: competitors.slice(0, 5).map((c) => ({ domain: c.domain, common_keywords: c.commonKeywords, organic_traffic: c.organicTraffic, competition_level: c.competitionLevel })),
    keyword_opportunities: quickWins,
    traffic_trend: trend,
    lost_keywords_30d: lostCount,
    gained_keywords_30d: gainedCount,
    calculated_at: new Date().toISOString(),
  }, { onConflict: 'tenant_id' })

  if (cacheError) throw new Error(`Cache write failed: ${cacheError.message}`)

  return {
    ok: true,
    synced: { keywords: keywords.length, competitors: competitors.length, keyword_gaps: allGaps.length, traffic_months: trend.length, authority_score: backlinks.authorityScore },
    metrics: { organic_keywords_total: overview.organicKeywords, organic_traffic_estimate: overview.organicTraffic, lost_keywords_30d: lostCount, gained_keywords_30d: gainedCount },
  }
}
