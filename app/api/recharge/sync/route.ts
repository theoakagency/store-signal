/**
 * POST /api/recharge/sync
 * Fetches all Recharge subscription data and caches computed metrics.
 */
import { NextRequest } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'
import { runRechargeSync } from '@/lib/syncRecharge'

export const maxDuration = 300

const STORE_ID = '00000000-0000-0000-0000-000000000002'

export async function POST(_req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createSupabaseServiceClient()

  const { data: store } = await service
    .from('stores')
    .select('recharge_api_token')
    .eq('id', STORE_ID)
    .single()

  const apiToken = (store as { recharge_api_token: string | null } | null)?.recharge_api_token
  if (!apiToken) return Response.json({ error: 'Recharge not connected' }, { status: 400 })

  try {
    const result = await runRechargeSync(apiToken)
    return Response.json({
      ...result,
      _debug: { sample_subscription: null },
    })
  } catch (e) {
    const msg = (e as Error).message
    console.error('Recharge sync error:', msg)
    if (msg.startsWith('Cache write failed:')) {
      return Response.json({ error: msg }, { status: 500 })
    }
    return Response.json({ error: `Recharge fetch failed: ${msg}` }, { status: 502 })
  }
}
