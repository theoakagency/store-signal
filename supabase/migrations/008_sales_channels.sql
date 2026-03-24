-- ============================================================
-- Store Signal — Migration 008: Sales Channel Tracking
-- ============================================================

-- Add sales channel columns to orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS source_name    text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS referring_site text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS landing_site   text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS utm_source     text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS utm_medium     text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS utm_campaign   text;

-- Sales channel revenue cache (30d + 12m periods)
CREATE TABLE IF NOT EXISTS public.sales_channel_cache (
  tenant_id       uuid    NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_name    text    NOT NULL,
  order_count     integer NOT NULL DEFAULT 0,
  revenue         numeric NOT NULL DEFAULT 0,
  avg_order_value numeric NOT NULL DEFAULT 0,
  period          text    NOT NULL,  -- 'last_30d' | 'last_12m'
  calculated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, channel_name, period)
);

ALTER TABLE public.sales_channel_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sales_channel_cache: members can select"
  ON public.sales_channel_cache FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()
    )
  );
