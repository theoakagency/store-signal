// GET /api/cron/sync-gsc
// Schedule: daily at 4:30am — cron: "30 4 * * *"
import { NextRequest } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { verifyCronAuth } from '@/lib/cronAuth'
import { runGscSync } from '@/lib/syncGsc'

export const maxDuration = 300

// NO AI CALLS — insights are user-triggered only

const STORE_ID = '00000000-0000-0000-0000-000000000002'

export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request)
  if (authError) return authError

  const service = createSupabaseServiceClient()

  const { data: store } = await service
    .from('stores')
    .select('gsc_refresh_token, gsc_property_url')
    .eq('id', STORE_ID)
    .single()

  if (!store?.gsc_refresh_token) {
    return Response.json({ ok: true, skipped: true, reason: 'GSC not connected' })
  }

  const { gsc_refresh_token: refreshToken, gsc_property_url: propertyUrl } = store

  // ── Log start ───────────────────────────────────────────────────────────────
  const { data: log } = await service
    .from('cron_logs')
    .insert({ cron_name: 'sync-gsc', status: 'running' })
    .select('id')
    .single()

  const errors: string[] = []
  let recordsSynced = 0

  try {
    const result = await runGscSync(refreshToken, propertyUrl)
    recordsSynced = result.keywords + result.pages + result.months
    if (result.errors.length > 0) errors.push(...result.errors)
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
