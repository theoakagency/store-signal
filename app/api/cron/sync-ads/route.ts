// GET /api/cron/sync-ads
// Schedule: every 6 hours offset by 30m — cron: "30 */6 * * *"
// Syncs Meta Ads + Google Ads in parallel, each in isolated try/catch.
import { NextRequest } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { verifyCronAuth } from '@/lib/cronAuth'
import { runMetaSync } from '@/lib/syncMeta'
import { runGoogleAdsSync } from '@/lib/syncGoogleAds'

export const maxDuration = 300

// NO AI CALLS — insights are user-triggered only

export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request)
  if (authError) return authError

  const service = createSupabaseServiceClient()

  const { data: store } = await service
    .from('stores')
    .select('meta_access_token, meta_ad_account_id, google_ads_refresh_token, google_ads_developer_token, ga4_refresh_token, ga4_property_id')
    .eq('id', '00000000-0000-0000-0000-000000000002')
    .single()

  if (!store?.meta_access_token && !store?.google_ads_refresh_token) {
    return Response.json({ ok: true, skipped: true, reason: 'No ads integrations connected' })
  }

  // ── Log start ───────────────────────────────────────────────────────────────
  const { data: log } = await service
    .from('cron_logs')
    .insert({ cron_name: 'sync-ads', status: 'running' })
    .select('id')
    .single()

  const errors: string[] = []
  let recordsSynced = 0

  // ── Meta Ads (per-tenant isolation) ────────────────────────────────────────
  if (store?.meta_access_token && store?.meta_ad_account_id) {
    try {
      const result = await runMetaSync(store.meta_access_token, store.meta_ad_account_id)
      recordsSynced += result.synced ?? 0
    } catch (err) {
      errors.push(`Meta: ${String(err)}`)
    }
  }

  // ── Google Ads (per-tenant isolation) ──────────────────────────────────────
  if (store?.google_ads_refresh_token) {
    try {
      const result = await runGoogleAdsSync({
        google_ads_refresh_token: store.google_ads_refresh_token,
        google_ads_developer_token: store.google_ads_developer_token ?? '',
        ga4_refresh_token: store.ga4_refresh_token ?? null,
        ga4_property_id: store.ga4_property_id ?? null,
      })
      recordsSynced += result.synced ?? 0
    } catch (err) {
      errors.push(`Google Ads: ${String(err)}`)
    }
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
