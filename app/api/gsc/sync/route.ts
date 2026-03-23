import { NextRequest } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'
import {
  refreshAccessToken,
  querySearchAnalytics,
  toGscDate,
  toMonthStart,
  GscRow,
} from '@/lib/gsc'

const STORE_ID = '00000000-0000-0000-0000-000000000002'
const TENANT_ID = '00000000-0000-0000-0000-000000000001'

export const maxDuration = 300

export async function GET(req: NextRequest) { return POST(req) }

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createSupabaseServiceClient()
  const { data: store } = await service
    .from('stores')
    .select('gsc_refresh_token, gsc_property_url')
    .eq('id', STORE_ID)
    .single()

  if (!store?.gsc_refresh_token) {
    return Response.json({ error: 'GSC not connected' }, { status: 400 })
  }

  const { gsc_refresh_token: refreshToken, gsc_property_url: siteUrl } = store
  const results = { keywords: 0, pages: 0, months: 0, errors: [] as string[] }

  let accessToken: string
  try {
    accessToken = await refreshAccessToken(refreshToken)
  } catch (err) {
    return Response.json({ error: `Auth failed: ${(err as Error).message}` }, { status: 400 })
  }

  // Date ranges
  const now = new Date()
  const end = toGscDate(new Date(now.getTime() - 2 * 86400000)) // GSC has ~2 day lag
  const start90 = toGscDate(new Date(now.getTime() - 92 * 86400000))
  const startPrior = toGscDate(new Date(now.getTime() - 182 * 86400000))
  const endPrior = toGscDate(new Date(now.getTime() - 93 * 86400000))
  const start12m = toGscDate(new Date(now.getTime() - 365 * 86400000))

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

  return Response.json(results, { status: results.errors.length > 0 ? 207 : 200 })
}
