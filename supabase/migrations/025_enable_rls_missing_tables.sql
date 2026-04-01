-- Migration 025: Enable RLS on tables that were missing it
-- Fixes Supabase security alert: rls_disabled_in_public
-- Affected tables: ll_audit_customers, ll_audit_activities (migration 016),
--                  cron_logs (migration 020)

-- ── ll_audit_customers ────────────────────────────────────────────────────────
alter table ll_audit_customers enable row level security;

-- Audit tables are internal-only; only authenticated tenant users may read them.
-- No direct insert policy needed — writes go through the service role key only.
create policy "Tenant users can read ll audit customers"
  on ll_audit_customers for select
  using (auth.role() = 'authenticated');

-- ── ll_audit_activities ───────────────────────────────────────────────────────
alter table ll_audit_activities enable row level security;

create policy "Tenant users can read ll audit activities"
  on ll_audit_activities for select
  using (auth.role() = 'authenticated');

-- ── cron_logs ─────────────────────────────────────────────────────────────────
alter table cron_logs enable row level security;

-- Cron logs have no tenant_id column; all authenticated users may read them.
-- Writes are service-role only (cron routes use createSupabaseServiceClient).
create policy "Authenticated users can read cron logs"
  on cron_logs for select
  using (auth.role() = 'authenticated');
