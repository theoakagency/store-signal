// GET /api/cron/sync-shopify
// Schedule: every 2 hours — cron: "0 */2 * * *"
// Cost protection: skip if last sync was < 4h ago AND < 100 new orders.
import { NextRequest } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { verifyCronAuth } from '@/lib/cronAuth'
import { runShopifySync } from '@/lib/syncShopify'

export const maxDuration = 300

// NO AI CALLS — insights are user-triggered only

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request)
  if (authError) return authError

  const service = createSupabaseServiceClient()

  // ── Cost protection: skip if synced recently with few new orders ────────────
  const { data: store } = await service
    .from('stores')
    .select('last_synced_at, shopify_access_token')
    .eq('id', '00000000-0000-0000-0000-000000000002')
    .single()

  if (!store?.shopify_access_token) {
    return Response.json({ ok: false, reason: 'Shopify not connected' })
  }

  if (store.last_synced_at) {
    const hoursSince = (Date.now() - new Date(store.last_synced_at).getTime()) / 36e5
    if (hoursSince < 4) {
      // Check if there are < 100 new orders since last sync — if so, skip
      const { count } = await service
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', TENANT_ID)
        .gt('created_at', store.last_synced_at)
      if ((count ?? 0) < 100) {
        return Response.json({ ok: true, skipped: true, reason: `Last sync ${hoursSince.toFixed(1)}h ago with <100 new orders` })
      }
    }
  }

  // ── Log start ───────────────────────────────────────────────────────────────
  const { data: log } = await service
    .from('cron_logs')
    .insert({ cron_name: 'sync-shopify', status: 'running' })
    .select('id')
    .single()

  const errors: string[] = []
  let recordsSynced = 0

  try {
    const result = await runShopifySync(
      store.shopify_access_token,
      'incremental',
      store.last_synced_at ?? undefined,
    )
    recordsSynced = (result.orders ?? 0) + (result.customers ?? 0)
    if (result.errors?.length) {
      errors.push(...result.errors)
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
