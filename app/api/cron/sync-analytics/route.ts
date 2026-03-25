// GET /api/cron/sync-analytics
// Schedule: every 6 hours — cron: "0 */6 * * *"
// Syncs GA4 analytics data.
import { NextRequest } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { verifyCronAuth } from '@/lib/cronAuth'
import { runAnalyticsSync } from '@/lib/syncAnalytics'

export const maxDuration = 300

// NO AI CALLS — insights are user-triggered only

export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request)
  if (authError) return authError

  const service = createSupabaseServiceClient()

  const { data: store } = await service
    .from('stores')
    .select('ga4_refresh_token, ga4_property_id')
    .eq('id', '00000000-0000-0000-0000-000000000002')
    .single()

  if (!store?.ga4_refresh_token || !store?.ga4_property_id) {
    return Response.json({ ok: false, reason: 'Google Analytics not connected' })
  }

  // ── Log start ───────────────────────────────────────────────────────────────
  const { data: log } = await service
    .from('cron_logs')
    .insert({ cron_name: 'sync-analytics', status: 'running' })
    .select('id')
    .single()

  const errors: string[] = []
  let recordsSynced = 0

  try {
    const result = await runAnalyticsSync(store.ga4_refresh_token, store.ga4_property_id)
    recordsSynced = (result.channels ?? 0) + (result.pages ?? 0)
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
        records_synced: recordsSynced,
        errors,
      })
      .eq('id', log.id)
  }

  return Response.json({ ok: errors.length === 0, recordsSynced, errors })
}
