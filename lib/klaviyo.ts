/**
 * Klaviyo REST API client — revision 2024-02-15
 * All calls are server-side only. Never import this in client components.
 *
 * Docs: https://developers.klaviyo.com/en/reference/api_overview
 */

const BASE = 'https://a.klaviyo.com/api'
const REVISION = '2024-02-15'

// ── Klaviyo response envelope types ───────────────────────────────────────────

interface KlaviyoPage<T> {
  data: T[]
  links: {
    self: string
    next: string | null
    prev: string | null
  }
}

interface KlaviyoSingle<T> {
  data: T
}

// ── Domain attribute types ─────────────────────────────────────────────────────

export interface KlaviyoCampaignAttributes {
  name: string
  status: string
  archived: boolean
  created_at: string
  scheduled_at: string | null
  updated_at: string
  send_time: string | null
}

export interface KlaviyoCampaign {
  type: 'campaign'
  id: string
  attributes: KlaviyoCampaignAttributes
}

export interface KlaviyoCampaignMessageAttributes {
  label: string | null
  subject: string | null
  channel: string
  from_email: string | null
  from_label: string | null
}

export interface KlaviyoCampaignMessage {
  type: 'campaign-message'
  id: string
  attributes: KlaviyoCampaignMessageAttributes
  relationships?: {
    campaign?: { data: { type: 'campaign'; id: string } }
  }
}

export interface KlaviyoFlowAttributes {
  name: string
  status: string
  archived: boolean
  created: string
  updated: string
  trigger_type: string | null
}

export interface KlaviyoFlow {
  type: 'flow'
  id: string
  attributes: KlaviyoFlowAttributes
}

export interface KlaviyoListAttributes {
  name: string
  created: string
  updated: string
  opt_in_process: string
}

export interface KlaviyoList {
  type: 'list'
  id: string
  attributes: KlaviyoListAttributes
}

export interface KlaviyoMetricAttributes {
  name: string
  created: string
  updated: string
  integration: {
    object: string
    name: string
    category: string
    id: string
  }
}

export interface KlaviyoMetric {
  type: 'metric'
  id: string
  attributes: KlaviyoMetricAttributes
}

export interface KlaviyoAccountAttributes {
  test_account: boolean
  timezone: string
  preferred_currency: string
  public_api_key: string
  contact_information: {
    organization_name: string | null
    default_sender_name: string | null
    default_sender_email: string | null
  }
}

export interface KlaviyoAccount {
  type: 'account'
  id: string
  attributes: KlaviyoAccountAttributes
}

// ── Campaign stats from values-report ─────────────────────────────────────────

export interface CampaignStatRow {
  groupings: {
    campaign_id: string
    send_channel?: string
  }
  statistics: {
    delivered?: number
    opens_unique?: number
    clicks_unique?: number
    unsubscribes?: number
    conversions_value?: number
    recipients?: number
  }
}

export interface FlowStatRow {
  groupings: {
    flow_id: string
  }
  statistics: {
    delivered?: number
    opens_unique?: number
    clicks_unique?: number
    conversions_unique?: number
    conversions_value?: number
    recipients?: number
  }
}

// ── Enriched types returned to callers ────────────────────────────────────────

export interface CampaignWithStats {
  id: string
  name: string
  subject: string | null
  status: string
  send_time: string | null
  created_at: string
  updated_at: string
  recipient_count: number
  open_rate: number | null
  click_rate: number | null
  revenue_attributed: number
  unsubscribe_count: number
}

export interface FlowWithStats {
  id: string
  name: string
  status: string
  trigger_type: string | null
  created_at: string
  updated_at: string
  recipient_count: number
  open_rate: number | null
  click_rate: number | null
  conversion_rate: number | null
  revenue_attributed: number
}

export interface ListSummary {
  id: string
  name: string
  opt_in_process: string
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

async function kv<T>(
  apiKey: string,
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Klaviyo-API-Key ${apiKey}`,
      revision: REVISION,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options?.headers ?? {}),
    },
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Klaviyo API ${res.status} on ${path}: ${body.slice(0, 300)}`)
  }

  return res.json() as Promise<T>
}

/** Fetches all pages of a paginated GET endpoint. */
async function fetchAllPages<T>(
  apiKey: string,
  firstPath: string
): Promise<T[]> {
  const items: T[] = []
  let path: string | null = firstPath

  while (path) {
    // Klaviyo next links are full URLs — strip the base for our helper
    const relPath: string = path.startsWith('https://') ? path.replace('https://a.klaviyo.com/api', '') : path
    const page = await kv<KlaviyoPage<T>>(apiKey, relPath)
    items.push(...page.data)
    path = page.links?.next ?? null
  }

  return items
}

// ── Public API functions ───────────────────────────────────────────────────────

/** Verify API key works — returns account info. */
export async function getAccount(apiKey: string): Promise<KlaviyoAccount> {
  const res = await kv<KlaviyoPage<KlaviyoAccount>>(apiKey, '/accounts/')
  if (!res.data[0]) throw new Error('No account data returned')
  return res.data[0]
}

/** Fetch all email campaigns. */
export async function getCampaigns(apiKey: string): Promise<KlaviyoCampaign[]> {
  return fetchAllPages<KlaviyoCampaign>(
    apiKey,
    `/campaigns/?filter=equals(messages.channel,'email')&sort=-created_at`
  )
}

/** Fetch campaign messages to get subject lines and recipient counts. */
export async function getCampaignMessages(
  apiKey: string,
  campaignId: string
): Promise<KlaviyoCampaignMessage[]> {
  return fetchAllPages<KlaviyoCampaignMessage>(
    apiKey,
    `/campaign-messages/?filter=equals(campaign.id,'${campaignId}')`
  )
}

/** Fetch all flows. */
export async function getFlows(apiKey: string): Promise<KlaviyoFlow[]> {
  return fetchAllPages<KlaviyoFlow>(apiKey, `/flows/?sort=-updated`)
}

/** Fetch all lists with subscriber counts. */
export async function getLists(apiKey: string): Promise<KlaviyoList[]> {
  return fetchAllPages<KlaviyoList>(apiKey, `/lists/`)
}

/** Fetch available metrics (used to find conversion metric ID). */
export async function getMetrics(apiKey: string): Promise<KlaviyoMetric[]> {
  return fetchAllPages<KlaviyoMetric>(apiKey, `/metrics/`)
}

/** Find the Placed Order metric ID for revenue attribution. */
export async function getPlacedOrderMetricId(apiKey: string): Promise<string | null> {
  try {
    const metrics = await getMetrics(apiKey)
    const placed = metrics.find(
      (m) =>
        m.attributes.name === 'Placed Order' ||
        m.attributes.name === 'ordered product'
    )
    return placed?.id ?? null
  } catch {
    return null
  }
}

/**
 * Fetch campaign-level stats via the values-reports endpoint.
 * Returns a map of campaignId → stats. Gracefully returns {} on failure.
 */
export async function getCampaignStats(
  apiKey: string,
  conversionMetricId: string,
  startDate: Date,
  endDate: Date
): Promise<Record<string, CampaignStatRow['statistics']>> {
  try {
    const body = {
      data: {
        type: 'campaign-values-report',
        attributes: {
          timeframe: {
            start: startDate.toISOString(),
            end: endDate.toISOString(),
          },
          conversion_metric_id: conversionMetricId,
          statistics: [
            'delivered',
            'opens_unique',
            'clicks_unique',
            'unsubscribes',
            'conversions_value',
          ],
        },
      },
    }

    const res = await kv<{
      data: {
        type: string
        attributes: {
          results: CampaignStatRow[]
        }
      }
    }>(apiKey, '/campaign-values-reports/', {
      method: 'POST',
      body: JSON.stringify(body),
    })

    const map: Record<string, CampaignStatRow['statistics']> = {}
    for (const row of res.data.attributes.results ?? []) {
      map[row.groupings.campaign_id] = row.statistics
    }
    return map
  } catch {
    return {}
  }
}

/**
 * Fetch flow-level stats via the values-reports endpoint.
 * Returns a map of flowId → stats. Gracefully returns {} on failure.
 */
export async function getFlowStats(
  apiKey: string,
  conversionMetricId: string,
  startDate: Date,
  endDate: Date
): Promise<Record<string, FlowStatRow['statistics']>> {
  try {
    const body = {
      data: {
        type: 'flow-values-report',
        attributes: {
          timeframe: {
            start: startDate.toISOString(),
            end: endDate.toISOString(),
          },
          conversion_metric_id: conversionMetricId,
          statistics: [
            'delivered',
            'opens_unique',
            'clicks_unique',
            'conversions_unique',
            'conversions_value',
          ],
        },
      },
    }

    const res = await kv<{
      data: {
        type: string
        attributes: {
          results: FlowStatRow[]
        }
      }
    }>(apiKey, '/flow-values-reports/', {
      method: 'POST',
      body: JSON.stringify(body),
    })

    const map: Record<string, FlowStatRow['statistics']> = {}
    for (const row of res.data.attributes.results ?? []) {
      map[row.groupings.flow_id] = row.statistics
    }
    return map
  } catch {
    return {}
  }
}

/**
 * Full campaign sync: fetches campaigns, their messages (for subject),
 * and stats. Returns enriched CampaignWithStats array.
 */
export async function getEnrichedCampaigns(apiKey: string): Promise<CampaignWithStats[]> {
  const [campaigns, metricId] = await Promise.all([
    getCampaigns(apiKey),
    getPlacedOrderMetricId(apiKey),
  ])

  // Fetch stats for the last 2 years
  const endDate = new Date()
  const startDate = new Date()
  startDate.setFullYear(startDate.getFullYear() - 1)

  const statsMap = metricId
    ? await getCampaignStats(apiKey, metricId, startDate, endDate)
    : {}

  // Fetch subject lines for sent campaigns (first message per campaign)
  const subjectMap: Record<string, string> = {}
  const sentCampaigns = campaigns.filter((c) => c.attributes.status === 'Sent' || c.attributes.status === 'sent')

  await Promise.allSettled(
    sentCampaigns.slice(0, 50).map(async (c) => {
      try {
        const msgs = await getCampaignMessages(apiKey, c.id)
        if (msgs[0]?.attributes.subject) {
          subjectMap[c.id] = msgs[0].attributes.subject
        }
      } catch {
        // best-effort
      }
    })
  )

  return campaigns.map((c) => {
    const stats = statsMap[c.id] ?? {}
    const delivered = stats.delivered ?? stats.recipients ?? 0
    const opensUnique = stats.opens_unique ?? 0
    const clicksUnique = stats.clicks_unique ?? 0

    return {
      id: c.id,
      name: c.attributes.name,
      subject: subjectMap[c.id] ?? null,
      status: c.attributes.status,
      send_time: c.attributes.send_time ?? c.attributes.scheduled_at,
      created_at: c.attributes.created_at,
      updated_at: c.attributes.updated_at,
      recipient_count: delivered,
      open_rate: delivered > 0 ? opensUnique / delivered : null,
      click_rate: delivered > 0 ? clicksUnique / delivered : null,
      revenue_attributed: stats.conversions_value ?? 0,
      unsubscribe_count: stats.unsubscribes ?? 0,
    }
  })
}

/**
 * Full flow sync: fetches flows and their stats.
 * Returns enriched FlowWithStats array.
 */
export async function getEnrichedFlows(apiKey: string): Promise<FlowWithStats[]> {
  const [flows, metricId] = await Promise.all([
    getFlows(apiKey),
    getPlacedOrderMetricId(apiKey),
  ])

  const endDate = new Date()
  const startDate = new Date()
  startDate.setFullYear(startDate.getFullYear() - 1)

  const statsMap = metricId
    ? await getFlowStats(apiKey, metricId, startDate, endDate)
    : {}

  return flows.map((f) => {
    const stats = statsMap[f.id] ?? {}
    const delivered = stats.delivered ?? stats.recipients ?? 0
    const opensUnique = stats.opens_unique ?? 0
    const clicksUnique = stats.clicks_unique ?? 0
    const conversions = stats.conversions_unique ?? 0

    return {
      id: f.id,
      name: f.attributes.name,
      status: f.attributes.status,
      trigger_type: f.attributes.trigger_type,
      created_at: f.attributes.created,
      updated_at: f.attributes.updated,
      recipient_count: delivered,
      open_rate: delivered > 0 ? opensUnique / delivered : null,
      click_rate: delivered > 0 ? clicksUnique / delivered : null,
      conversion_rate: delivered > 0 ? conversions / delivered : null,
      revenue_attributed: stats.conversions_value ?? 0,
    }
  })
}
