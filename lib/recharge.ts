/**
 * Recharge Subscriptions API client
 * Docs: https://developer.rechargepayments.com/2021-11
 */

const BASE_URL = 'https://api.rechargeapps.com'
const API_VERSION = '2021-11'

function headers(apiToken: string): Record<string, string> {
  return {
    'X-Recharge-Access-Token': apiToken,
    'X-Recharge-Version': API_VERSION,
    'Content-Type': 'application/json',
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RechargeSubscription {
  id: string
  customer_id: string
  customer: { email: string } | null
  status: 'ACTIVE' | 'CANCELLED' | 'EXPIRED'
  product_title: string
  variant_title: string | null
  price: string
  quantity: number
  charge_interval_frequency: number
  order_interval_unit: 'week' | 'month' | 'day'
  created_at: string
  cancelled_at: string | null
  next_charge_scheduled_at: string | null
  cancellation_reason: string | null
}

export interface RechargeCharge {
  id: string
  subscription_id: string | null
  customer: { email: string } | null
  status: 'SUCCESS' | 'SKIPPED' | 'REFUNDED' | 'PARTIALLY_REFUNDED' | 'QUEUED' | 'ERROR'
  total_price: string
  scheduled_at: string
  processed_at: string | null
  created_at: string
}

export interface RechargeCustomer {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  subscriptions_active_count: number
  subscriptions_total_count: number
  created_at: string
}

export interface RechargeProduct {
  id: string
  shopify_product_id: string
  title: string
  subscription_defaults: {
    charge_interval_frequency: number
    order_interval_unit: string
  }
}

// ── Paginated fetch helper ─────────────────────────────────────────────────────

async function fetchAllPages<T>(
  apiToken: string,
  path: string,
  params: Record<string, string> = {}
): Promise<T[]> {
  const results: T[] = []
  let cursor: string | null = null

  do {
    const query = new URLSearchParams({ limit: '250', ...params })
    if (cursor) query.set('cursor', cursor)

    const res = await fetch(`${BASE_URL}${path}?${query}`, { headers: headers(apiToken) })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Recharge API error ${res.status}: ${body}`)
    }

    const data = await res.json() as {
      subscriptions?: T[]
      charges?: T[]
      customers?: T[]
      products?: T[]
      next_cursor?: string | null
    }

    // Extract the array (key varies by endpoint)
    const items = (
      (data as Record<string, unknown>)[path.split('/').pop() ?? ''] as T[] | undefined
    ) ?? []
    results.push(...items)

    cursor = data.next_cursor ?? null
  } while (cursor)

  return results
}

// ── Public API functions ──────────────────────────────────────────────────────

export async function getSubscriptions(
  apiToken: string,
  status?: 'ACTIVE' | 'CANCELLED' | 'EXPIRED'
): Promise<RechargeSubscription[]> {
  const params: Record<string, string> = {}
  if (status) params['status'] = status
  return fetchAllPages<RechargeSubscription>(apiToken, '/subscriptions', params)
}

export async function getCharges(
  apiToken: string,
  dateRange: { from: string; to: string }
): Promise<RechargeCharge[]> {
  return fetchAllPages<RechargeCharge>(apiToken, '/charges', {
    created_at_min: dateRange.from,
    created_at_max: dateRange.to,
  })
}

export async function getCustomers(apiToken: string): Promise<RechargeCustomer[]> {
  return fetchAllPages<RechargeCustomer>(apiToken, '/customers')
}

export async function getProducts(apiToken: string): Promise<RechargeProduct[]> {
  return fetchAllPages<RechargeProduct>(apiToken, '/products')
}

export async function testConnection(apiToken: string): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(`${BASE_URL}/subscriptions?limit=1`, {
      headers: headers(apiToken),
    })
    if (res.ok) {
      const data = await res.json() as { subscriptions?: unknown[] }
      const count = data.subscriptions?.length ?? 0
      return { ok: true, message: `Connection successful — API responded with ${count} result(s)` }
    }
    const body = await res.json() as { error?: string }
    return { ok: false, message: body.error ?? `HTTP ${res.status}` }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}

// ── MRR helper ────────────────────────────────────────────────────────────────

/**
 * Normalize a subscription price to monthly recurring revenue.
 * Recharge uses week-based intervals for adhesive subscriptions.
 */
export function toMonthlyRevenue(
  price: number,
  quantity: number,
  intervalFrequency: number,
  intervalUnit: string
): number {
  const WEEKS_PER_MONTH = 4.33
  let multiplier = 1

  if (intervalUnit === 'week') {
    // e.g. every 3 weeks → 4.33/3 charges per month
    multiplier = WEEKS_PER_MONTH / intervalFrequency
  } else if (intervalUnit === 'month') {
    multiplier = 1 / intervalFrequency
  } else if (intervalUnit === 'day') {
    multiplier = 30 / intervalFrequency
  }

  return price * quantity * multiplier
}
