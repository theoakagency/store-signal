/**
 * Shared authentication for Vercel Cron Job routes.
 *
 * Vercel automatically sends `Authorization: Bearer {CRON_SECRET}` on every
 * cron invocation. Return the response to send immediately (401 or 200 kill-
 * switch), or null to continue with the cron handler.
 */
export function verifyCronAuth(request: Request): Response | null {
  // SYNC_ENABLED kill switch — return 200 immediately without doing any work
  if (process.env.SYNC_ENABLED === 'false') {
    return Response.json({ ok: false, reason: 'SYNC_ENABLED=false — syncing is paused' }, { status: 200 })
  }

  const cronSecret = process.env.CRON_SECRET ?? ''
  if (!cronSecret) {
    return Response.json({ error: 'CRON_SECRET env var not set' }, { status: 500 })
  }

  const authHeader = request.headers.get('Authorization')
  if (authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return null
}

/** Derive the base URL for internal fetch calls from the incoming request URL. */
export function getBaseUrl(request: Request): string {
  const url = new URL(request.url)
  return `${url.protocol}//${url.host}`
}

/** Authorization header to attach to internal cron-to-sync-route fetch calls. */
export function cronAuthHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${process.env.CRON_SECRET ?? ''}` }
}
