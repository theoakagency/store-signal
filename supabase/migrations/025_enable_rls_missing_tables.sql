-- Migration 025: Enable RLS on tables that were missing it
-- Fixes Supabase security alert: rls_disabled_in_public
--
-- cron_logs (migration 020) was created without RLS.
-- ll_audit_customers / ll_audit_activities (migration 016) were marked
-- TEMPORARY and never applied to production — handled below with DO block.

-- ── cron_logs ─────────────────────────────────────────────────────────────────
alter table cron_logs enable row level security;

-- Cron logs have no tenant_id column; all authenticated users may read them.
-- Writes are service-role only (cron routes use createSupabaseServiceClient).
create policy "Authenticated users can read cron logs"
  on cron_logs for select
  using (auth.role() = 'authenticated');

-- ── ll_audit_customers / ll_audit_activities (conditional) ───────────────────
-- These tables were never applied to production. Enable RLS only if they exist.
do $$ begin
  if exists (select 1 from information_schema.tables where table_name = 'll_audit_customers' and table_schema = 'public') then
    alter table ll_audit_customers enable row level security;
    execute $p$
      create policy "Tenant users can read ll audit customers"
        on ll_audit_customers for select
        using (auth.role() = 'authenticated')
    $p$;
  end if;

  if exists (select 1 from information_schema.tables where table_name = 'll_audit_activities' and table_schema = 'public') then
    alter table ll_audit_activities enable row level security;
    execute $p$
      create policy "Tenant users can read ll audit activities"
        on ll_audit_activities for select
        using (auth.role() = 'authenticated')
    $p$;
  end if;
end $$;
