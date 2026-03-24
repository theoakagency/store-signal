// ── Meta / Facebook Ads API service ──────────────────────────────────────────
// Graph API v19.0  |  Auth: access_token query param

const BASE_URL = 'https://graph.facebook.com/v19.0'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface MetaAdAccount {
  id: string
  name: string
  currency: string
  account_status: number
}

export interface MetaCampaign {
  id: string
  name: string
  status: string
  objective: string
  spend: number
  impressions: number
  clicks: number
  ctr: number
  cpc: number
  cpm: number
  purchases: number
  purchase_value: number
  roas: number
  reach: number
  frequency: number
  date_start: string
  date_stop: string
}

export interface MetaAccountSummary {
  spend: number
  impressions: number
  clicks: number
  purchases: number
  purchase_value: number
  roas: number
  cpc: number
  cpm: number
  ctr: number
}

interface RawAction {
  action_type: string
  value: string
}

interface RawInsights {
  spend: string
  impressions: string
  clicks: string
  ctr: string
  cpc: string
  cpm: string
  reach: string
  frequency: string
  date_start: string
  date_stop: string
  actions?: RawAction[]
  action_values?: RawAction[]
}

interface RawCampaign {
  id: string
  name: string
  status: string
  objective: string
  insights?: { data: RawInsights[] }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function actionValue(actions: RawAction[] | undefined, type: string): number {
  return parseFloat(actions?.find((a) => a.action_type === type)?.value ?? '0') || 0
}

function parseInsights(raw: RawInsights, campaign: { id: string; name: string; status: string; objective: string }): MetaCampaign {
  const spend = parseFloat(raw.spend ?? '0')
  const purchases = actionValue(raw.actions, 'purchase')
  const purchaseValue = actionValue(raw.action_values, 'purchase')
  const roas = spend > 0 ? purchaseValue / spend : 0

  return {
    id: campaign.id,
    name: campaign.name,
    status: campaign.status,
    objective: campaign.objective ?? '',
    spend,
    impressions: parseInt(raw.impressions ?? '0', 10),
    clicks: parseInt(raw.clicks ?? '0', 10),
    ctr: parseFloat(raw.ctr ?? '0'),
    cpc: parseFloat(raw.cpc ?? '0'),
    cpm: parseFloat(raw.cpm ?? '0'),
    purchases,
    purchase_value: purchaseValue,
    roas,
    reach: parseInt(raw.reach ?? '0', 10),
    frequency: parseFloat(raw.frequency ?? '0'),
    date_start: raw.date_start,
    date_stop: raw.date_stop,
  }
}

async function metaGet(path: string, accessToken: string, params: Record<string, string> = {}): Promise<unknown> {
  const qs = new URLSearchParams({ access_token: accessToken, ...params })
  const res = await fetch(`${BASE_URL}/${path}?${qs}`)
  const json = await res.json() as { error?: { message: string }; [key: string]: unknown }
  if (json.error) throw new Error(`Meta API error: ${json.error.message}`)
  return json
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getAdAccounts(accessToken: string): Promise<MetaAdAccount[]> {
  const data = await metaGet('me/adaccounts', accessToken, {
    fields: 'id,name,currency,account_status',
  }) as { data: MetaAdAccount[] }
  return data.data ?? []
}

const INSIGHTS_FIELDS = [
  'spend',
  'impressions',
  'clicks',
  'ctr',
  'cpc',
  'cpm',
  'reach',
  'frequency',
  'actions',
  'action_values',
].join(',')

export async function getCampaigns(
  accessToken: string,
  adAccountId: string,
  datePreset = 'last_90d'
): Promise<MetaCampaign[]> {
  const campaigns: MetaCampaign[] = []
  let after: string | null = null

  do {
    const params: Record<string, string> = {
      fields: `id,name,status,objective,insights.date_preset(${datePreset}){${INSIGHTS_FIELDS}}`,
      limit: '50',
    }
    if (after) params.after = after

    // Ensure adAccountId starts with 'act_'
    const accountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`
    const page = await metaGet(`${accountId}/campaigns`, accessToken, params) as {
      data: RawCampaign[]
      paging?: { cursors?: { after?: string }; next?: string }
    }

    for (const c of page.data ?? []) {
      const insightData = c.insights?.data?.[0]
      if (insightData) {
        campaigns.push(parseInsights(insightData, c))
      }
    }

    after = page.paging?.next ? (page.paging.cursors?.after ?? null) : null
  } while (after)

  return campaigns
}

export async function getAccountInsights(
  accessToken: string,
  adAccountId: string,
  datePreset = 'last_30d'
): Promise<MetaAccountSummary> {
  const accountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`
  const data = await metaGet(`${accountId}/insights`, accessToken, {
    date_preset: datePreset,
    fields: INSIGHTS_FIELDS,
  }) as { data: RawInsights[] }

  const raw = data.data?.[0]
  if (!raw) {
    return { spend: 0, impressions: 0, clicks: 0, purchases: 0, purchase_value: 0, roas: 0, cpc: 0, cpm: 0, ctr: 0 }
  }

  const spend = parseFloat(raw.spend ?? '0')
  const purchases = actionValue(raw.actions, 'purchase')
  const purchaseValue = actionValue(raw.action_values, 'purchase')

  return {
    spend,
    impressions: parseInt(raw.impressions ?? '0', 10),
    clicks: parseInt(raw.clicks ?? '0', 10),
    purchases,
    purchase_value: purchaseValue,
    roas: spend > 0 ? purchaseValue / spend : 0,
    cpc: parseFloat(raw.cpc ?? '0'),
    cpm: parseFloat(raw.cpm ?? '0'),
    ctr: parseFloat(raw.ctr ?? '0'),
  }
}
