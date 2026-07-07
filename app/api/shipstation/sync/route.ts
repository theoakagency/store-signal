/**
 * POST /api/shipstation/sync
 * Incremental sync — pulls labels created since the last successful sync
 * (or the last 24h if never synced) and upserts them into shipstation_shipments.
 */
import { NextRequest } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'
import { runShipStationSync } from '@/lib/syncShipStation'

export const maxDuration = 300

const STORE_ID = '00000000-0000-0000-0000-000000000002'

export async function POST(_req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createSupabaseServiceClient()

  const { data: store } = await service
    .from('stores')
    .select('shipstation_api_key, shipstation_last_synced_at')
    .eq('id', STORE_ID)
    .single()

  const apiKey = (store as { shipstation_api_key: string | null } | null)?.shipstation_api_key
  if (!apiKey) return Response.json({ error: 'ShipStation not connected' }, { status: 400 })

  const lastSyncedAt = (store as { shipstation_last_synced_at: string | null } | null)?.shipstation_last_synced_at
  const start = lastSyncedAt ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const end = new Date().toISOString()

  try {
    const result = await runShipStationSync(apiKey, { start, end })
    await service.from('stores').update({ shipstation_last_synced_at: end }).eq('id', STORE_ID)
    return Response.json({ ...result, dateRange: { start, end } })
  } catch (e) {
    const msg = (e as Error).message
    console.error('ShipStation sync error:', msg)
    return Response.json({ error: `ShipStation fetch failed: ${msg}` }, { status: 502 })
  }
}
