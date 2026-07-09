/**
 * POST /api/shopify/sync — manual incremental sync trigger.
 *
 * Delegates to the shared runShopifySync in lib/syncShopify.ts (same code the
 * every-2h cron runs) so there is exactly one order-mapping implementation.
 * Incremental sync filters Shopify on updated_at_min, so refunds/cancellations
 * on previously-synced orders get picked up, not just brand-new orders.
 */
import { NextRequest } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { runShopifySync, SHOPIFY_STORE, SYNC_MONTHS_BACK } from '@/lib/syncShopify'

export const maxDuration = 300

const STORE_ID = '00000000-0000-0000-0000-000000000002'

export async function POST(_req: NextRequest) {
  if (!SHOPIFY_STORE) {
    return Response.json(
      { error: 'Missing SHOPIFY_RETAIL_STORE environment variable' },
      { status: 500 }
    )
  }

  const supabase = createSupabaseServiceClient()

  const { data: store } = await supabase
    .from('stores')
    .select('shopify_access_token, last_synced_at')
    .eq('id', STORE_ID)
    .single()

  const token = store?.shopify_access_token
  if (!token) {
    return Response.json(
      {
        error: 'No Shopify access token — complete OAuth install first',
        install_url: '/api/shopify/install',
      },
      { status: 401 }
    )
  }

  // Incremental: fetch orders updated since the last sync, or fall back to
  // SYNC_MONTHS_BACK months on the very first run.
  let updatedAtMin: string
  if (store.last_synced_at) {
    updatedAtMin = store.last_synced_at
  } else {
    const since = new Date()
    since.setMonth(since.getMonth() - SYNC_MONTHS_BACK)
    updatedAtMin = since.toISOString()
  }

  const results = await runShopifySync(token, 'incremental', updatedAtMin)
  const status = results.errors.length > 0 ? 207 : 200
  return Response.json(results, { status })
}

// Allow GET for convenience in development
export async function GET(req: NextRequest) {
  return POST(req)
}
