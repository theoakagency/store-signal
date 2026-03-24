-- ============================================================
-- Store Signal — Migration 015: SQL functions for metric aggregation
-- Avoids the 1000-row PostgREST limit on large tables
-- ============================================================

-- Monthly revenue aggregation grouped by calendar month
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
    AND processed_at IS NOT NULL
    AND processed_at >= date_trunc('month', NOW() AT TIME ZONE 'UTC')
                        - (p_months || ' months')::interval
  GROUP BY date_trunc('month', processed_at)
  ORDER BY 1 ASC;
$$;

-- Count distinct customer emails from orders (includes guests)
CREATE OR REPLACE FUNCTION public.count_distinct_customer_emails(
  p_store_id uuid
)
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COUNT(DISTINCT email)::bigint
  FROM public.orders
  WHERE store_id = p_store_id
    AND email IS NOT NULL
    AND email <> '';
$$;
