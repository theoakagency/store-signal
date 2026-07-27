/**
 * Shared domain rules for the Korean Lash Lift (KLL) reports.
 *
 * Extracted from app/api/lbla/reports/kll-royalty/route.ts so the KLL royalty
 * report and the KLL discount summary agree by construction. These definitions
 * decide what counts as a KLL sale and what a giveaway costs, so a second copy
 * drifting out of sync would put two different numbers in front of the client.
 */

// The 16 SKUs that count as Korean Lash Lift product.
export const TARGET_SKUS = new Set([
  'MKLBKLLKTGWP', 'KLLMXGPLT', 'KLLFLTSHD', 'KLLRUSBEYEPD3',
  'KLLBRSH3', 'KLLBRSH2', 'KLLBRSH1', 'KLLEYEPRCWP',
  'KLLESN6', 'KLLLBA', 'KLLVCG', 'KLLST2NL',
  'KLLST1LSL', 'KLLPTPRM', 'KLLST3TM', 'MKLBKLLKT',
])

// Kit SKUs carry a gift-with-purchase and are ineligible for most discount codes.
export const KIT_SKUS = new Set(['MKLBKLLKT', 'MKLBKLLKTGWP'])

// Event/giveaway code. Orders carrying it are comped stock, not sales, and are
// excluded from every KLL report entirely — no row, no contribution to any total.
export const EVENT_CODE = 'KLLEVENT'

/** Structural minimum needed to classify an order; both routes' row types satisfy it. */
export interface EventOrderShape {
  discount_codes: Array<{ code: string }> | null
  line_items: Array<{ discount_allocations: Array<{ code: string | null }> | null }> | null
}

/**
 * KLLEVENT can surface either on the order as a discount_codes entry or per line
 * as an allocation, so both are checked.
 *
 * It reaches the data at all only because lib/syncShopify.ts falls back to
 * discount_applications.title for *manual* discounts — KLLEVENT is applied
 * manually, so it has no `.code` and was previously invisible to this check
 * (migration 037 recorded that as a known gap).
 */
export function isEventOrder(order: EventOrderShape): boolean {
  if ((order.discount_codes ?? []).some((c) => c.code?.trim().toUpperCase() === EVENT_CODE)) return true
  return (order.line_items ?? []).some((li) =>
    (li.discount_allocations ?? []).some((a) => a.code?.trim().toUpperCase() === EVENT_CODE)
  )
}

/**
 * Cost of the free gift bundled with a kit, identified from the line's title and
 * variant text because the gift is not a separate line item.
 */
export function gwpCost(sku: string, title: string, variantTitle: string | null): number {
  if (!KIT_SKUS.has(sku)) return 0
  const combined = `${title} ${variantTitle ?? ''}`.toLowerCase()
  if (combined.includes('precision lash applicator')) return 6.90
  if (combined.includes('mixing palette')) return 3.00
  return 0
}

// ── Month helpers ─────────────────────────────────────────────────────────────

// LashBox LA's store timezone. "June 2026" for these reports means the calendar
// month in THIS zone, matching what a Shopify Admin export buckets on — not UTC.
// Filtering orders on UTC boundaries pulled late-evening-Pacific orders on the
// last of a month into the next month (and vice-versa), which is what put the KLL
// reports 1–2 units per SKU out of step with Shopify's own "Sales by product".
export const STORE_TIMEZONE = 'America/Los_Angeles'

// Offset in ms between the store timezone and UTC at a given instant:
// storeWallClockMs = utcMs + tzOffsetMs(utcMs). Negative for LA (behind UTC:
// −7h in PDT, −8h in PST). Computed from Intl so DST is handled for real rather
// than hard-coded, which matters because the fix must hold every month, not June.
function tzOffsetMs(utcMs: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: STORE_TIMEZONE, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs))
  const p: Record<string, number> = {}
  for (const { type, value } of parts) if (type !== 'literal') p[type] = Number(value)
  // Intl renders midnight as hour 24 in some engines; normalise to 0.
  const utcOfWall = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second)
  return utcOfWall - utcMs
}

// UTC instant of local midnight on the 1st of (year, month1based) in the store
// timezone. Take the wall-clock target as if it were UTC, then correct by the
// zone's offset at that instant; a second pass settles any DST edge (month
// boundaries never land on a US DST switch, but the pass is cheap and safe).
function zonedMonthStart(year: number, month1based: number): Date {
  const wallAsUtc = Date.UTC(year, month1based - 1, 1, 0, 0, 0)
  let utc = wallAsUtc - tzOffsetMs(wallAsUtc)
  utc = wallAsUtc - tzOffsetMs(utc)
  return new Date(utc)
}

/** Previous calendar month in YYYY-MM (store timezone) — the default reports open on. */
export function getDefaultMonth(): string {
  const now = new Date()
  // "Now" in the store timezone, so the default month flips at local — not UTC —
  // midnight on the 1st.
  const localNow = new Date(now.getTime() + tzOffsetMs(now.getTime()))
  const y = localNow.getUTCFullYear()
  const m = localNow.getUTCMonth() // 0-based; this month
  const prev = new Date(Date.UTC(m === 0 ? y - 1 : y, m === 0 ? 11 : m - 1, 1))
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * Half-open [start, end) UTC range covering the given YYYY-MM in the STORE
 * timezone. Because orders are filtered on `processed_at` (a UTC timestamp),
 * these bounds are the UTC instants of local month start/end — e.g. June 2026 is
 * [2026-06-01T07:00Z, 2026-07-01T07:00Z) in PDT.
 */
export function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number)
  const start = zonedMonthStart(y, m)
  const end = zonedMonthStart(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1)
  return { start: start.toISOString(), end: end.toISOString() }
}

/**
 * Groups a raw Shopify discount code into the bucket the reports present.
 * DT- and LL- codes are per-customer/per-redemption and run to hundreds of
 * distinct values a month, so they are only meaningful in aggregate.
 */
export function discountCodeGroup(code: string): string {
  const upper = code.trim().toUpperCase()
  if (upper.startsWith('DT')) return 'Brand Ambassador (DT)'
  if (upper.startsWith('LL')) return 'Loyalty Lion (LL)'
  return code.trim()
}
