-- ============================================================
-- Store Signal — Migration 033: Order refund / cancellation state
-- ============================================================
-- ⚑ RUN MANUALLY IN THE SUPABASE SQL EDITOR — do not auto-apply.
--
-- Captures three order fields the sync has never stored, which are
-- required to stop counting refunded/cancelled/test orders as full
-- "paid" revenue (audit finding #1). All three already arrive in the
-- Shopify order payload (no new API scope or cost):
--
--   cancelled_at    <- order.cancelled_at            (null unless cancelled)
--   total_refunded  <- total_price - current_total_price
--                      (>= 0; the amount refunded/removed since sale)
--   test            <- order.test                    (Shopify test-gateway orders)
--
-- Companion code change: the incremental sync now queries Shopify's
-- `updated_at_min` (not `created_at_min`), so an order refunded or
-- cancelled AFTER its first sync gets re-fetched and its
-- financial_status corrected in place via the (store_id,
-- shopify_order_id) upsert.
--
-- NOTE: existing rows keep total_refunded = 0 / test = false /
-- cancelled_at = NULL until a historical backfill re-syncs them
-- (upsert on shopify_order_id updates in place). The same backfill
-- also repairs orders.created_at, which the mapper now populates with
-- Shopify's real order-creation time instead of the DB insert default.

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancelled_at   timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS total_refunded numeric(12, 2) DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS test           boolean        DEFAULT false;

-- Monthly revenue RPC: exclude Shopify test orders. Refunded/cancelled
-- orders already drop out here because they are no longer
-- financial_status = 'paid' once the updated_at_min sync repairs them.
CREATE OR REPLACE FUNCTION public.get_monthly_revenue(
  p_store_id uuid,
  p_months   integer DEFAULT 13
)
RETURNS TABLE (
  month       text,
  revenue     numeric,
  order_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    to_char(date_trunc('month', processed_at), 'YYYY-MM') AS month,
    SUM(total_price::numeric)::numeric                    AS revenue,
    COUNT(*)::bigint                                      AS order_count
  FROM public.orders
  WHERE store_id = p_store_id
    AND financial_status = 'paid'
    AND test IS NOT TRUE
    AND processed_at IS NOT NULL
    AND processed_at >= date_trunc('month', NOW() AT TIME ZONE 'UTC')
                        - (p_months || ' months')::interval
  GROUP BY date_trunc('month', processed_at)
  ORDER BY 1 ASC;
$$;
