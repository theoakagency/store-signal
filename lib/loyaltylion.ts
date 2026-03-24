/**
 * LoyaltyLion API v2 client
 * Docs: https://developers.loyaltylion.com/api/v2
 * Auth: HTTP Basic — token as username, secret as password
 */

const BASE_URL = 'https://api.loyaltylion.com/v2'

function authHeader(token: string, secret: string): string {
  return 'Basic ' + Buffer.from(`${token}:${secret}`).toString('base64')
}

function headers(token: string, secret: string): Record<string, string> {
  return {
    Authorization: authHeader(token, secret),
    'Content-Type': 'application/json',
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LoyaltyCustomer {
  id: string
  email: string
  points_balance: number
  points_earned_total: number
  points_spent_total: number
  tier: { name: string } | null
  enrolled_at: string | null
  last_activity_at: string | null
}

export interface LoyaltyActivity {
  id: string
  customer: { email: string }
  activity_type: string
  points_change: number
  description: string | null
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
  secret: string,
  path: string,
  params: Record<string, string> = {}
): Promise<T[]> {
  const results: T[] = []
  let page = 1

  do {
    const query = new URLSearchParams({ per_page: '500', page: String(page), ...params })
    const res = await fetch(`${BASE_URL}${path}?${query}`, { headers: headers(token, secret) })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`LoyaltyLion API error ${res.status}: ${body}`)
    }

    const data = await res.json() as { customers?: T[]; activities?: T[]; rewards?: T[]; campaigns?: T[] }

    // Extract the array by guessing the key from the path
    const key = path.replace('/', '') as keyof typeof data
    const items = (data[key] as T[] | undefined) ?? []

    results.push(...items)

    // LoyaltyLion uses page-based pagination; stop when fewer items returned than requested
    if (items.length < 500) break
    page++
  } while (true)

  return results
}

// ── Public API functions ──────────────────────────────────────────────────────

export async function getCustomers(token: string, secret: string): Promise<LoyaltyCustomer[]> {
  return fetchAllPages<LoyaltyCustomer>(token, secret, '/customers')
}

export async function getActivities(
  token: string,
  secret: string,
  dateRange: { from: string; to: string }
): Promise<LoyaltyActivity[]> {
  return fetchAllPages<LoyaltyActivity>(token, secret, '/activities', {
    created_at_gte: dateRange.from,
    created_at_lte: dateRange.to,
  })
}

export async function getRewards(token: string, secret: string): Promise<LoyaltyReward[]> {
  return fetchAllPages<LoyaltyReward>(token, secret, '/rewards')
}

export async function getCampaigns(token: string, secret: string): Promise<LoyaltyCampaign[]> {
  return fetchAllPages<LoyaltyCampaign>(token, secret, '/campaigns')
}

export async function testConnection(
  token: string,
  secret: string
): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(`${BASE_URL}/customers?per_page=1`, {
      headers: headers(token, secret),
    })
    if (res.ok) {
      return { ok: true, message: 'Connection successful — credentials verified' }
    }
    const body = await res.json() as { error?: string }
    return { ok: false, message: body.error ?? `HTTP ${res.status}` }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}
