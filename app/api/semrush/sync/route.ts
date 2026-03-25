/**
 * POST /api/semrush/sync
 * Fetches SEMrush data and caches computed metrics.
 * Consumes ~50-150 API units per run — cache aggressively.
 */
import { NextRequest } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'
import {
  getDomainOverview,
  getOrganicKeywords,
  getKeywordPositionChanges,
  getCompetitors,
  getKeywordGap,
  getBacklinkOverview,
} from '@/lib/semrush'

export const maxDuration = 300

const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const STORE_ID  = '00000000-0000-0000-0000-000000000002'

export async function POST(req: NextRequest) {
  const isCron = req.headers.get('Authorization') === `Bearer ${process.env.CRON_SECRET ?? ''}`
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user && !isCron) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createSupabaseServiceClient()

  const { data: store } = await service
    .from('stores')
    .select('semrush_api_key, semrush_domain')
    .eq('id', STORE_ID)
    .single()

  const apiKey = (store as { semrush_api_key: string | null; semrush_domain: string | null } | null)?.semrush_api_key
  const domain = (store as { semrush_api_key: string | null; semrush_domain: string | null } | null)?.semrush_domain

  if (!apiKey || !domain) {
    return Response.json({ error: 'SEMrush not connected' }, { status: 400 })
  }

  // ── Step 1: Domain overview ──────────────────────────────────────────────────
  let overview: Awaited<ReturnType<typeof getDomainOverview>>
  try {
    overview = await getDomainOverview(apiKey, domain)
  } catch (e) {
    return Response.json({ error: `Domain overview failed: ${(e as Error).message}` }, { status: 502 })
  }

  // ── Step 2 & 3: Organic keywords + position changes (parallel) ───────────────
  let keywords: Awaited<ReturnType<typeof getOrganicKeywords>>
  let lostKeywords: Awaited<ReturnType<typeof getKeywordPositionChanges>>

  try {
    ;[keywords, lostKeywords] = await Promise.all([
      getOrganicKeywords(apiKey, domain, 100),
      getKeywordPositionChanges(apiKey, domain),
    ])
  } catch (e) {
    return Response.json({ error: `Keywords fetch failed: ${(e as Error).message}` }, { status: 502 })
  }

  // Upsert keywords
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

  // ── Step 4: Competitors ──────────────────────────────────────────────────────
  let competitors: Awaited<ReturnType<typeof getCompetitors>>
  try {
    competitors = await getCompetitors(apiKey, domain)
  } catch (e) {
    competitors = []
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
    // Replace old competitors
    await service.from('semrush_competitors').delete().eq('tenant_id', TENANT_ID)
    await service.from('semrush_competitors').insert(compRows)
  }

  // ── Step 5: Keyword gaps for top 3 competitors ───────────────────────────────
  const topCompetitors = competitors.slice(0, 3)
  const allGaps: Awaited<ReturnType<typeof getKeywordGap>> = []

  for (const comp of topCompetitors) {
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

  // ── Step 6: Backlinks ────────────────────────────────────────────────────────
  let backlinks: Awaited<ReturnType<typeof getBacklinkOverview>>
  try {
    backlinks = await getBacklinkOverview(apiKey, domain)
  } catch (e) {
    backlinks = { totalBacklinks: 0, referringDomains: 0, referringUrls: 0, referringIps: 0, authorityScore: 0 }
    console.error('Backlinks fetch error:', (e as Error).message)
  }

  await service.from('semrush_backlinks').upsert({
    tenant_id: TENANT_ID,
    total_backlinks: backlinks.totalBacklinks,
    referring_domains: backlinks.referringDomains,
    authority_score: backlinks.authorityScore || null,
    calculated_at: new Date().toISOString(),
  }, { onConflict: 'tenant_id' })

  // ── Step 7: Build traffic trend incrementally ─────────────────────────────────
  // SEMrush has no history endpoint — we accumulate one data point per sync run.
  const { data: existingCache } = await service
    .from('semrush_metrics_cache')
    .select('traffic_trend')
    .eq('tenant_id', TENANT_ID)
    .maybeSingle()

  const existingTrend = (existingCache?.traffic_trend as Array<{ date: string; organic_traffic: number; organic_keywords: number }> | null) ?? []
  const currentMonth = new Date().toISOString().slice(0, 7) // YYYY-MM
  const newPoint = { date: currentMonth, organic_traffic: overview.organicTraffic, organic_keywords: overview.organicKeywords }
  // Upsert by month — replace same month if already present, then keep last 12
  const trend = [
    ...existingTrend.filter((m) => m.date !== currentMonth),
    newPoint,
  ].sort((a, b) => a.date.localeCompare(b.date)).slice(-12)

  // ── Compute cached metrics ────────────────────────────────────────────────────

  // Quick-win opportunities: keywords in positions 4-10 sorted by search volume
  const quickWins = keywords
    .filter((k) => k.position >= 4 && k.position <= 10)
    .sort((a, b) => b.searchVolume - a.searchVolume)
    .slice(0, 20)
    .map((k) => ({
      keyword: k.keyword,
      position: k.position,
      search_volume: k.searchVolume,
      url: k.url,
      traffic_percent: k.trafficPercent,
    }))

  // Lost keywords: keywords where position increased (worse ranking) significantly
  const lostCount = lostKeywords.filter((k) => k.positionChange > 5).length
  // Gained keywords: keywords where position improved in last period
  const gainedKeywords = keywords.filter((k) => k.positionChange < -1)
  const gainedCount = gainedKeywords.length

  const topCompsForCache = competitors.slice(0, 5).map((c) => ({
    domain: c.domain,
    common_keywords: c.commonKeywords,
    organic_traffic: c.organicTraffic,
    competition_level: c.competitionLevel,
  }))

  const trafficTrendForCache = trend

  const { error: cacheError } = await service.from('semrush_metrics_cache').upsert({
    tenant_id: TENANT_ID,
    organic_keywords_total: overview.organicKeywords,
    organic_traffic_estimate: overview.organicTraffic,
    authority_score: backlinks.authorityScore || null,
    top_competitors: topCompsForCache,
    keyword_opportunities: quickWins,
    traffic_trend: trafficTrendForCache,
    lost_keywords_30d: lostCount,
    gained_keywords_30d: gainedCount,
    calculated_at: new Date().toISOString(),
  }, { onConflict: 'tenant_id' })

  if (cacheError) {
    console.error('SEMrush metrics cache error:', cacheError.message)
    return Response.json({ error: `Cache write failed: ${cacheError.message}` }, { status: 500 })
  }

  return Response.json({
    ok: true,
    synced: {
      keywords: keywords.length,
      competitors: competitors.length,
      keyword_gaps: allGaps.length,
      traffic_months: trend.length,
      authority_score: backlinks.authorityScore,
    },
    metrics: {
      organic_keywords_total: overview.organicKeywords,
      organic_traffic_estimate: overview.organicTraffic,
      lost_keywords_30d: lostCount,
      gained_keywords_30d: gainedCount,
    },
  })
}
