-- ============================================================
-- Store Signal — Migration 007: GSC Insights Cache
-- ============================================================

CREATE TABLE IF NOT EXISTS public.gsc_insights_cache (
  tenant_id     uuid NOT NULL PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  insights      jsonb NOT NULL DEFAULT '[]'::jsonb,
  calculated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.gsc_insights_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gsc_insights_cache: members can select"
  ON public.gsc_insights_cache FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()
    )
  );
