// GET /api/cron/sync-loyalty
// Schedule: every 6 hours — cron: "0 */6 * * *"
// Syncs LoyaltyLion customers, activities, rewards, campaigns, and computes lift metrics.
import { NextRequest } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { verifyCronAuth } from '@/lib/cronAuth'
import { runLoyaltySync } from '@/lib/syncLoyalty'

export const maxDuration = 300

// NO AI CALLS — insights are user-triggered only

export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request)
  if (authError) return authError

  const service = createSupabaseServiceClient()

  const { data: store } = await service
    .from('stores')
    .select('loyaltylion_token, loyaltylion_secret')
    .eq('id', '00000000-0000-0000-0000-000000000002')
    .single()

  const s = store as { loyaltylion_token: string | null; loyaltylion_secret: string | null } | null

  if (!s?.loyaltylion_token) {
    return Response.json({ ok: true, skipped: true, reason: 'LoyaltyLion not connected' })
  }

  // ── Log start ───────────────────────────────────────────────────────────────
  const { data: log } = await service
    .from('cron_logs')
    .insert({ cron_name: 'sync-loyalty', status: 'running' })
    .select('id')
    .single()

  const errors: string[] = []
  let recordsSynced = 0

  try {
    const result = await runLoyaltySync(s.loyaltylion_token, s.loyaltylion_secret)
    recordsSynced = (result.synced.customers ?? 0) + (result.synced.activities ?? 0)
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
