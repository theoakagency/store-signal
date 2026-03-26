/**
 * GET /api/cron/daily-analysis
 * Schedule: daily at 5am (0 5 * * *)
 *
 * Runs internal derived-data builds that depend on synced external data:
 *   1. Metrics refresh (exec summary revenue/order metrics)
 *   2. Analytics overview scores (traffic health, organic visibility)
 *   3. Product analysis (product stats, affinity pairs, purchase sequences)
 *
 * Runs AFTER daily-rebuild (3am) and sync-search (4am) to ensure
 * fresh profiles and SEMrush data are available.
 */
import { NextRequest } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { verifyCronAuth } from '@/lib/cronAuth'

export const maxDuration = 300

// NO AI CALLS — insights are user-triggered only

export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request)
  if (authError) return authError

  const service = createSupabaseServiceClient()

  // ── Log start ───────────────────────────────────────────────────────────────
  const { data: log } = await service
    .from('cron_logs')
    .insert({ cron_name: 'daily-analysis', status: 'running' })
    .select('id')
    .single()

  const errors: string[] = []

  // Use VERCEL_PROJECT_PRODUCTION_URL for reliable self-calls, fall back to VERCEL_URL
  const base = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000'

  const cronHeader = { 'Authorization': `Bearer ${process.env.CRON_SECRET ?? ''}` }

  // Step 1: Metrics refresh
  try {
    const res = await fetch(`${base}/api/metrics/refresh`, { method: 'POST', headers: cronHeader })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      errors.push(`Metrics refresh: ${(body as { error?: string }).error ?? res.statusText}`)
    }
  } catch (err) {
    errors.push(`Metrics refresh: ${String(err)}`)
  }

  // Step 2: Analytics overview refresh
  try {
    const res = await fetch(`${base}/api/analytics/overview/refresh`, { method: 'POST', headers: cronHeader })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      errors.push(`Analytics overview: ${(body as { error?: string }).error ?? res.statusText}`)
    }
  } catch (err) {
    errors.push(`Analytics overview: ${String(err)}`)
  }

  // Step 3: Product analysis
  try {
    const res = await fetch(`${base}/api/products/analyze`, { method: 'POST', headers: cronHeader })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      errors.push(`Product analysis: ${(body as { error?: string }).error ?? res.statusText}`)
    }
  } catch (err) {
    errors.push(`Product analysis: ${String(err)}`)
  }

  // ── Log complete ────────────────────────────────────────────────────────────
  if (log?.id) {
    await service
      .from('cron_logs')
      .update({
        status: errors.length ? 'failed' : 'completed',
        completed_at: new Date().toISOString(),
        tenants_processed: 1,
        records_synced: 0,
        errors,
      })
      .eq('id', log.id)
  }

  return Response.json({ ok: errors.length === 0, errors })
}
