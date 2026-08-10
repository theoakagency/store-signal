-- ============================================================
-- Store Signal — Migration 040: Wholesale KLL order-level discount fields
-- ============================================================
-- ⚑ RUN MANUALLY IN THE SUPABASE SQL EDITOR — do not auto-apply.
--
-- Adds the Shopify order-level Discount Code / Discount Amount to
-- wholesale_kll_orders so /lbla/reports/kll-wholesale can separate "clean"
-- orders (no order-level discount) from "flagged" ones whose value is pending a
-- decision. The original migration (039) assumed these columns were always blank
-- on wholesale orders; the July 2026 upload proved otherwise (bulk orders like
-- "Premier Show Discount" and "50% Discount + Credit" carry large order-level
-- discounts that make their line prices unreliable).
--
-- Order-level in Shopify's export: only the FIRST line of an order carries these,
-- so the upload route forward-fills them per order (same pattern as Financial
-- Status and Created at) and repeats the value on every KLL line of the order.
-- Both are NULL for a clean order.
--
-- No backfill: rows uploaded before this migration have NULL here. Re-upload
-- June's and July's original CSVs after this deploys to populate them (the upload
-- replaces each month wholesale, so re-uploading is safe and idempotent).

ALTER TABLE public.wholesale_kll_orders
  ADD COLUMN IF NOT EXISTS discount_code   text;          -- raw "Discount Code" text, NULL when none
ALTER TABLE public.wholesale_kll_orders
  ADD COLUMN IF NOT EXISTS discount_amount numeric(12, 2); -- raw "Discount Amount", NULL/0 when none

-- An order counts as flagged when discount_code is non-empty OR discount_amount > 0.
