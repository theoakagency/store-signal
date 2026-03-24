// ── Google Analytics 4 Data API client ────────────────────────────────────────

const GA4_BASE = 'https://analyticsdata.googleapis.com/v1beta'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'

export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://store-signal.vercel.app'
export const REDIRECT_URI = `${APP_URL}/api/analytics/callback`
export const OAUTH_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly'

export function buildAuthUrl(propertyId: string): string {
  const state = Buffer.from(JSON.stringify({ propertyId })).toString('base64url')
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: OAUTH_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

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
  if (!data.access_token) throw new Error(`OAuth failed: ${JSON.stringify(data)}`)
  return data
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
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
  if (!data.access_token) throw new Error(`Token refresh failed: ${JSON.stringify(data)}`)
  return data.access_token
}

interface GA4ReportRow {
  dimensions: string[]
  metrics: string[]
}

async function runReport(
  propertyId: string,
  accessToken: string,
  body: Record<string, unknown>
): Promise<GA4ReportRow[]> {
  const res = await fetch(`${GA4_BASE}/properties/${propertyId}:runReport`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`GA4 API error (${res.status}): ${text.slice(0, 500)}`)
  }
  const data = await res.json() as {
    rows?: Array<{
      dimensionValues?: Array<{ value: string }>
      metricValues?: Array<{ value: string }>
    }>
  }
  return (data.rows ?? []).map((row) => ({
    dimensions: (row.dimensionValues ?? []).map((d) => d.value),
    metrics: (row.metricValues ?? []).map((m) => m.value),
  }))
}

// ── Channel sessions ──────────────────────────────────────────────────────────

export interface ChannelRow {
  channel: string
  sessions: number
  conversions: number
  revenue: number
}

export async function getChannelSessions(
  propertyId: string,
  refreshToken: string,
  days = 90
): Promise<ChannelRow[]> {
  const token = await refreshAccessToken(refreshToken)
  const rows = await runReport(propertyId, token, {
    dimensions: [{ name: 'sessionDefaultChannelGroup' }],
    metrics: [
      { name: 'sessions' },
      { name: 'conversions' },
      { name: 'purchaseRevenue' },
    ],
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
    limit: 20,
  })
  return rows.map((r) => ({
    channel: r.dimensions[0] ?? 'Unknown',
    sessions: parseInt(r.metrics[0] ?? '0', 10),
    conversions: parseInt(r.metrics[1] ?? '0', 10),
    revenue: parseFloat(r.metrics[2] ?? '0'),
  }))
}

// ── Landing pages ─────────────────────────────────────────────────────────────

export interface PageRow {
  pagePath: string
  sessions: number
  conversions: number
  avgTimeSeconds: number
}

export async function getLandingPages(
  propertyId: string,
  refreshToken: string,
  days = 90,
  limit = 25
): Promise<PageRow[]> {
  const token = await refreshAccessToken(refreshToken)
  const rows = await runReport(propertyId, token, {
    dimensions: [{ name: 'landingPagePlusQueryString' }],
    metrics: [
      { name: 'sessions' },
      { name: 'conversions' },
      { name: 'averageSessionDuration' },
    ],
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit,
  })
  return rows.map((r) => ({
    pagePath: r.dimensions[0] ?? '/',
    sessions: parseInt(r.metrics[0] ?? '0', 10),
    conversions: parseInt(r.metrics[1] ?? '0', 10),
    avgTimeSeconds: parseFloat(r.metrics[2] ?? '0'),
  }))
}

// ── Monthly trend ─────────────────────────────────────────────────────────────

export interface MonthlyRow {
  month: string
  sessions: number
}

export async function getMonthlySessions(
  propertyId: string,
  refreshToken: string
): Promise<MonthlyRow[]> {
  const token = await refreshAccessToken(refreshToken)
  const rows = await runReport(propertyId, token, {
    dimensions: [{ name: 'yearMonth' }],
    metrics: [{ name: 'sessions' }],
    dateRanges: [{ startDate: '365daysAgo', endDate: 'today' }],
    orderBys: [{ dimension: { dimensionName: 'yearMonth' }, desc: false }],
    limit: 13,
  })
  return rows.map((r) => ({
    month: `${r.dimensions[0].slice(0, 4)}-${r.dimensions[0].slice(4, 6)}`,
    sessions: parseInt(r.metrics[0] ?? '0', 10),
  }))
}

// ── Ecommerce summary ─────────────────────────────────────────────────────────

export interface EcommerceMetrics {
  transactions: number
  revenue: number
  aov: number
  sessions: number
  conversionRate: number
}

export async function getEcommerceMetrics(
  propertyId: string,
  refreshToken: string,
  days = 90
): Promise<EcommerceMetrics> {
  const token = await refreshAccessToken(refreshToken)
  const rows = await runReport(propertyId, token, {
    metrics: [
      { name: 'ecommercePurchases' },
      { name: 'purchaseRevenue' },
      { name: 'sessions' },
    ],
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
    limit: 1,
  })
  if (rows.length === 0) return { transactions: 0, revenue: 0, aov: 0, sessions: 0, conversionRate: 0 }
  const r = rows[0]
  const transactions = parseInt(r.metrics[0] ?? '0', 10)
  const revenue = parseFloat(r.metrics[1] ?? '0')
  const sessions = parseInt(r.metrics[2] ?? '0', 10)
  return {
    transactions,
    revenue,
    aov: transactions > 0 ? revenue / transactions : 0,
    sessions,
    conversionRate: sessions > 0 ? (transactions / sessions) * 100 : 0,
  }
}

// ── Google Ads campaigns via GA4 ──────────────────────────────────────────────

export interface GA4CampaignRow {
  campaignName: string
  sessions: number
  conversions: number
  revenue: number
}

export async function getGoogleAdsCampaigns(
  propertyId: string,
  refreshToken: string,
  days = 90
): Promise<GA4CampaignRow[]> {
  const token = await refreshAccessToken(refreshToken)
  const rows = await runReport(propertyId, token, {
    dimensions: [{ name: 'sessionGoogleAdsCampaignName' }],
    metrics: [
      { name: 'sessions' },
      { name: 'conversions' },
      { name: 'purchaseRevenue' },
    ],
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: 50,
  })
  return rows
    .filter((r) => r.dimensions[0] && r.dimensions[0] !== '(not set)' && r.dimensions[0] !== '')
    .map((r) => ({
      campaignName: r.dimensions[0],
      sessions: parseInt(r.metrics[0] ?? '0', 10),
      conversions: parseInt(r.metrics[1] ?? '0', 10),
      revenue: parseFloat(r.metrics[2] ?? '0'),
    }))
}
