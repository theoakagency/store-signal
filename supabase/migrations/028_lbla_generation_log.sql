-- ============================================================
-- Store Signal — Migration 028: LBLA Content Generation Log
-- ============================================================
-- Separate from content_generations (migration 026) which requires
-- auth.users. LBLA is a public team tool with no user sessions.
-- Service client inserts; RLS policy blocks direct browser access.

CREATE TABLE IF NOT EXISTS public.lbla_generation_log (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel         text        NOT NULL CHECK (channel IN ('email', 'sms', 'push')),
  content_type    text,
  topic           text,
  product_focus   text,
  audience        text,
  custom_audience text,
  tones           text[],
  talking_points  text,
  output          jsonb       NOT NULL,
  generated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lbla_generation_log_tenant_id_idx    ON public.lbla_generation_log(tenant_id);
CREATE INDEX IF NOT EXISTS lbla_generation_log_generated_at_idx ON public.lbla_generation_log(generated_at DESC);

ALTER TABLE public.lbla_generation_log ENABLE ROW LEVEL SECURITY;

-- Service client bypasses RLS and can always insert.
-- Authenticated dashboard users can read their tenant's log.
CREATE POLICY "lbla_generation_log: members can select"
  ON public.lbla_generation_log FOR SELECT
  USING (
    tenant_id IS NULL
    OR tenant_id IN (
      SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()
    )
  );

-- Allow inserts from service role (bypasses RLS) — no INSERT policy needed.
-- Allow anon/service to insert for public LBLA tool:
CREATE POLICY "lbla_generation_log: service can insert"
  ON public.lbla_generation_log FOR INSERT
  WITH CHECK (true);
