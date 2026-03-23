-- ============================================================
-- Store Signal — Migration 004: Klaviyo Integration
-- ============================================================

-- ── Add Klaviyo credentials to stores ────────────────────────────────────────
-- Note: Supabase encrypts data at rest (AES-256). For additional
-- security, consider using pgcrypto or Vault for key-level encryption.
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS klaviyo_api_key     text,
  ADD COLUMN IF NOT EXISTS klaviyo_account_id  text;

-- ── klaviyo_campaigns ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.klaviyo_campaigns (
  id                   text PRIMARY KEY,  -- Klaviyo campaign ID
  tenant_id            uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name                 text,
  subject              text,
  status               text,
  send_time            timestamptz,
  recipient_count      integer NOT NULL DEFAULT 0,
  open_rate            numeric(6,4),      -- 0.0–1.0
  click_rate           numeric(6,4),
  revenue_attributed   numeric(14,2) NOT NULL DEFAULT 0,
  unsubscribe_count    integer NOT NULL DEFAULT 0,
  created_at           timestamptz,
  updated_at           timestamptz,
  synced_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS klaviyo_campaigns_tenant_id_idx ON public.klaviyo_campaigns(tenant_id);
CREATE INDEX IF NOT EXISTS klaviyo_campaigns_send_time_idx ON public.klaviyo_campaigns(send_time DESC);

ALTER TABLE public.klaviyo_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "klaviyo_campaigns: members can select"
  ON public.klaviyo_campaigns FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()
    )
  );

-- ── klaviyo_flows ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.klaviyo_flows (
  id                   text PRIMARY KEY,  -- Klaviyo flow ID
  tenant_id            uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name                 text,
  status               text,
  trigger_type         text,
  revenue_attributed   numeric(14,2) NOT NULL DEFAULT 0,
  recipient_count      integer NOT NULL DEFAULT 0,
  open_rate            numeric(6,4),
  click_rate           numeric(6,4),
  conversion_rate      numeric(6,4),
  created_at           timestamptz,
  updated_at           timestamptz,
  synced_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS klaviyo_flows_tenant_id_idx ON public.klaviyo_flows(tenant_id);

ALTER TABLE public.klaviyo_flows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "klaviyo_flows: members can select"
  ON public.klaviyo_flows FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()
    )
  );

-- ── klaviyo_metrics_cache ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.klaviyo_metrics_cache (
  tenant_id        uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  metric_name      text NOT NULL,
  metric_value     numeric(18,4),
  metric_metadata  jsonb DEFAULT '{}'::jsonb,
  calculated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, metric_name)
);

CREATE INDEX IF NOT EXISTS klaviyo_metrics_cache_tenant_id_idx ON public.klaviyo_metrics_cache(tenant_id);

ALTER TABLE public.klaviyo_metrics_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "klaviyo_metrics_cache: members can select"
  ON public.klaviyo_metrics_cache FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()
    )
  );
