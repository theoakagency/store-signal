// GET /api/cron/sync-recharge
// Schedule: every 6 hours — cron: "30 */6 * * *"
import { NextRequest } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { verifyCronAuth } from '@/lib/cronAuth'
import { runRechargeSync } from '@/lib/syncRecharge'

export const maxDuration = 300

// NO AI CALLS — insights are user-triggered only

const STORE_ID = '00000000-0000-0000-0000-000000000002'

export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request)
  if (authError) return authError

  const service = createSupabaseServiceClient()

  const { data: store } = await service
    .from('stores')
    .select('recharge_api_token')
    .eq('id', STORE_ID)
    .single()

  const apiToken = (store as { recharge_api_token: string | null } | null)?.recharge_api_token

  if (!apiToken) {
    return Response.json({ ok: true, skipped: true, reason: 'Recharge not connected' })
  }

  // ── Log start ───────────────────────────────────────────────────────────────
  const { data: log } = await service
    .from('cron_logs')
    .insert({ cron_name: 'sync-recharge', status: 'running' })
    .select('id')
    .single()

  const errors: string[] = []
  let recordsSynced = 0

  try {
    const result = await runRechargeSync(apiToken)
    recordsSynced = result.synced.subscriptions
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
