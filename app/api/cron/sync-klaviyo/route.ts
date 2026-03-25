// GET /api/cron/sync-klaviyo
// Schedule: every 6 hours — cron: "0 * /6 * * *" (remove the space)
import { NextRequest } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { verifyCronAuth, getBaseUrl, cronAuthHeaders } from '@/lib/cronAuth'

export const maxDuration = 300

// NO AI CALLS — insights are user-triggered only

export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request)
  if (authError) return authError

  const service = createSupabaseServiceClient()

  const { data: store } = await service
    .from('stores')
    .select('klaviyo_api_key')
    .eq('id', '00000000-0000-0000-0000-000000000002')
    .single()

  if (!store?.klaviyo_api_key) {
    return Response.json({ ok: false, reason: 'Klaviyo not connected' })
  }

  // ── Log start ───────────────────────────────────────────────────────────────
  const { data: log } = await service
    .from('cron_logs')
    .insert({ cron_name: 'sync-klaviyo', status: 'running' })
    .select('id')
    .single()

  const errors: string[] = []
  let recordsSynced = 0

  try {
    const base = getBaseUrl(request)
    const res = await fetch(`${base}/api/klaviyo/sync`, {
      method: 'POST',
      headers: cronAuthHeaders(),
    })
    const data = await res.json() as { campaigns?: number; flows?: number; error?: string }
    if (!res.ok || data.error) {
      errors.push(data.error ?? `HTTP ${res.status}`)
    } else {
      recordsSynced = (data.campaigns ?? 0) + (data.flows ?? 0)
    }
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
