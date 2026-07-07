-- ============================================================
-- Store Signal — Migration 031: Allowed discount codes
-- ============================================================
-- Maintains which discount codes count toward royalty/cost reports
-- (e.g. the KLL royalty report). Not every code applied to an order
-- should reduce reported net sales — only codes on this list, checked
-- by exact match or prefix, do. kit_eligible controls whether a code
-- can apply to kit SKUs (MKLBKLLKT, MKLBKLLKTGWP) at all.
-- Managed via /lbla/settings/discount-codes (no auth, matches the
-- rest of the /lbla team-tools convention).

CREATE TABLE IF NOT EXISTS public.allowed_discount_codes (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000001',
  code_pattern  text        NOT NULL,   -- exact code or prefix, e.g. "DT" or "WELCOME15"
  match_type    text        NOT NULL CHECK (match_type IN ('exact', 'prefix')),
  kit_eligible  boolean     NOT NULL,   -- can this code apply to kit SKUs (MKLBKLLKT, MKLBKLLKTGWP)?
  category      text,                   -- 'ambassador' | 'welcome' | 'comeback' | 'affiliate' | 'marketing' | 'promo'
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code_pattern)
);

CREATE INDEX IF NOT EXISTS allowed_discount_codes_tenant_id_idx ON public.allowed_discount_codes(tenant_id);

ALTER TABLE public.allowed_discount_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allowed_discount_codes: members can select" ON public.allowed_discount_codes;
CREATE POLICY "allowed_discount_codes: members can select"
  ON public.allowed_discount_codes FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()));

-- ── Seed known codes ──────────────────────────────────────────────────────────

INSERT INTO public.allowed_discount_codes (code_pattern, match_type, kit_eligible, category, notes)
VALUES
  ('DT',           'prefix', true,  'ambassador', 'Ambassador/partner lash cash — applies to all products including kits'),
  ('WELCOME15',    'exact',  false, 'welcome',    'Not applicable to kit SKUs'),
  ('WELCOME20',    'exact',  false, 'welcome',    'Not applicable to kit SKUs'),
  ('LASHBOXJENNA', 'exact',  false, 'affiliate',  'Affiliate code — not applicable to kit SKUs')
ON CONFLICT (tenant_id, code_pattern) DO NOTHING;
