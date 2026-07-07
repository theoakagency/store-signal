-- ============================================================
-- Store Signal — Migration 030: Order discount codes
-- ============================================================
-- Captures Shopify's order.discount_codes array (code, amount, type),
-- which the sync previously discarded — only the aggregate
-- total_discounts dollar figure was stored. Needed to check the
-- actual discount code used on an order against an allowlist
-- (see migration 031) for royalty/cost reporting.

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount_codes jsonb DEFAULT '[]'::jsonb;
