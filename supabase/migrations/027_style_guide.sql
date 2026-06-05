-- Migration 027: Style Guide rules for Content Studio

CREATE TABLE IF NOT EXISTS public.style_guide_rules (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    UUID        REFERENCES public.stores(id) ON DELETE CASCADE,
  category    TEXT        NOT NULL CHECK (category IN ('avoid', 'enforce', 'vocabulary', 'examples')),
  rule        TEXT        NOT NULL,
  active      BOOLEAN     NOT NULL DEFAULT true,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_style_guide_rules_store_id ON public.style_guide_rules(store_id);
CREATE INDEX IF NOT EXISTS idx_style_guide_rules_store_category ON public.style_guide_rules(store_id, category, sort_order);

ALTER TABLE public.style_guide_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "style_guide_rules: members can manage their store style guide"
  ON public.style_guide_rules
  FOR ALL
  USING (
    store_id IN (
      SELECT s.id FROM public.stores s
      JOIN public.user_tenants ut ON ut.tenant_id = s.tenant_id
      WHERE ut.user_id = auth.uid()
    )
  );
