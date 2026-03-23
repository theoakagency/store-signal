// ── Google Search Console API client ─────────────────────────────────────────

const GSC_BASE = 'https://www.googleapis.com/webmasters/v3'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'

export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? 'https://store-signal.vercel.app'

export const REDIRECT_URI = `${APP_URL}/api/gsc/callback`

export const OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/webmasters.readonly',
].join(' ')

/** Build the Google OAuth2 authorization URL. */
export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: OAUTH_SCOPES,
    access_type: 'offline',
    prompt: 'consent',           // ensures refresh_token is always returned
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

/** Exchange authorization code for tokens. */
export async function exchangeCode(code: string): Promise<{ access_token: string; refresh_token: string }> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  })
  const data = await res.json()
  if (!data.access_token) {
    throw new Error(`OAuth code exchange failed: ${JSON.stringify(data)}`)
  }
  return data
}

/** Use a refresh token to get a fresh access token. */
export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json()
  if (!data.access_token) {
    throw new Error(`Token refresh failed: ${JSON.stringify(data)}`)
  }
  return data.access_token
}

export interface GscRow {
  keys: string[]
  clicks: number
  impressions: number
  ctr: number
  position: number
}

/** Query the Search Console searchAnalytics endpoint. */
export async function querySearchAnalytics(
  accessToken: string,
  siteUrl: string,
  body: Record<string, unknown>
): Promise<GscRow[]> {
  const encoded = encodeURIComponent(siteUrl)
  const res = await fetch(`${GSC_BASE}/sites/${encoded}/searchAnalytics/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`GSC ${res.status} for ${siteUrl}: ${err.slice(0, 400)}`)
  }
  const json = await res.json()
  return json.rows ?? []
}

/** Format a Date as YYYY-MM-DD for the GSC API. */
export function toGscDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Truncate a date to the first day of its month. */
export function toMonthStart(dateStr: string): string {
  return dateStr.slice(0, 7) + '-01'
}
