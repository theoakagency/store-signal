/**
 * ShipStation API v2 client
 * Docs: https://docs.shipstation.com
 */

const BASE_URL = 'https://api.shipstation.com'
const PAGE_SIZE = 100

function headers(apiKey: string): Record<string, string> {
  return {
    'API-Key': apiKey,
    'Content-Type': 'application/json',
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ShipStationLabel {
  label_id: string
  shipment_id: string
  external_order_id: string | null
  external_shipment_id: string | null
  ship_date: string | null
  created_at: string
  carrier_id: string | null
  service_code: string | null
  shipment_cost: { currency: string; amount: number } | null
  status: string
}

// ── Date range helpers ───────────────────────────────────────────────────────
// ShipStation's v2 API requires full ISO 8601 timestamps for created_at_start/end,
// not plain dates — normalize whatever date string comes in to midnight UTC
// (start) or 23:59:59.999 UTC (end) of that calendar date.

function startOfDayUTC(dateStr: string): string {
  const d = new Date(dateStr)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0)).toISOString()
}

function endOfDayUTC(dateStr: string): string {
  const d = new Date(dateStr)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999)).toISOString()
}

// ── Paginated fetch helper ───────────────────────────────────────────────────
// v2 uses offset pagination (page / page_size). Stop once a page comes back
// shorter than the requested size — avoids depending on exact total/pages
// envelope field names.

async function fetchAllLabels(
  apiKey: string,
  params: Record<string, string>
): Promise<ShipStationLabel[]> {
  const results: ShipStationLabel[] = []
  let page = 1

  while (true) {
    if (page > 1) await sleep(150)

    const query = new URLSearchParams({ ...params, page: String(page), page_size: String(PAGE_SIZE) })
    const res = await fetch(`${BASE_URL}/v2/labels?${query}`, { headers: headers(apiKey) })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`ShipStation API error ${res.status}: ${body}`)
    }

    const data = await res.json() as { labels?: ShipStationLabel[] }
    const items = data.labels ?? []
    results.push(...items)

    if (items.length < PAGE_SIZE) break
    page += 1
  }

  return results
}

// ── Public API functions ─────────────────────────────────────────────────────

export async function getLabels(
  apiKey: string,
  dateRange: { start: string; end: string }
): Promise<ShipStationLabel[]> {
  return fetchAllLabels(apiKey, {
    created_at_start: startOfDayUTC(dateRange.start),
    created_at_end: endOfDayUTC(dateRange.end),
  })
}

export async function testConnection(apiKey: string): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(`${BASE_URL}/v2/labels?page_size=1`, { headers: headers(apiKey) })
    if (res.ok) {
      const data = await res.json() as { labels?: unknown[] }
      const count = data.labels?.length ?? 0
      return { ok: true, message: `Connection successful — API responded with ${count} result(s)` }
    }
    const body = await res.text()
    return { ok: false, message: `HTTP ${res.status}: ${body.slice(0, 200)}` }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}
