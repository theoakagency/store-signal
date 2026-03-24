-- ============================================================
-- Store Signal — Migration 012: Google Analytics 4 Integration
-- ============================================================

-- ── Stores columns ─────────────────────────────────────────────────────────────

ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS ga4_refresh_token text;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS ga4_property_id   text;

-- ── Track data source for Google campaigns (google_ads vs ga4 fallback) ────────

ALTER TABLE public.google_campaigns ADD COLUMN IF NOT EXISTS data_source text DEFAULT 'google_ads';

-- ── Analytics: sessions by channel ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.analytics_sessions (
  tenant_id    uuid    NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  date_range   text    NOT NULL,
  channel      text    NOT NULL,
  sessions     integer NOT NULL DEFAULT 0,
  conversions  integer NOT NULL DEFAULT 0,
  revenue      numeric NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, date_range, channel)
);

ALTER TABLE public.analytics_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "analytics_sessions: members can select"
  ON public.analytics_sessions FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()));

-- ── Analytics: top landing pages ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.analytics_pages (
  tenant_id        uuid    NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  page_path        text    NOT NULL,
  sessions         integer NOT NULL DEFAULT 0,
  conversions      integer NOT NULL DEFAULT 0,
  avg_time_seconds numeric,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, page_path)
);

ALTER TABLE public.analytics_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "analytics_pages: members can select"
  ON public.analytics_pages FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()));

-- ── Analytics: monthly sessions trend ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.analytics_monthly (
  tenant_id  uuid    NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  month      text    NOT NULL,
  sessions   integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, month)
);

ALTER TABLE public.analytics_monthly ENABLE ROW LEVEL SECURITY;
CREATE POLICY "analytics_monthly: members can select"
  ON public.analytics_monthly FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()));

-- ── Analytics: campaign-level performance ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.analytics_campaigns (
  tenant_id      uuid    NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  campaign_name  text    NOT NULL,
  source         text,
  medium         text,
  sessions       integer NOT NULL DEFAULT 0,
  conversions    integer NOT NULL DEFAULT 0,
  revenue        numeric NOT NULL DEFAULT 0,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, campaign_name)
);

ALTER TABLE public.analytics_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "analytics_campaigns: members can select"
  ON public.analytics_campaigns FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()));

-- ── Analytics: summary metrics cache ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.analytics_metrics_cache (
  tenant_id     uuid    NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  metric_name   text    NOT NULL,
  metric_value  numeric NOT NULL DEFAULT 0,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, metric_name)
);

ALTER TABLE public.analytics_metrics_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "analytics_metrics_cache: members can select"
  ON public.analytics_metrics_cache FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()));
