-- Migration 042: record which reference PDFs a generation was based on
--
-- The LBLA content generator accepts per-campaign PDF uploads (briefs, product
-- sheets). The files themselves are never stored: they are read, sent to the
-- model as document blocks, and discarded. Only the filenames are kept, so the
-- history list can show what a generation was working from.
--
-- Nullable with no default: existing rows predate the feature and legitimately
-- have no attachments, which reads better as NULL than as an empty array.

BEGIN;

ALTER TABLE public.lbla_generation_log
  ADD COLUMN IF NOT EXISTS source_files TEXT[];

COMMIT;
