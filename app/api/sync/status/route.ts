/**
 * GET /api/sync/status
 * Returns the last successful and in-progress run for each cron job,
 * plus the next scheduled run time and connected-integration flags.
 * Used by the Topbar sync status dropdown.
 */
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'

const STORE_ID = '00000000-0000-0000-0000-000000000002'

// Cron schedules in human-readable form + interval in hours for "next run" math
const CRON_META: Record<string, { label: string; intervalHours: number; utcHour: number | null }> = {
  'sync-shopify':  { label: 'Shopify',          intervalHours: 2,   utcHour: null },
  'sync-klaviyo':  { label: 'Klaviyo',           intervalHours: 6,   utcHour: null },
  'sync-ads':      { label: 'Ads (Meta + Google)', intervalHours: 6, utcHour: null },
  'sync-analytics':{ label: 'Analytics (GA4)',   intervalHours: 6,   utcHour: null },
  'sync-search':   { label: 'Search (SEMrush)',  intervalHours: 24,  utcHour: 4   },
  'daily-rebuild': { label: 'Profile rebuild',   intervalHours: 24,  utcHour: 3   },
}

function nextRunAt(intervalHours: number, utcHour: number | null, lastRunAt: string | null): string | null {
  if (utcHour !== null) {
    // Daily at fixed UTC hour
    const now = new Date()
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), utcHour, 0, 0))
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1)
    return next.toISOString()
  }
  if (!lastRunAt) return null
  const next = new Date(new Date(lastRunAt).getTime() + intervalHours * 36e5)
  return next.toISOString()
}

export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createSupabaseServiceClient()

  const [{ data: logs }, { data: recentRuns }, { data: store }] = await Promise.all([
    service
      .from('cron_logs')
      .select('cron_name, started_at, completed_at, status, records_synced, errors')
      .in('cron_name', Object.keys(CRON_META))
      .order('started_at', { ascending: false })
      .limit(60),
    service
      .from('cron_logs')
      .select('id, cron_name, started_at, completed_at, status, records_synced, errors, metadata')
      .order('started_at', { ascending: false })
      .limit(20),
    service
      .from('stores')
      .select('shopify_access_token, klaviyo_api_key, meta_access_token, google_ads_refresh_token, ga4_refresh_token, semrush_api_key, last_synced_at')
      .eq('id', STORE_ID)
      .single(),
  ])

  // ── Build per-cron status ──────────────────────────────────────────────────
  const status: Record<string, {
    label: string
    lastRunAt: string | null
    lastStatus: string | null
    recordsSynced: number
    nextRunAt: string | null
    errors: string[]
  }> = {}

  for (const [name, meta] of Object.entries(CRON_META)) {
    const cronLogs = (logs ?? []).filter((l) => l.cron_name === name)
    const last = cronLogs[0] ?? null
    const lastCompleted = cronLogs.find((l) => l.status === 'completed') ?? null

    status[name] = {
      label: meta.label,
      lastRunAt: last?.started_at ?? null,
      lastStatus: last?.status ?? null,
      recordsSynced: last?.records_synced ?? 0,
      nextRunAt: nextRunAt(meta.intervalHours, meta.utcHour, lastCompleted?.completed_at ?? null),
      errors: last?.errors ?? [],
    }
  }

  return Response.json({
    syncEnabled: process.env.SYNC_ENABLED !== 'false',
    lastSyncedAt: store?.last_synced_at ?? null,
    recentRuns: recentRuns ?? [],
    integrations: {
      shopify:    !!store?.shopify_access_token,
      klaviyo:    !!store?.klaviyo_api_key,
      meta:       !!store?.meta_access_token,
      googleAds:  !!store?.google_ads_refresh_token,
      ga4:        !!store?.ga4_refresh_token,
      semrush:    !!store?.semrush_api_key,
    },
    crons: status,
  })
}
