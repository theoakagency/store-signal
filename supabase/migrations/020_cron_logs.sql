-- Migration 020: Cron job execution logs
-- Tracks every automated background sync run for observability and debugging.

do $$ begin
  create type cron_status as enum ('running', 'completed', 'failed');
exception when duplicate_object then null;
end $$;

create table if not exists cron_logs (
  id                 uuid        primary key default gen_random_uuid(),
  cron_name          text        not null,
  started_at         timestamptz not null default now(),
  completed_at       timestamptz,
  status             cron_status not null default 'running',
  tenants_processed  int         not null default 0,
  records_synced     int         not null default 0,
  errors             jsonb       not null default '[]'::jsonb,
  metadata           jsonb       not null default '{}'::jsonb
);

create index if not exists cron_logs_cron_name_idx on cron_logs (cron_name, started_at desc);
create index if not exists cron_logs_started_at_idx on cron_logs (started_at desc);
