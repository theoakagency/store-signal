-- ============================================================
-- Store Signal — Migration 021: LoyaltyLion Integration Complete
-- ============================================================
-- Cleans up temporary audit tables and adds rewards catalog column.

-- ── Drop temporary audit tables (data isolation resolved) ────────────────────
DROP TABLE IF EXISTS public.ll_audit_customers;
DROP TABLE IF EXISTS public.ll_audit_activities;

-- ── Add rewards catalog cache to loyalty_metrics_cache ────────────────────────
ALTER TABLE public.loyalty_metrics_cache
  ADD COLUMN IF NOT EXISTS rewards_catalog      jsonb,
  ADD COLUMN IF NOT EXISTS points_dollar_value  numeric(8, 4) DEFAULT 0.01;
