-- Migration 026: Content Studio — AI-generated email/SMS/push content history

CREATE TABLE IF NOT EXISTS public.content_generations (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id       UUID        REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id        UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  channel        TEXT        NOT NULL CHECK (channel IN ('email', 'sms', 'push')),
  topic          TEXT        NOT NULL,
  product_focus  TEXT,
  audience       TEXT,
  tones          TEXT[],
  talking_points TEXT,
  versions       JSONB       NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_generations_store_id   ON public.content_generations(store_id);
CREATE INDEX IF NOT EXISTS idx_content_generations_created_at ON public.content_generations(created_at DESC);

ALTER TABLE public.content_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "content_generations: members can manage their store content"
  ON public.content_generations
  FOR ALL
  USING (
    store_id IN (
      SELECT s.id FROM public.stores s
      JOIN public.user_tenants ut ON ut.tenant_id = s.tenant_id
      WHERE ut.user_id = auth.uid()
    )
  );
