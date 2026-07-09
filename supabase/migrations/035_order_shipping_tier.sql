-- ============================================================
-- Store Signal — Migration 035: Order shipping tier data
-- ============================================================
-- ⚑ RUN MANUALLY IN THE SUPABASE SQL EDITOR — do not auto-apply.
--
-- Second half of the shipping-margin data foundation. Migration 032
-- already added `shipping_charged` (the amount collected from the
-- customer) and `shipping_state`; this adds the two remaining fields
-- needed to break shipping margin down by tier and to distinguish
-- code-driven free shipping from threshold-driven free shipping.
--
-- Both already arrive in every Shopify order payload (no new API scope
-- or cost — the orders fetch sends no `fields` param, so `shipping_lines`
-- and `total_shipping_price_set` are always present):
--
--   shipping_method     <- shipping_lines[0].title
--                          (the tier the customer picked: "Free Shipping",
--                           "Standard", "Priority", etc.)
--   shipping_discounted <- SUM over shipping_lines of
--                          (price - discounted_price), clamped >= 0
--                          (the total discount applied to shipping; > 0
--                           means a code/promo reduced the shipping charge,
--                           which is how code-driven free shipping is told
--                           apart from a threshold-driven "Free Shipping"
--                           tier that was simply priced at 0)
--
-- NOTE: existing rows will have both columns NULL until a historical
-- backfill re-syncs them (upsert on (store_id, shopify_order_id) updates
-- in place). Same backfill that migrations 032/033 already require.

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_discounted numeric(12, 2);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_method     text;

CREATE INDEX IF NOT EXISTS orders_shipping_method_idx ON public.orders(shipping_method);
