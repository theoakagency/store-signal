-- Migration 041: per-tool access control for the LBLA section
--
-- Until now the only access check anywhere was "is there a signed-in user".
-- These two columns add an authorisation layer:
--
--   is_admin    — full access to everything, including /dashboard
--   lbla_tools  — for non-admins, the exact set of LBLA tool keys they may open
--
-- Tool keys are defined in lib/lblaTools.ts and must match it exactly:
--   ideas, content, sku-report, shipping-margin, kll-royalty,
--   kll-discount-summary, kll-wholesale, discount-codes, admin
--
-- The pre-existing `role` column (owner | admin | member, default 'member') is
-- left untouched. Nothing has ever read it; it is not wired to these checks.

BEGIN;

ALTER TABLE public.user_tenants
  ADD COLUMN IF NOT EXISTS is_admin   BOOLEAN  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lbla_tools TEXT[]   NOT NULL DEFAULT '{}';

-- Grant admin to the owner account so this migration cannot lock everyone out.
-- Looked up by email rather than a hardcoded uuid.
UPDATE public.user_tenants ut
   SET is_admin = true
  FROM auth.users u
 WHERE u.id = ut.user_id
   AND lower(u.email) = 'john@theoakagency.com';

-- Fail loudly rather than deploying a locked-out app: if the update matched no
-- rows, the email has no user_tenants row and nobody would be an admin.
DO $$
DECLARE
  admin_count INTEGER;
BEGIN
  SELECT count(*) INTO admin_count
    FROM public.user_tenants
   WHERE is_admin = true;

  IF admin_count = 0 THEN
    RAISE EXCEPTION
      'No admin was set. Check that john@theoakagency.com exists in auth.users AND has a row in public.user_tenants, then re-run.';
  END IF;
END $$;

COMMIT;
