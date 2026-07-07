// GET /api/cron/sync-shipstation
// Schedule: every 6 hours — cron: "15 */6 * * *"
import { NextRequest } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { verifyCronAuth } from '@/lib/cronAuth'
import { runShipStationSync } from '@/lib/syncShipStation'

export const maxDuration = 300

// NO AI CALLS — insights are user-triggered only

const STORE_ID = '00000000-0000-0000-0000-000000000002'

export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request)
  if (authError) return authError

  const service = createSupabaseServiceClient()

  const { data: store } = await service
    .from('stores')
    .select('shipstation_api_key, shipstation_last_synced_at')
    .eq('id', STORE_ID)
    .single()

  const apiKey = (store as { shipstation_api_key: string | null } | null)?.shipstation_api_key

  if (!apiKey) {
    return Response.json({ ok: true, skipped: true, reason: 'ShipStation not connected' })
  }

  const lastSyncedAt = (store as { shipstation_last_synced_at: string | null } | null)?.shipstation_last_synced_at
  const start = lastSyncedAt ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const end = new Date().toISOString()

  // ── Log start ───────────────────────────────────────────────────────────────
  const { data: log } = await service
    .from('cron_logs')
    .insert({ cron_name: 'sync-shipstation', status: 'running' })
    .select('id')
    .single()

  const errors: string[] = []
  let recordsSynced = 0

  try {
    const result = await runShipStationSync(apiKey, { start, end })
    recordsSynced = result.synced.labels
    await service.from('stores').update({ shipstation_last_synced_at: end }).eq('id', STORE_ID)
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
