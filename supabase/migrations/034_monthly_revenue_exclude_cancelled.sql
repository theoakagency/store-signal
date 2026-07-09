-- ============================================================
-- Store Signal — Migration 034: exclude cancelled orders from monthly revenue
-- ============================================================
-- ⚑ RUN MANUALLY IN THE SUPABASE SQL EDITOR — do not auto-apply.
--
-- Follow-up to migration 033. The get_monthly_revenue RPC already
-- excludes test orders (033); this extends it to also exclude
-- cancelled orders (cancelled_at IS NOT NULL), matching the
-- `.is('cancelled_at', null)` filter added at every other paid-revenue
-- sum site in the app.
--
-- A cancelled order can retain financial_status = 'paid' when it was
-- cancelled without a refund, so the financial_status filter alone does
-- not remove it — cancelled_at IS NULL does.
--
-- NOTE: cancelled_at is NULL on every existing row until the historical
-- backfill re-syncs it, so this is a no-op on current data and only
-- takes effect as rows get their true cancelled_at populated.

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
    AND cancelled_at IS NULL
    AND processed_at IS NOT NULL
    AND processed_at >= date_trunc('month', NOW() AT TIME ZONE 'UTC')
                        - (p_months || ' months')::interval
  GROUP BY date_trunc('month', processed_at)
  ORDER BY 1 ASC;
$$;
