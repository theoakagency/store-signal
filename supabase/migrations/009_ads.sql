-- ============================================================
-- Store Signal — Migration 009: Advertising Integrations
-- Meta Ads + Google Ads
-- ============================================================

-- ── Stores columns ────────────────────────────────────────────────────────────

ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS meta_access_token   text;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS meta_ad_account_id  text;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS google_ads_customer_id     text;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS google_ads_refresh_token   text;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS google_ads_developer_token text;

-- ── Meta Campaigns ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.meta_campaigns (
  id                text        PRIMARY KEY,
  tenant_id         uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name              text,
  status            text,
  objective         text,
  spend             numeric     NOT NULL DEFAULT 0,
  impressions       integer     NOT NULL DEFAULT 0,
  clicks            integer     NOT NULL DEFAULT 0,
  ctr               numeric,
  cpc               numeric,
  cpm               numeric,
  purchases         integer     NOT NULL DEFAULT 0,
  purchase_value    numeric     NOT NULL DEFAULT 0,
  roas              numeric,
  reach             integer,
  frequency         numeric,
  date_start        date,
  date_stop         date,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.meta_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meta_campaigns: members can select"
  ON public.meta_campaigns FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()
    )
  );

-- ── Meta Ad Sets ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.meta_adsets (
  id                  text        PRIMARY KEY,
  tenant_id           uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  campaign_id         text        REFERENCES public.meta_campaigns(id) ON DELETE CASCADE,
  name                text,
  status              text,
  spend               numeric     NOT NULL DEFAULT 0,
  impressions         integer     NOT NULL DEFAULT 0,
  clicks              integer     NOT NULL DEFAULT 0,
  purchases           integer     NOT NULL DEFAULT 0,
  purchase_value      numeric     NOT NULL DEFAULT 0,
  roas                numeric,
  targeting_summary   text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.meta_adsets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meta_adsets: members can select"
  ON public.meta_adsets FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()
    )
  );

-- ── Meta Metrics Cache ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.meta_metrics_cache (
  tenant_id    uuid    NOT NULL PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  metric_name  text    NOT NULL,
  metric_value numeric NOT NULL DEFAULT 0,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, metric_name)
);

ALTER TABLE public.meta_metrics_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meta_metrics_cache: members can select"
  ON public.meta_metrics_cache FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()
    )
  );

-- ── Google Campaigns ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.google_campaigns (
  id                 text        PRIMARY KEY,
  tenant_id          uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name               text,
  status             text,
  campaign_type      text,
  spend              numeric     NOT NULL DEFAULT 0,
  impressions        integer     NOT NULL DEFAULT 0,
  clicks             integer     NOT NULL DEFAULT 0,
  ctr                numeric,
  avg_cpc            numeric,
  conversions        numeric     NOT NULL DEFAULT 0,
  conversion_value   numeric     NOT NULL DEFAULT 0,
  roas               numeric,
  impression_share   numeric,
  date_start         date,
  date_stop          date,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.google_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "google_campaigns: members can select"
  ON public.google_campaigns FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()
    )
  );

-- ── Google Metrics Cache ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.google_metrics_cache (
  tenant_id     uuid    NOT NULL PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  metric_name   text    NOT NULL,
  metric_value  numeric NOT NULL DEFAULT 0,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, metric_name)
);

ALTER TABLE public.google_metrics_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "google_metrics_cache: members can select"
  ON public.google_metrics_cache FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()
    )
  );
