-- ============================================================
-- Store Signal — Migration 022: Customer stats cache columns
-- ============================================================
-- Adds precomputed segment counts and LTV stats to customer_overlap_cache
-- so the customers page can skip scanning all profiles on every load.

ALTER TABLE public.customer_overlap_cache
  ADD COLUMN IF NOT EXISTS segment_counts  jsonb,
  ADD COLUMN IF NOT EXISTS ltv_stats       jsonb;
