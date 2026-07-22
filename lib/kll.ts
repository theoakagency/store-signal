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

/** Previous calendar month in YYYY-MM — the default both reports open on. */
export function getDefaultMonth(): string {
  const now = new Date()
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}`
}

/** Half-open [start, end) ISO range covering the given YYYY-MM. */
export function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number)
  return {
    start: new Date(Date.UTC(y, m - 1, 1)).toISOString(),
    end: new Date(Date.UTC(y, m, 1)).toISOString(),
  }
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
