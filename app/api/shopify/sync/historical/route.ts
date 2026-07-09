/**
 * Historical sync — processes one 7-day chunk at a time.
 *
 * POST /api/shopify/sync/historical
 * Body: { "chunk_start": "2024-01-01T00:00:00Z", "end"?: "2024-02-01T00:00:00Z" }
 *       chunk_start: omit to start from SHOPIFY_SYNC_MONTHS_BACK months ago.
 *       end: omit to chunk all the way forward to now (the original catch-up
 *       behavior). When provided, bounds the backfill to a specific window
 *       (e.g. re-syncing one past month) — this intentionally does NOT
 *       advance stores.last_synced_at, since that field drives where the
 *       incremental cron resumes and must reflect true wall-clock progress,
 *       not an arbitrary backfill target.
 *
 * Returns: { orders, errors, chunk_start, chunk_end, next_chunk_start }
 * When next_chunk_start is null, the requested import is complete.
 *
 * 7-day chunks keep each invocation under ~20s (compatible with 60s limit).
 * For 12 months run the loop ~52 times.
 */

import { NextRequest } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { mapOrder, type ShopifyOrder } from '@/lib/syncShopify'

export const maxDuration = 300

const SHOPIFY_STORE = (process.env.SHOPIFY_RETAIL_STORE ?? '').trim()
const SYNC_MONTHS_BACK = parseInt(process.env.SHOPIFY_SYNC_MONTHS_BACK ?? '12', 10)

const STORE_ID = '00000000-0000-0000-0000-000000000002'

const CHUNK_DAYS = 7

async function shopifyFetch(path: string, token: string) {
  return fetch(`https://${SHOPIFY_STORE}/admin/api/2024-10/${path}`, {
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json',
    },
  })
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchOrdersInWindow(
  token: string,
  createdAtMin: string,
  createdAtMax: string
): Promise<ShopifyOrder[]> {
  const orders: ShopifyOrder[] = []
  const params = new URLSearchParams({
    limit: '250',
    status: 'any',
    created_at_min: createdAtMin,
    created_at_max: createdAtMax,
  })

  let url: string | null = `orders.json?${params.toString()}`
  let isFirst = true

  while (url) {
    if (!isFirst) await sleep(150)
    isFirst = false

    const fullUrl = `https://${SHOPIFY_STORE}/admin/api/2024-10/${url}`
    console.log('[historical-sync] Fetching:', fullUrl)

    const res = await shopifyFetch(url, token)
    console.log('[historical-sync] Response status:', res.status, res.statusText)

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Shopify orders fetch failed (${res.status}): ${text}`)
    }
    const data = await res.json()
    const pageOrders = data.orders as ShopifyOrder[]
    console.log('[historical-sync] Orders in page:', pageOrders.length)
    orders.push(...pageOrders)

    const linkHeader = res.headers.get('Link')
    const nextMatch = linkHeader?.match(/<[^>]+\/(\S+)>; rel="next"/)
    url = nextMatch ? nextMatch[1] : null
  }

  return orders
}

export async function POST(req: NextRequest) {
  if (!SHOPIFY_STORE) {
    return Response.json({ error: 'Missing SHOPIFY_RETAIL_STORE' }, { status: 500 })
  }

  const supabase = createSupabaseServiceClient()

  const { data: store } = await supabase
    .from('stores')
    .select('shopify_access_token')
    .eq('id', STORE_ID)
    .single()

  const token = store?.shopify_access_token
  if (!token) {
    return Response.json(
      { error: 'No access token — complete OAuth install first', install_url: '/api/shopify/install' },
      { status: 401 }
    )
  }

  // Parse request body for chunk_start / end
  let chunkStart: Date
  let targetEnd: Date
  let hasExplicitEnd: boolean
  try {
    const body = await req.json().catch(() => ({}))
    chunkStart = body.chunk_start ? new Date(body.chunk_start) : (() => {
      const d = new Date()
      d.setMonth(d.getMonth() - SYNC_MONTHS_BACK)
      return d
    })()
    hasExplicitEnd = !!body.end
    targetEnd = hasExplicitEnd ? new Date(body.end) : new Date()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const chunkEnd = new Date(chunkStart)
  chunkEnd.setDate(chunkEnd.getDate() + CHUNK_DAYS)

  const isLastChunk = chunkEnd >= targetEnd
  const effectiveEnd = isLastChunk ? targetEnd : chunkEnd

  const createdAtMin = chunkStart.toISOString()
  const createdAtMax = effectiveEnd.toISOString()

  console.log('[historical-sync] Chunk:', { createdAtMin, createdAtMax, isLastChunk, SYNC_MONTHS_BACK })

  const results = { orders: 0, errors: [] as string[] }

  try {
    const orders = await fetchOrdersInWindow(token, createdAtMin, createdAtMax)
    const mapped = orders.map(mapOrder)

    for (let i = 0; i < mapped.length; i += 500) {
      const batch = mapped.slice(i, i + 500)
      const { error } = await supabase
        .from('orders')
        .upsert(batch, { onConflict: 'store_id,shopify_order_id' })
      if (error) {
        results.errors.push(`Batch ${i}: ${error.message}`)
      } else {
        results.orders += batch.length
      }
    }
  } catch (err) {
    const msg = (err as Error).message
    results.errors.push(msg)
      return Response.json({ ...results, next_chunk_start: createdAtMin }, { status: 207 })
  }

  // Update last_synced_at only for the default open-ended catch-up import —
  // a bounded backfill (explicit end) must not advance the incremental cursor.
  if (isLastChunk && !hasExplicitEnd) {
    await supabase
      .from('stores')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', STORE_ID)
  }

  return Response.json({
    ...results,
    chunk_start: createdAtMin,
    chunk_end: createdAtMax,
    next_chunk_start: isLastChunk ? null : chunkEnd.toISOString(),
  })
}
