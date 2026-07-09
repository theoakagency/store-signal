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
--   KLLEVENT   — exact, NON-kit-eligible (DEFAULT — kit-eligibility not yet
--                confirmed; defaulted to non-kit like most codes. ⚑ FLAG:
--                flip kit_eligible to true if this event code should apply to
--                kit SKUs). Not currently used on any order in the data.
--
-- Unchanged: DT (prefix, kit-eligible), WELCOME15/WELCOME20, LASHBOXJENNA.

INSERT INTO public.allowed_discount_codes (code_pattern, match_type, kit_eligible, category, notes)
VALUES
  ('COMEBACK20', 'exact', false, 'comeback', 'Win-back code — not applicable to kit SKUs'),
  ('KLLEVENT',   'exact', false, 'promo',    'Event code — kit-eligibility unconfirmed, defaulted to non-kit-eligible pending confirmation')
ON CONFLICT (tenant_id, code_pattern) DO NOTHING;
