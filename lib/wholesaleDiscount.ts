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
 * The order's contribution to the report's Gross Sales once a decision is applied.
 *
 *   ignore            → 0 (order dropped from totals; still counts as decided)
 *   full_price        → the recorded KLL line gross, unchanged
 *   distribute_full   → gross minus the order's full Discount Amount
 *   distribute_custom → gross minus the entered amount
 *
 * The distribute methods spread the amount across lines in proportion to each
 * line's share of the KLL line value, then floor each line at 0. With a uniform
 * ratio that collapses to max(0, gross − amount): when the amount exceeds the KLL
 * line total — which happens when the order-level discount also covered non-KLL
 * items not in this report — the KLL lines floor to 0 rather than going negative.
 *
 * `counts_as_order` is false only for ignore: every other resolved order is a
 * real sale and counts toward Total Orders.
 */
export function orderContribution(
  klllineGross: number,
  discountAmount: number | null,
  decision: OrderDecision | null
): { contribution: number; resolved: boolean; counts_as_order: boolean } {
  if (!decision) return { contribution: 0, resolved: false, counts_as_order: false }
  switch (decision.action) {
    case 'ignore':
      return { contribution: 0, resolved: true, counts_as_order: false }
    case 'full_price':
      return { contribution: klllineGross, resolved: true, counts_as_order: true }
    case 'distribute_full':
      return { contribution: Math.max(0, klllineGross - (discountAmount ?? 0)), resolved: true, counts_as_order: true }
    case 'distribute_custom':
      return { contribution: Math.max(0, klllineGross - (decision.custom_amount ?? 0)), resolved: true, counts_as_order: true }
  }
}

/**
 * Per-line adjusted gross for the distribute methods, for display/audit. Same
 * proportional-then-floor rule as orderContribution; returns each line's kept
 * value. For non-distribute actions the lines are unchanged.
 */
export function distributedLineGross(lineGross: number, klllineGross: number, amount: number): number {
  if (!(klllineGross > 0)) return lineGross
  const lineDiscount = amount * (lineGross / klllineGross)
  return Math.max(0, lineGross - lineDiscount)
}
