-- ============================================================
-- Store Signal — Migration 043: Wholesale upload rule set + order total
-- ============================================================
-- ⚑ RUN MANUALLY IN THE SUPABASE SQL EDITOR — do not auto-apply.
--
-- Splits /lbla/reports/kll-wholesale into two upload rule sets so already-stored
-- months keep their behaviour forever while new months use simpler rules.
--
--   rule_set = 'legacy'     — the flag / decide / resolve workflow: order-level
--                             Discount Code/Amount flags an order for a per-order
--                             decision (ignore / distribute / full price). June and
--                             July were uploaded this way. NULL is treated as
--                             'legacy' too, so the pre-043 June/July rows qualify.
--   rule_set = 'simplified' — real discounts are now baked into the line price, so
--                             order-level Discount Code/Amount is CREDIT only and
--                             needs no decision. Every order counts at its line
--                             price; a $0/blank order Total drops the whole order;
--                             a $0 line gross drops just that line; credit and
--                             excluded orders are listed for visibility only.
--
-- The rule set is PINNED per month at first upload and preserved on re-upload
-- (the upload route reads a month's existing rule_set before replacing it), so
-- re-uploading June/July can never reinterpret them under the new rules.
--
--   order_total — the Shopify export "Total" column (order grand total),
--                 forward-filled per order. Drives the simplified $0-order rule.

ALTER TABLE public.wholesale_kll_orders
  ADD COLUMN IF NOT EXISTS rule_set   text;            -- 'legacy' | 'simplified'; NULL = legacy
ALTER TABLE public.wholesale_kll_orders
  ADD COLUMN IF NOT EXISTS order_total numeric(12, 2); -- CSV "Total" column, per order
