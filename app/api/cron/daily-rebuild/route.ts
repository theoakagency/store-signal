/**
 * GET /api/cron/daily-rebuild
 * Schedule: daily at 3am (0 3 * * *)
 *
 * Rebuilds derived data that depends on accumulated orders:
 *   1. Customer profiles (all batches sequentially)
 *   2. Agent context cache (the ONE allowed AI-adjacent call — rebuilds the
 *      cached store snapshot injected into every AI chat system prompt)
 *
 * NOTE: runAgentContextRebuild does NOT call Claude — it aggregates Supabase data
 * into a JSON snapshot. No generative AI calls happen in this cron.
 */
import { NextRequest } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { verifyCronAuth } from '@/lib/cronAuth'
import { runProfileBatch } from '@/lib/buildProfiles'
import { runAgentContextRebuild } from '@/lib/buildAgentContext'

export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request)
  if (authError) return authError

  const service = createSupabaseServiceClient()

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
    const result0 = await runProfileBatch(0)

    if (!result0.ok) {
      errors.push(`build-profiles batch 0 failed`)
    } else {
      profilesBuilt += result0.upserted ?? 0
      const totalBatches = result0.totalBatches ?? 1

      for (let batch = 1; batch < totalBatches; batch++) {
        try {
          const result = await runProfileBatch(batch)
          if (!result.ok) {
            errors.push(`build-profiles batch ${batch} failed`)
          } else {
            profilesBuilt += result.upserted ?? 0
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
    await runAgentContextRebuild()
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
