/**
 * Historical sync — processes one 7-day chunk at a time.
 *
 * POST /api/shipstation/sync/historical
 * Body: { "start": "2026-06-01T00:00:00Z", "end": "2026-07-01T00:00:00Z", "chunk_start"?: "..." }
 *       start/end define the overall backfill window. chunk_start is only
 *       needed to resume a multi-call backfill (omit on the first call —
 *       it defaults to `start`).
 *
 * Returns: { synced, unmatched, errors, chunk_start, chunk_end, next_chunk_start }
 * When next_chunk_start is null, the backfill for the requested window is complete.
 *
 * 7-day chunks keep each invocation well under the label volume ShipStation
 * returns per window. For a full month, expect ~4-5 calls.
 */
import { NextRequest } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'
import { runShipStationSync } from '@/lib/syncShipStation'

export const maxDuration = 300

const STORE_ID = '00000000-0000-0000-0000-000000000002'
const CHUNK_DAYS = 7

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { start?: string; end?: string; chunk_start?: string }
  if (!body.start || !body.end) {
    return Response.json({ error: 'Body must include "start" and "end" ISO dates for the backfill window' }, { status: 400 })
  }

  const windowStart = new Date(body.start)
  const windowEnd = new Date(body.end)
  const chunkStart = body.chunk_start ? new Date(body.chunk_start) : windowStart

  const chunkEnd = new Date(chunkStart)
  chunkEnd.setDate(chunkEnd.getDate() + CHUNK_DAYS)

  const isLastChunk = chunkEnd >= windowEnd
  const effectiveEnd = isLastChunk ? windowEnd : chunkEnd

  const service = createSupabaseServiceClient()

  const { data: store } = await service
    .from('stores')
    .select('shipstation_api_key')
    .eq('id', STORE_ID)
    .single()

  const apiKey = (store as { shipstation_api_key: string | null } | null)?.shipstation_api_key
  if (!apiKey) return Response.json({ error: 'ShipStation not connected' }, { status: 400 })

  const start = chunkStart.toISOString()
  const end = effectiveEnd.toISOString()

  try {
    const result = await runShipStationSync(apiKey, { start, end })
    return Response.json({
      ...result,
      chunk_start: start,
      chunk_end: end,
      next_chunk_start: isLastChunk ? null : chunkEnd.toISOString(),
    })
  } catch (e) {
    const msg = (e as Error).message
    return Response.json({ error: msg, next_chunk_start: start }, { status: 207 })
  }
}
