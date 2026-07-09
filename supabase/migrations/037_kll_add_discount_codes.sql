-- ============================================================
-- Store Signal — Migration 037: KLL allowed discount codes (COMEBACK20, KLLEVENT)
-- ============================================================
-- Pure data seed — adds two codes to the allowed_discount_codes allowlist
-- (same table + pattern as migration 031). These make the codes deductible
-- in the KLL royalty report. Idempotent: ON CONFLICT DO NOTHING, so it is a
-- no-op if the rows already exist (they were also inserted live via the
-- service client when this change shipped).
--
--   COMEBACK20 — exact, NON-kit-eligible (win-back code; same kit treatment
--                as WELCOME15/WELCOME20 — confirmed allowed on non-kit target
--                SKUs only).
--   KLLEVENT   — exact, KIT-ELIGIBLE (confirmed). 100%-off event/giveaway code.
--                ⚠ KNOWN GAP: in the data KLLEVENT is applied as a Shopify
--                *manual* discount, so the code lives in
--                discount_applications.title (not .code). mapOrder resolves the
--                per-line allocation code from .code only, so it stores
--                code=null and the KLL report cannot credit it — the 52 May
--                giveaway kit orders still show full royalty despite this flag.
--                Fully crediting them requires a separate mapOrder title-
--                fallback fix + re-backfill; tracked separately.
--
-- Unchanged: DT (prefix, kit-eligible), WELCOME15/WELCOME20, LASHBOXJENNA.

INSERT INTO public.allowed_discount_codes (code_pattern, match_type, kit_eligible, category, notes)
VALUES
  ('COMEBACK20', 'exact', false, 'comeback', 'Win-back code — not applicable to kit SKUs'),
  ('KLLEVENT',   'exact', true,  'promo',    'Event/giveaway code (100% off, applied as a manual discount) — kit-eligible (confirmed)')
ON CONFLICT (tenant_id, code_pattern) DO NOTHING;
