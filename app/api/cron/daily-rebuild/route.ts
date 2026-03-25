/**
 * GET /api/cron/daily-rebuild
 * Schedule: daily at 3am (0 3 * * *)
 *
 * Rebuilds derived data that depends on accumulated orders:
 *   1. Customer profiles (all batches sequentially)
 *   2. Agent context cache (the ONE allowed AI-adjacent call — rebuilds the
 *      cached store snapshot injected into every AI chat system prompt)
 *
 * NOTE: agent/context/POST does NOT call Claude — it aggregates Supabase data
 * into a JSON snapshot. No generative AI calls happen in this cron.
 */
import { NextRequest } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { verifyCronAuth, getBaseUrl, cronAuthHeaders } from '@/lib/cronAuth'

export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request)
  if (authError) return authError

  const service = createSupabaseServiceClient()
  const base = getBaseUrl(request)
  const headers = { ...cronAuthHeaders(), 'Content-Type': 'application/json' }

  // ── Log start ───────────────────────────────────────────────────────────────
  const { data: log } = await service
    .from('cron_logs')
    .insert({ cron_name: 'daily-rebuild', status: 'running' })
    .select('id')
    .single()

  const errors: string[] = []
  let profilesBuilt = 0

  // ── Step 1: Rebuild customer profiles (batch=0 first to get totalBatches) ──
  try {
    const res0 = await fetch(`${base}/api/customers/build-profiles?batch=0`, { method: 'POST', headers })
    const data0 = await res0.json() as { totalBatches?: number; upserted?: number; error?: string }

    if (!res0.ok || data0.error) {
      errors.push(`build-profiles batch 0: ${data0.error ?? `HTTP ${res0.status}`}`)
    } else {
      profilesBuilt += data0.upserted ?? 0
      const totalBatches = data0.totalBatches ?? 1

      // Subsequent batches
      for (let batch = 1; batch < totalBatches; batch++) {
        try {
          const res = await fetch(`${base}/api/customers/build-profiles?batch=${batch}`, { method: 'POST', headers })
          const data = await res.json() as { upserted?: number; error?: string }
          if (!res.ok || data.error) {
            errors.push(`build-profiles batch ${batch}: ${data.error ?? `HTTP ${res.status}`}`)
          } else {
            profilesBuilt += data.upserted ?? 0
          }
        } catch (err) {
          errors.push(`build-profiles batch ${batch}: ${String(err)}`)
        }
      }
    }
  } catch (err) {
    errors.push(`build-profiles: ${String(err)}`)
  }

  // ── Step 2: Rebuild agent context cache ─────────────────────────────────────
  // Aggregates Supabase data into a JSON snapshot — NO generative AI calls.
  try {
    const res = await fetch(`${base}/api/agent/context`, { method: 'POST', headers })
    if (!res.ok) {
      const data = await res.json() as { error?: string }
      errors.push(`agent context: ${data.error ?? `HTTP ${res.status}`}`)
    }
  } catch (err) {
    errors.push(`agent context: ${String(err)}`)
  }

  // ── Log complete ────────────────────────────────────────────────────────────
  if (log?.id) {
    await service
      .from('cron_logs')
      .update({
        status: errors.length ? 'failed' : 'completed',
        completed_at: new Date().toISOString(),
        tenants_processed: 1,
        records_synced: profilesBuilt,
        errors,
      })
      .eq('id', log.id)
  }

  return Response.json({ ok: errors.length === 0, profilesBuilt, errors })
}
