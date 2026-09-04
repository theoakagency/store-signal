-- Migration 039: Content Studio — split content_type into subject + goal
--
-- ─────────────────────────────────────────────────────────────────────────────
-- SCHEMA DRIFT NOTICE — read before relying on this file's history
--
-- Two columns on public.content_generations were added directly in the Supabase
-- dashboard and never captured in a migration file:
--
--   • content_type  TEXT  — added out-of-band; written by the generate route
--                           since the Content Studio content-type dropdown
--                           shipped. Dropped by this migration.
--   • custom_audience TEXT — added out-of-band; written by the generate route
--                           until the Custom Audience Detail field was removed.
--                           Left in place here (now always NULL).
--
-- This means migrations 026..038 do NOT reproduce the live schema: a database
-- rebuilt from migration files alone would lack both columns, and the DROP
-- COLUMN below would fail. The IF EXISTS guard covers that case.
--
-- Also note `tones text[]` (migration 026) is no longer written; it is retained
-- rather than dropped so historical intent stays visible in the schema.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1. Existing history is not preserved. The old rows describe a content_type
--    taxonomy that no longer exists and cannot be mapped onto subject/goal.
DELETE FROM public.content_generations;

-- 2. Two independent axes replace the single content_type.
--    subject — what the content is about: 'products' | 'page' | 'none'
--    goal    — what the content is for:   'educate' | 'promote' | 'announce' | 'brand'
ALTER TABLE public.content_generations
  ADD COLUMN subject TEXT NOT NULL,
  ADD COLUMN goal    TEXT NOT NULL;

-- 3. Retire the conflated column.
ALTER TABLE public.content_generations
  DROP COLUMN IF EXISTS content_type;

COMMIT;
