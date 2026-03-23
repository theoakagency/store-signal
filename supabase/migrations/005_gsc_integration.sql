-- ============================================================
-- Store Signal — Migration 005: Google Search Console Integration
-- ============================================================

-- ── Add GSC credentials to stores ────────────────────────────────────────────
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS gsc_refresh_token text,
  ADD COLUMN IF NOT EXISTS gsc_property_url  text;

-- ── gsc_keywords ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gsc_keywords (
  tenant_id    uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  query        text NOT NULL,
  clicks       integer NOT NULL DEFAULT 0,
  impressions  integer NOT NULL DEFAULT 0,
  ctr          numeric(8,6),
  position     numeric(8,2),
  synced_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, query)
);

CREATE INDEX IF NOT EXISTS gsc_keywords_tenant_clicks_idx ON public.gsc_keywords(tenant_id, clicks DESC);

ALTER TABLE public.gsc_keywords ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gsc_keywords: members can select"
  ON public.gsc_keywords FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()));

-- ── gsc_pages ─────────────────────────────────────────────────────────────────
-- Stores current 90d + prior 90d clicks for traffic loss detection
CREATE TABLE IF NOT EXISTS public.gsc_pages (
  tenant_id         uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  page              text NOT NULL,
  clicks            integer NOT NULL DEFAULT 0,   -- last 90 days
  impressions       integer NOT NULL DEFAULT 0,
  ctr               numeric(8,6),
  position          numeric(8,2),
  clicks_prior      integer NOT NULL DEFAULT 0,   -- 91–180 days ago
  synced_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, page)
);

CREATE INDEX IF NOT EXISTS gsc_pages_tenant_clicks_idx ON public.gsc_pages(tenant_id, clicks DESC);

ALTER TABLE public.gsc_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gsc_pages: members can select"
  ON public.gsc_pages FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()));

-- ── gsc_monthly_clicks ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gsc_monthly_clicks (
  tenant_id    uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  month        date NOT NULL,                    -- first day of month
  clicks       integer NOT NULL DEFAULT 0,
  impressions  integer NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, month)
);

ALTER TABLE public.gsc_monthly_clicks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gsc_monthly_clicks: members can select"
  ON public.gsc_monthly_clicks FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()));
