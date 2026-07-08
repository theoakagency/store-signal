-- ============================================================
-- Store Signal — Migration 032: Order shipping data
-- ============================================================
-- Captures two fields Shopify already returns in every order
-- payload (no new API scope/cost) but the sync has never stored:
-- ship-to state and the actual shipping amount charged to the
-- customer. Needed to compare customer-collected shipping against
-- ShipStation's actual carrier cost (shipstation_shipments.shipment_cost).
--
-- Source fields (Shopify REST Admin API, order object):
--   shipping_state    <- shipping_address.province_code (e.g. "HI")
--   shipping_charged  <- total_shipping_price_set.shop_money.amount
--                        (excludes refunded/removed shipping lines)
--
-- NOTE: existing rows will have both columns NULL until a historical
-- backfill re-syncs them (upsert on shopify_order_id updates in place).

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_state text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_charged numeric(12, 2);

CREATE INDEX IF NOT EXISTS orders_shipping_state_idx ON public.orders(shipping_state);
