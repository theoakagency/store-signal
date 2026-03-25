-- ============================================================
-- Store Signal — Migration 019: Shopify Insights Cache + Analytics Overview
-- ============================================================

-- ── Shopify Insights Cache ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.shopify_insights_cache (
  tenant_id      uuid        PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  insights       jsonb       NOT NULL DEFAULT '[]',
  calculated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shopify_insights_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shopify_insights_cache: members can select"
  ON public.shopify_insights_cache FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()));

CREATE POLICY "shopify_insights_cache: service role can write"
  ON public.shopify_insights_cache FOR ALL
  USING (true)
  WITH CHECK (true);

-- ── Analytics Overview Cache ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.analytics_overview_cache (
  tenant_id                    uuid        PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  traffic_health_score         integer,
  organic_visibility_score     integer,
  traffic_to_revenue_efficiency numeric,
  paid_vs_organic_balance      numeric,
  search_capture_rate          numeric,
  blended_monthly_data         jsonb,
  top_opportunities            jsonb,
  calculated_at                timestamptz DEFAULT now()
);

ALTER TABLE public.analytics_overview_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "analytics_overview_cache: members can select"
  ON public.analytics_overview_cache FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()));

CREATE POLICY "analytics_overview_cache: service role can write"
  ON public.analytics_overview_cache FOR ALL
  USING (true)
  WITH CHECK (true);

-- ── Analytics Insights Cache (AI results for overview page) ──────────────────

CREATE TABLE IF NOT EXISTS public.analytics_insights_cache (
  tenant_id      uuid        PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  insights       jsonb       NOT NULL DEFAULT '[]',
  calculated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.analytics_insights_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "analytics_insights_cache: members can select"
  ON public.analytics_insights_cache FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()));

CREATE POLICY "analytics_insights_cache: service role can write"
  ON public.analytics_insights_cache FOR ALL
  USING (true)
  WITH CHECK (true);
