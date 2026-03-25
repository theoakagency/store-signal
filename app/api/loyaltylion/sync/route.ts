/**
 * POST /api/loyaltylion/sync
 * Syncs all LoyaltyLion data and caches computed metrics.
 * Thin wrapper around lib/syncLoyalty.ts — same function used by cron.
 */
import { NextRequest } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'
import { runLoyaltySync } from '@/lib/syncLoyalty'

export const maxDuration = 300

const STORE_ID = '00000000-0000-0000-0000-000000000002'

export async function POST(req: NextRequest) {
  const isCron = req.headers.get('Authorization') === `Bearer ${process.env.CRON_SECRET ?? ''}`
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user && !isCron) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createSupabaseServiceClient()
  const { data: store } = await service
    .from('stores')
    .select('loyaltylion_token, loyaltylion_secret')
    .eq('id', STORE_ID)
    .single()

  const s = store as { loyaltylion_token: string | null; loyaltylion_secret: string | null } | null
  if (!s?.loyaltylion_token) {
    return Response.json({ error: 'LoyaltyLion not connected' }, { status: 400 })
  }

  try {
    const result = await runLoyaltySync(s.loyaltylion_token, s.loyaltylion_secret)
    return Response.json(result)
  } catch (err) {
    const msg = (err as Error).message
    console.error('LoyaltyLion sync error:', msg)
    return Response.json({ error: msg }, { status: 502 })
  }
}
