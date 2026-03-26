/**
 * LoyaltyLion API v2 client
 * Docs: https://developers.loyaltylion.com/api/v2
 * Auth: Bearer PAT (Personal Access Token) — no secret required
 */

const BASE_URL = 'https://api.loyaltylion.com/v2'

function headers(token: string, secret?: string | null): Record<string, string> {
  // LoyaltyLion v2 uses HTTP Basic Auth (token:secret). If only token is stored
  // (legacy), fall back to Bearer which also works for read-only endpoints.
  const auth = secret
    ? 'Basic ' + Buffer.from(`${token}:${secret}`).toString('base64')
    : `Bearer ${token}`
  return {
    Authorization: auth,
    'Content-Type': 'application/json',
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LoyaltyCustomer {
  id: string | number
  email: string | null
  points_approved: number
  points_pending: number
  points_spent: number
  loyalty_tier_membership: { loyalty_tier: { name: string } } | null
  enrolled: boolean
  enrolled_at: string | null
}

export interface LoyaltyActivity {
  id: string | number
  customer: { id: number; email: string; points_approved: number; points_spent: number } | null
  value: number         // points amount (positive = earned, negative = spent)
  state: string         // "approved", "pending", "declined"
  rule: { id: number; name: string } | null  // activity type e.g. "$purchase", "$signup"
  created_at: string
}

export interface LoyaltyReward {
  id: string
  name: string
  points_price: number
  discount_type: string
  discount_value: number
  redemptions_count: number
}

export interface LoyaltyCampaign {
  id: string
  name: string
  status: string
  started_at: string | null
  ended_at: string | null
  points_multiplier: number | null
  activity_type: string | null
}

// ── Paginated fetch helper ─────────────────────────────────────────────────────

async function fetchAllPages<T>(
  token: string,
  path: string,
  params: Record<string, string> = {},
  secret?: string | null,
  maxPages = 20
): Promise<T[]> {
  const results: T[] = []
  let cursor: string | null = null
  let page = 0

  do {
    const query = new URLSearchParams({ per_page: '500', ...params })
    if (cursor) query.set('cursor', cursor)

    // Abort individual page fetches after 30s to prevent silent hangs
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 30_000)

    let res: Response
    try {
      res = await fetch(`${BASE_URL}${path}?${query}`, {
        headers: headers(token, secret),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`LoyaltyLion API error ${res.status}: ${body}`)
    }

    const data = await res.json() as {
      customers?: T[]
      activities?: T[]
      rewards?: T[]
      campaigns?: T[]
      cursor?: { next: string | null }
    }

    // Extract the array by matching the path segment to the response key
    const key = path.replace('/', '') as keyof typeof data
    const items = (data[key] as T[] | undefined) ?? []

    results.push(...items)

    cursor = data.cursor?.next ?? null
    page++
  } while (cursor && page < maxPages)

  return results
}

// ── Public API functions ──────────────────────────────────────────────────────

export async function getCustomers(token: string, secret?: string | null): Promise<LoyaltyCustomer[]> {
  return fetchAllPages<LoyaltyCustomer>(token, '/customers', {}, secret)
}

export async function getActivities(
  token: string,
  dateRange: { from: string; to: string },
  secret?: string | null
): Promise<LoyaltyActivity[]> {
  return fetchAllPages<LoyaltyActivity>(token, '/activities', {
    created_at_gte: dateRange.from,
    created_at_lte: dateRange.to,
  }, secret)
}

export async function getRewards(token: string, secret?: string | null): Promise<LoyaltyReward[]> {
  return fetchAllPages<LoyaltyReward>(token, '/rewards', {}, secret)
}

export async function getCampaigns(token: string, secret?: string | null): Promise<LoyaltyCampaign[]> {
  return fetchAllPages<LoyaltyCampaign>(token, '/campaigns', {}, secret)
}

export async function testConnection(token: string, secret?: string | null): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(`${BASE_URL}/customers?per_page=1`, {
      headers: headers(token, secret),
    })
    if (res.ok) {
      return { ok: true, message: 'Connection successful — token verified' }
    }
    const body = await res.json() as { error?: string }
    return { ok: false, message: body.error ?? `HTTP ${res.status}` }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}
