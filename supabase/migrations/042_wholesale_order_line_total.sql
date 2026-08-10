-- ============================================================
-- Store Signal — Migration 042: Wholesale order full line value
-- ============================================================
-- ⚑ RUN MANUALLY IN THE SUPABASE SQL EDITOR — do not auto-apply.
--
-- Captures each order's FULL line value (all SKUs, not just the 16 KLL ones) so
-- the discount-decision tool on /lbla/reports/kll-wholesale can distribute a
-- discount proportionally across the whole order and count only the KLL lines'
-- share — instead of taking the entire discount off the KLL lines, which
-- over-attributed it (the KLL lines are often a minority of a bulk order).
--
--   order_line_total — sum of quantity x price for EVERY line item in the order,
--                      all SKUs, at recorded pre-discount prices. This is the
--                      distribution denominator. Derived by summing all lines
--                      before the KLL filter — NOT the Shopify "Subtotal" column,
--                      which is post-discount and would be inconsistent with the
--                      per-line (pre-discount) gross values.
--   order_line_count — number of line items in the order (all SKUs), for display.
--
-- Order-level: repeated on every KLL row of the order. NULL on rows uploaded
-- before this migration — distribution falls back to the KLL line total (the old
-- behaviour) until June and July are RE-UPLOADED to populate these.

ALTER TABLE public.wholesale_kll_orders
  ADD COLUMN IF NOT EXISTS order_line_total numeric(12, 2);
ALTER TABLE public.wholesale_kll_orders
  ADD COLUMN IF NOT EXISTS order_line_count integer;
