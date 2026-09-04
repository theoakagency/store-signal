-- Migration 040: LBLA content generator — split content_type into subject + goal
--
-- Mirrors migration 039, which made the same change to public.content_generations
-- for the dashboard Content Studio. This one covers the LBLA team tool's own log.
--
-- Unlike 039, there is no schema drift to document here: every column on
-- lbla_generation_log came from migration 028.
--
-- `tones` and `custom_audience` are retained but no longer written — the tone
-- pills and the Custom Audience Detail field were both removed from the form.
-- They stay in place so the column history remains legible.

BEGIN;

-- 1. Existing history is not preserved. The old rows describe a content_type
--    taxonomy that no longer exists and cannot be mapped onto subject/goal.
DELETE FROM public.lbla_generation_log;

-- 2. Two independent axes replace the single content_type.
--    subject — what the content is about: 'products' | 'page' | 'none'
--    goal    — what the content is for:   'educate' | 'promote' | 'announce' | 'brand'
ALTER TABLE public.lbla_generation_log
  ADD COLUMN subject TEXT NOT NULL,
  ADD COLUMN goal    TEXT NOT NULL;

-- 3. Retire the conflated column.
ALTER TABLE public.lbla_generation_log
  DROP COLUMN IF EXISTS content_type;

COMMIT;
