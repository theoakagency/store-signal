/**
 * Shared logic for wholesale order-level discount decisions
 * (/lbla/reports/kll-wholesale). Kept in one place so the decision API route and
 * the report GET route apply the same rules and validation.
 */

export const DISCOUNT_ACTIONS = ['ignore', 'distribute_full', 'distribute_custom', 'full_price'] as const
export type DiscountAction = (typeof DISCOUNT_ACTIONS)[number]

export function isDiscountAction(v: unknown): v is DiscountAction {
  return typeof v === 'string' && (DISCOUNT_ACTIONS as readonly string[]).includes(v)
}

export interface OrderDecision {
  action: DiscountAction
  custom_amount: number | null
}

/**
 * The distribution denominator: the order's FULL line value (all SKUs,
 * pre-discount), captured at upload (migration 042). Falls back to the KLL line
 * total for rows uploaded before that column existed — the old behaviour — until
 * the month is re-uploaded.
 */
export function distributionDenominator(klllineGross: number, orderLineTotal: number | null): number {
  return orderLineTotal != null && orderLineTotal > 0 ? orderLineTotal : klllineGross
}

/**
 * The order's contribution to the report's Gross Sales once a decision is applied.
 *
 *   ignore            → 0 (order dropped from totals; still counts as decided)
 *   full_price        → the recorded KLL line gross, unchanged
 *   distribute_full   → the order's full Discount Amount spread across ALL lines
 *   distribute_custom → the entered amount spread across ALL lines
 *
 * The distribute methods spread the amount across EVERY line in the order in
 * proportion to each line's share of the full order value, then keep only the KLL
 * lines' share. With a uniform ratio the KLL contribution is
 * klllineGross x (1 − amount / orderLineValue), floored at 0. Dividing by the
 * full order value (not the KLL total) means the KLL lines absorb only their
 * proportional part of the discount, since the order-level discount also covered
 * the non-KLL items that aren't in this report.
 *
 * `counts_as_order` is false only for ignore: every other resolved order is a
 * real sale and counts toward Total Orders.
 */
export function orderContribution(
  klllineGross: number,
  orderLineTotal: number | null,
  discountAmount: number | null,
  decision: OrderDecision | null
): { contribution: number; resolved: boolean; counts_as_order: boolean } {
  if (!decision) return { contribution: 0, resolved: false, counts_as_order: false }
  const denom = distributionDenominator(klllineGross, orderLineTotal)
  const distribute = (amount: number) =>
    denom > 0 ? klllineGross * Math.max(0, 1 - amount / denom) : klllineGross
  switch (decision.action) {
    case 'ignore':
      return { contribution: 0, resolved: true, counts_as_order: false }
    case 'full_price':
      return { contribution: klllineGross, resolved: true, counts_as_order: true }
    case 'distribute_full':
      return { contribution: distribute(discountAmount ?? 0), resolved: true, counts_as_order: true }
    case 'distribute_custom':
      return { contribution: distribute(decision.custom_amount ?? 0), resolved: true, counts_as_order: true }
  }
}

/**
 * Per-line adjusted gross for the distribute methods, for display/audit. Each
 * line keeps its share after the amount is spread across the FULL order value.
 */
export function distributedLineGross(lineGross: number, orderLineTotal: number, amount: number): number {
  if (!(orderLineTotal > 0)) return lineGross
  return lineGross * Math.max(0, 1 - amount / orderLineTotal)
}
