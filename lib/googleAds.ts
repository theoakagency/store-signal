// ── Google Ads API v19 service ────────────────────────────────────────────────
// REST API via searchStream endpoint + OAuth2 + developer-token header

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const BASE_URL = 'https://googleads.googleapis.com/v19'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface GoogleCampaign {
  id: string
  name: string
  status: string
  campaign_type: string
  spend: number
  impressions: number
  clicks: number
  ctr: number
  avg_cpc: number
  conversions: number
  conversion_value: number
  roas: number
  impression_share: number | null
  date_start: string
  date_stop: string
}

export interface GoogleAccountSummary {
  spend: number
  impressions: number
  clicks: number
  conversions: number
  conversion_value: number
  roas: number
  avg_cpc: number
}

interface TokenResponse {
  access_token: string
  error?: string
  error_description?: string
}

// ── Auth ──────────────────────────────────────────────────────────────────────

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
  const data = await res.json() as TokenResponse
  if (data.error) throw new Error(`Token refresh failed: ${data.error_description ?? data.error}`)
  return data.access_token
}

// ── GAQL helpers ──────────────────────────────────────────────────────────────

interface GaqlRow {
  campaign?: {
    id?: string
    name?: string
    status?: string
    advertising_channel_type?: string
  }
  metrics?: {
    cost_micros?: string
    impressions?: string
    clicks?: string
    ctr?: string
    average_cpc?: string
    conversions?: string
    conversions_value?: string
    search_impression_share?: string
  }
  segments?: {
    date?: string
  }
}

async function gaqlSearch(
  customerId: string,
  accessToken: string,
  developerToken: string,
  query: string
): Promise<GaqlRow[]> {
  const cleanId = customerId.replace(/-/g, '')
  const url = `${BASE_URL}/customers/${cleanId}/googleAds:search`
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'developer-token': developerToken,
    'Content-Type': 'application/json',
  }

  const rows: GaqlRow[] = []
  let pageToken: string | undefined

  do {
    const body: Record<string, unknown> = { query, pageSize: 10000 }
    if (pageToken) body.pageToken = pageToken

    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Google Ads API error (${res.status}): ${text}`)
    }

    const data = await res.json() as { results?: GaqlRow[]; nextPageToken?: string }
    if (data.results) rows.push(...data.results)
    pageToken = data.nextPageToken
  } while (pageToken)

  return rows
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getCampaigns(
  customerId: string,
  refreshToken: string,
  developerToken: string,
  dateRangeDays = 90
): Promise<GoogleCampaign[]> {
  const accessToken = await refreshAccessToken(refreshToken)

  const now = new Date()
  const start = new Date(now)
  start.setDate(start.getDate() - dateRangeDays)
  const dateStart = start.toISOString().slice(0, 10)
  const dateEnd = now.toISOString().slice(0, 10)

  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.ctr,
      metrics.average_cpc,
      metrics.conversions,
      metrics.conversions_value,
      metrics.search_impression_share
    FROM campaign
    WHERE segments.date BETWEEN '${dateStart}' AND '${dateEnd}'
      AND campaign.status != 'REMOVED'
  `

  const rows = await gaqlSearch(customerId, accessToken, developerToken, query)

  // Aggregate by campaign (rows are daily breakdowns)
  const map = new Map<string, GoogleCampaign>()
  for (const row of rows) {
    const id = row.campaign?.id ?? 'unknown'
    const existing = map.get(id)
    const spend = (parseInt(row.metrics?.cost_micros ?? '0', 10)) / 1_000_000
    const impressions = parseInt(row.metrics?.impressions ?? '0', 10)
    const clicks = parseInt(row.metrics?.clicks ?? '0', 10)
    const conversions = parseFloat(row.metrics?.conversions ?? '0')
    const convValue = parseFloat(row.metrics?.conversions_value ?? '0')
    const impressionShare = row.metrics?.search_impression_share ? parseFloat(row.metrics.search_impression_share) : null

    if (existing) {
      existing.spend += spend
      existing.impressions += impressions
      existing.clicks += clicks
      existing.conversions += conversions
      existing.conversion_value += convValue
    } else {
      map.set(id, {
        id,
        name: row.campaign?.name ?? 'Unknown',
        status: row.campaign?.status ?? 'UNKNOWN',
        campaign_type: row.campaign?.advertising_channel_type ?? 'UNKNOWN',
        spend,
        impressions,
        clicks,
        ctr: 0,
        avg_cpc: 0,
        conversions,
        conversion_value: convValue,
        roas: 0,
        impression_share: impressionShare,
        date_start: dateStart,
        date_stop: dateEnd,
      })
    }
  }

  // Compute derived metrics
  const campaigns = Array.from(map.values()).map((c) => ({
    ...c,
    ctr: c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0,
    avg_cpc: c.clicks > 0 ? c.spend / c.clicks : 0,
    roas: c.spend > 0 ? c.conversion_value / c.spend : 0,
  }))

  return campaigns
}

export async function getAccountSummary(
  customerId: string,
  refreshToken: string,
  developerToken: string,
  dateRangeDays = 30
): Promise<GoogleAccountSummary> {
  const campaigns = await getCampaigns(customerId, refreshToken, developerToken, dateRangeDays)
  const spend = campaigns.reduce((s, c) => s + c.spend, 0)
  const impressions = campaigns.reduce((s, c) => s + c.impressions, 0)
  const clicks = campaigns.reduce((s, c) => s + c.clicks, 0)
  const conversions = campaigns.reduce((s, c) => s + c.conversions, 0)
  const convValue = campaigns.reduce((s, c) => s + c.conversion_value, 0)

  return {
    spend,
    impressions,
    clicks,
    conversions,
    conversion_value: convValue,
    roas: spend > 0 ? convValue / spend : 0,
    avg_cpc: clicks > 0 ? spend / clicks : 0,
  }
}
