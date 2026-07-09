-- ============================================================
-- Store Signal — Migration 038: LoyaltyLion-covered shipping flag
-- ============================================================
-- ⚑ RUN MANUALLY IN THE SUPABASE SQL EDITOR — do not auto-apply.
--
-- Closes the "KNOWN LIMITATION" gap called out in
-- app/api/lbla/reports/kll-royalty/route.ts: when a customer redeems
-- LoyaltyLion points for free shipping, Shopify records it as a
-- discount_applications entry with a code starting "LL-",
-- target_type = 'shipping_line', that fully zeroes the shipping line.
-- shipping_charged - shipping_discounted (migration 032/035) reads that
-- as $0 customer-paid, same as any other free-shipping cause (automatic
-- ProClub perk, order-value threshold, generic promo code) — so the
-- royalty report under-deducts shipping for these orders. Verified against
-- real orders (#875045, #879740, and others): an LL- code's `type` in
-- `discount_codes` and its `target_type` in `discount_applications` is
-- 'shipping_line' ONLY for the loyalty-shipping reward itself — a
-- product-discount LL- code stacked on the same order (target_type
-- 'line_item') or an unrelated automatic "FREE ProClub Shipping" discount
-- (type 'automatic', no code) do not set it, so keying off
-- discount_applications (not just "any LL- code present on the order")
-- avoids both false-positive cases.
--
-- Already arrives in every Shopify order payload (no new API scope or
-- cost — same orders fetch as migration 035):
--
--   shipping_loyalty_covered <- true when EVERY shipping_line's charge
--                                is fully accounted for by discount_allocations
--                                belonging to a discount_applications entry
--                                where type = 'discount_code',
--                                target_type = 'shipping_line', and
--                                code starts with 'LL-'. False otherwise
--                                (including when shipping is $0 for any
--                                other reason). See computeShippingLoyaltyCovered
--                                in lib/syncShopify.ts.
--
-- NOTE: existing rows will have this column NULL (not false) until a
-- historical backfill re-syncs them (upsert on (store_id, shopify_order_id)
-- updates in place) — same backfill migrations 032/033/035 already require.
-- Report code must treat NULL the same as false, never as "unknown".

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_loyalty_covered boolean;

CREATE INDEX IF NOT EXISTS orders_shipping_loyalty_covered_idx
  ON public.orders(shipping_loyalty_covered)
  WHERE shipping_loyalty_covered IS TRUE;
