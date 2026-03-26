/**
 * Core Google Search Console sync logic, extracted so it can be called from
 * both the manual POST /api/gsc/sync route and the automated cron job.
 */
import { createSupabaseServiceClient } from '@/lib/supabase'
import {
  refreshAccessToken,
  querySearchAnalytics,
  toGscDate,
  toMonthStart,
  GscRow,
} from '@/lib/gsc'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const STORE_ID  = '00000000-0000-0000-0000-000000000002'

export interface GscSyncResult {
  keywords: number
  pages: number
  months: number
  errors: string[]
  resolvedSiteUrl: string | null
}

export async function runGscSync(
  refreshToken: string,
  propertyUrl: string | null,
): Promise<GscSyncResult> {
  const service = createSupabaseServiceClient()

  const results: GscSyncResult & {
    availableProperties: string[]
    dateRange: Record<string, string>
  } = {
    keywords: 0, pages: 0, months: 0,
    errors: [] as string[],
    availableProperties: [] as string[],
    resolvedSiteUrl: null as string | null,
    dateRange: {} as Record<string, string>,
  }

  const storedUrl = propertyUrl

  let accessToken: string
  try {
    accessToken = await refreshAccessToken(refreshToken)
  } catch (err) {
    throw new Error(`Auth failed: ${(err as Error).message}`)
  }

  // ── List all verified properties ─────────────────────────────────────────────
  try {
    const sitesRes = await fetch('https://www.googleapis.com/webmasters/v3/sites', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const sitesJson = await sitesRes.json()
    results.availableProperties = (sitesJson.siteEntry ?? []).map(
      (s: { siteUrl: string }) => s.siteUrl
    )
  } catch (err) {
    results.errors.push(`sites.list: ${(err as Error).message}`)
  }

  // ── Resolve the correct siteUrl to query ─────────────────────────────────────
  // Try candidates in priority order: stored value → with trailing slash → www variant → domain property
  const base = (storedUrl ?? '').replace(/\/$/, '') // strip trailing slash
  const noProto = base.replace(/^https?:\/\//, '')  // e.g. lashboxla.com or www.lashboxla.com
  const noWww = noProto.replace(/^www\./, '')        // strip www if present
  const withWww = noProto.startsWith('www.') ? noProto : `www.${noProto}`
  const candidates = [
    storedUrl,                        // exactly as stored
    `${base}/`,                       // with trailing slash
    `https://${withWww}/`,            // www variant with trailing slash
    `https://${withWww}`,             // www variant without trailing slash
    `https://${noWww}/`,              // non-www variant with trailing slash
    `https://${noWww}`,               // non-www variant without trailing slash
    `sc-domain:${noWww}`,             // domain property (non-www)
    `sc-domain:${withWww}`,           // domain property (www)
  ].filter(Boolean) as string[]

  let siteUrl: string | null = null
  for (const candidate of candidates) {
    if (results.availableProperties.includes(candidate)) {
      siteUrl = candidate
      break
    }
  }

  // If not matched, try case-insensitive match
  if (!siteUrl && results.availableProperties.length > 0) {
    const lowerCandidates = candidates.map(c => c.toLowerCase())
    siteUrl = results.availableProperties.find(p =>
      lowerCandidates.includes(p.toLowerCase())
    ) ?? null
  }

  results.resolvedSiteUrl = siteUrl

  // Auto-save resolved URL so future syncs use the correct property directly
  if (siteUrl && siteUrl !== storedUrl) {
    await service
      .from('stores')
      .update({ gsc_property_url: siteUrl })
      .eq('id', STORE_ID)
  }

  if (!siteUrl) {
    results.errors.push(
      `Property not found. Stored URL: "${storedUrl}". Available properties: ${results.availableProperties.join(', ')}. Go to Integrations and reconnect using one of the listed property URLs exactly.`
    )
    return {
      keywords: results.keywords,
      pages: results.pages,
      months: results.months,
      errors: results.errors,
      resolvedSiteUrl: results.resolvedSiteUrl,
    }
  }

  // Date ranges — endDate is yesterday (GSC data is typically 1–2 days delayed)
  const now = new Date()
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1)
  const end = toGscDate(yesterday)
  const start90 = toGscDate(new Date(now.getTime() - 90 * 86400000))
  const startPrior = toGscDate(new Date(now.getTime() - 180 * 86400000))
  const endPrior = toGscDate(new Date(now.getTime() - 91 * 86400000))
  const start12m = toGscDate(new Date(now.getTime() - 365 * 86400000))
  results.dateRange = { start90, end, startPrior, endPrior, start12m }

  // ── Top 50 keywords (last 90 days) ───────────────────────────────────────────
  try {
    const rows: GscRow[] = await querySearchAnalytics(accessToken, siteUrl!, {
      startDate: start90,
      endDate: end,
      dimensions: ['query'],
      rowLimit: 50,
      orderBy: [{ fieldName: 'clicks', sortOrder: 'DESCENDING' }],
    })

    if (rows.length > 0) {
      const upserts = rows.map((r) => ({
        tenant_id: TENANT_ID,
        query: r.keys[0],
        clicks: Math.round(r.clicks),
        impressions: Math.round(r.impressions),
        ctr: r.ctr,
        position: r.position,
        synced_at: now.toISOString(),
      }))
      const { error } = await service
        .from('gsc_keywords')
        .upsert(upserts, { onConflict: 'tenant_id,query' })
      if (error) results.errors.push(`Keywords DB: ${error.message}`)
      else results.keywords = upserts.length
    }
  } catch (err) {
    results.errors.push(`Keywords: ${(err as Error).message}`)
  }

  // ── Page performance — current 90 days ───────────────────────────────────────
  const pageCurrentMap: Record<string, { clicks: number; impressions: number; ctr: number; position: number }> = {}
  try {
    const rows: GscRow[] = await querySearchAnalytics(accessToken, siteUrl!, {
      startDate: start90,
      endDate: end,
      dimensions: ['page'],
      rowLimit: 100,
      orderBy: [{ fieldName: 'clicks', sortOrder: 'DESCENDING' }],
    })
    for (const r of rows) {
      pageCurrentMap[r.keys[0]] = {
        clicks: Math.round(r.clicks),
        impressions: Math.round(r.impressions),
        ctr: r.ctr,
        position: r.position,
      }
    }
  } catch (err) {
    results.errors.push(`Pages current: ${(err as Error).message}`)
  }

  // ── Page performance — prior 90 days ─────────────────────────────────────────
  const pagePriorMap: Record<string, number> = {}
  try {
    const rows: GscRow[] = await querySearchAnalytics(accessToken, siteUrl!, {
      startDate: startPrior,
      endDate: endPrior,
      dimensions: ['page'],
      rowLimit: 100,
      orderBy: [{ fieldName: 'clicks', sortOrder: 'DESCENDING' }],
    })
    for (const r of rows) pagePriorMap[r.keys[0]] = Math.round(r.clicks)
  } catch (err) {
    results.errors.push(`Pages prior: ${(err as Error).message}`)
  }

  // Upsert merged page data
  if (Object.keys(pageCurrentMap).length > 0) {
    const upserts = Object.entries(pageCurrentMap).map(([page, d]) => ({
      tenant_id: TENANT_ID,
      page,
      clicks: d.clicks,
      impressions: d.impressions,
      ctr: d.ctr,
      position: d.position,
      clicks_prior: pagePriorMap[page] ?? 0,
      synced_at: now.toISOString(),
    }))
    const { error } = await service
      .from('gsc_pages')
      .upsert(upserts, { onConflict: 'tenant_id,page' })
    if (error) results.errors.push(`Pages DB: ${error.message}`)
    else results.pages = upserts.length
  }

  // ── Monthly click trend (last 12 months by day, then aggregate) ───────────────
  try {
    const rows: GscRow[] = await querySearchAnalytics(accessToken, siteUrl!, {
      startDate: start12m,
      endDate: end,
      dimensions: ['date'],
      rowLimit: 500,
    })

    // Aggregate daily rows into months
    const monthMap: Record<string, { clicks: number; impressions: number }> = {}
    for (const r of rows) {
      const month = toMonthStart(r.keys[0])
      if (!monthMap[month]) monthMap[month] = { clicks: 0, impressions: 0 }
      monthMap[month].clicks += Math.round(r.clicks)
      monthMap[month].impressions += Math.round(r.impressions)
    }

    const upserts = Object.entries(monthMap).map(([month, d]) => ({
      tenant_id: TENANT_ID,
      month,
      clicks: d.clicks,
      impressions: d.impressions,
    }))

    if (upserts.length > 0) {
      const { error } = await service
        .from('gsc_monthly_clicks')
        .upsert(upserts, { onConflict: 'tenant_id,month' })
      if (error) results.errors.push(`Monthly DB: ${error.message}`)
      else results.months = upserts.length
    }
  } catch (err) {
    results.errors.push(`Monthly trend: ${(err as Error).message}`)
  }

  return {
    keywords: results.keywords,
    pages: results.pages,
    months: results.months,
    errors: results.errors,
    resolvedSiteUrl: results.resolvedSiteUrl,
  }
}
