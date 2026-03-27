-- Migration 024: Data audit log
-- Stores manual data verification entries — spot checks comparing
-- system figures against source-of-truth (Shopify admin, platform dashboards, etc.)

create table if not exists data_audit_log (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  platform        text not null,          -- e.g. 'Shopify', 'Klaviyo', 'Meta Ads'
  metric_name     text not null,          -- e.g. 'Total Orders (30d)', 'MRR'
  time_window     text not null,          -- e.g. 'Last 30 days', 'Current state'
  expected_value  text not null,          -- value from source-of-truth dashboard
  actual_value    text not null,          -- value shown in Store Signal
  match           boolean not null,       -- does it match (within tolerance)?
  tolerance_note  text,                   -- e.g. '±2% acceptable due to sync delay'
  discrepancy_note text,                  -- explanation if match = false
  verified_by     text not null,          -- e.g. 'John R.', 'automated'
  verified_at     timestamptz not null default now(),
  notes           text,
  created_at      timestamptz not null default now()
);

create index if not exists data_audit_log_tenant_idx on data_audit_log(tenant_id);
create index if not exists data_audit_log_platform_idx on data_audit_log(tenant_id, platform);
create index if not exists data_audit_log_verified_at_idx on data_audit_log(tenant_id, verified_at desc);

-- RLS
alter table data_audit_log enable row level security;

create policy "Tenant users can read audit log"
  on data_audit_log for select
  using (
    tenant_id in (
      select tenant_id from user_tenants where user_id = auth.uid()
    )
  );

create policy "Tenant users can insert audit log"
  on data_audit_log for insert
  with check (
    tenant_id in (
      select tenant_id from user_tenants where user_id = auth.uid()
    )
  );
