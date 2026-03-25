// GET /api/cron/sync-ads
// Schedule: every 6 hours offset by 30m — cron: "30 * /6 * * *" (remove the space)
// Syncs Meta Ads + Google Ads in parallel, each in isolated try/catch.
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
    .select('meta_access_token, google_ads_refresh_token')
    .eq('id', '00000000-0000-0000-0000-000000000002')
    .single()

  // ── Log start ───────────────────────────────────────────────────────────────
  const { data: log } = await service
    .from('cron_logs')
    .insert({ cron_name: 'sync-ads', status: 'running' })
    .select('id')
    .single()

  const errors: string[] = []
  let recordsSynced = 0
  const base = getBaseUrl(request)
  const headers = cronAuthHeaders()

  // ── Meta Ads (per-tenant isolation) ────────────────────────────────────────
  if (store?.meta_access_token) {
    try {
      const res = await fetch(`${base}/api/meta/sync`, { method: 'POST', headers })
      const data = await res.json() as { campaigns?: number; error?: string }
      if (!res.ok || data.error) {
        errors.push(`Meta: ${data.error ?? `HTTP ${res.status}`}`)
      } else {
        recordsSynced += data.campaigns ?? 0
      }
    } catch (err) {
      errors.push(`Meta: ${String(err)}`)
    }
  }

  // ── Google Ads (per-tenant isolation) ──────────────────────────────────────
  if (store?.google_ads_refresh_token) {
    try {
      const res = await fetch(`${base}/api/google-ads/sync`, { method: 'POST', headers })
      const data = await res.json() as { campaigns?: number; error?: string }
      if (!res.ok || data.error) {
        errors.push(`Google Ads: ${data.error ?? `HTTP ${res.status}`}`)
      } else {
        recordsSynced += data.campaigns ?? 0
      }
    } catch (err) {
      errors.push(`Google Ads: ${String(err)}`)
    }
  }

  if (!store?.meta_access_token && !store?.google_ads_refresh_token) {
    if (log?.id) {
      await service.from('cron_logs').update({ status: 'completed', completed_at: new Date().toISOString(), metadata: { skipped: 'no ads integrations connected' } }).eq('id', log.id)
    }
    return Response.json({ ok: true, skipped: true, reason: 'No ads integrations connected' })
  }

  // ── Log complete ────────────────────────────────────────────────────────────
  if (log?.id) {
    await service
      .from('cron_logs')
      .update({
        status: errors.length === 2 ? 'failed' : 'completed',
        completed_at: new Date().toISOString(),
        tenants_processed: 1,
        records_synced: recordsSynced,
        errors,
      })
      .eq('id', log.id)
  }

  return Response.json({ ok: true, recordsSynced, errors })
}
