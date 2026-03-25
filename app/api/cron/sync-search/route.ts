/**
 * GET /api/cron/sync-search
 * Schedule: daily at 4am (0 4 * * *)
 *
 * Cost protection: SEMrush consumes ~50-150 API units per run.
 * Skip if last SEMrush sync was < 20 hours ago.
 */
import { NextRequest } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { verifyCronAuth } from '@/lib/cronAuth'
import { runSEMrushSync } from '@/lib/syncSEMrush'

export const maxDuration = 300

// NO AI CALLS — insights are user-triggered only

const SEMRUSH_MIN_HOURS = 20

export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request)
  if (authError) return authError

  const service = createSupabaseServiceClient()

  const { data: store } = await service
    .from('stores')
    .select('semrush_api_key, semrush_domain')
    .eq('id', '00000000-0000-0000-0000-000000000002')
    .single()

  const storeTyped = store as { semrush_api_key: string | null; semrush_domain: string | null } | null

  if (!storeTyped?.semrush_api_key || !storeTyped?.semrush_domain) {
    return Response.json({ ok: false, reason: 'SEMrush not connected' })
  }

  // ── Cost protection: skip if synced < 20h ago ───────────────────────────────
  const { data: lastRun } = await service
    .from('cron_logs')
    .select('completed_at')
    .eq('cron_name', 'sync-search')
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (lastRun?.completed_at) {
    const hoursSince = (Date.now() - new Date(lastRun.completed_at).getTime()) / 36e5
    if (hoursSince < SEMRUSH_MIN_HOURS) {
      return Response.json({
        ok: true,
        skipped: true,
        reason: `Last SEMrush sync ${hoursSince.toFixed(1)}h ago — minimum ${SEMRUSH_MIN_HOURS}h between runs to conserve API units`,
      })
    }
  }

  // ── Log start ───────────────────────────────────────────────────────────────
  const { data: log } = await service
    .from('cron_logs')
    .insert({ cron_name: 'sync-search', status: 'running' })
    .select('id')
    .single()

  const errors: string[] = []

  try {
    await runSEMrushSync(storeTyped.semrush_api_key, storeTyped.semrush_domain)
  } catch (err) {
    errors.push(String(err))
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
