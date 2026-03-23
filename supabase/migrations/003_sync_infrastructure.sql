-- ============================================================
-- Store Signal — Migration 003: Sync Infrastructure
-- Adds: sync_log, line_items JSONB on orders,
--       first/last order timestamps on customers,
--       metrics_cache, promotions form_data/ai_analysis columns
-- ============================================================

-- ── line_items JSONB on orders ────────────────────────────────────────────────
alter table public.orders
  add column if not exists line_items jsonb default '[]'::jsonb;

-- ── customer lifetime timestamps ──────────────────────────────────────────────
alter table public.customers
  add column if not exists first_order_at timestamptz,
  add column if not exists last_order_at  timestamptz;

-- ── sync_log ─────────────────────────────────────────────────────────────────
create table if not exists public.sync_log (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  store_id         uuid not null references public.stores(id) on delete cascade,
  sync_type        text not null default 'incremental',  -- incremental | historical | chunk
  started_at       timestamptz not null default now(),
  completed_at     timestamptz,
  orders_synced    integer not null default 0,
  customers_synced integer not null default 0,
  status           text not null default 'running',  -- running | success | error | partial
  error_message    text,
  metadata         jsonb default '{}'::jsonb
);

create index if not exists sync_log_store_id_idx on public.sync_log(store_id);
create index if not exists sync_log_started_at_idx on public.sync_log(started_at desc);

alter table public.sync_log enable row level security;

create policy "sync_log: members can select"
  on public.sync_log for select
  using (
    tenant_id in (
      select tenant_id from public.user_tenants where user_id = auth.uid()
    )
  );

-- ── metrics_cache ─────────────────────────────────────────────────────────────
create table if not exists public.metrics_cache (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  store_id         uuid not null references public.stores(id) on delete cascade,
  metric_name      text not null,
  metric_value     numeric(18, 4),
  metric_metadata  jsonb default '{}'::jsonb,
  calculated_at    timestamptz not null default now(),
  unique (store_id, metric_name)
);

create index if not exists metrics_cache_store_id_idx on public.metrics_cache(store_id);

alter table public.metrics_cache enable row level security;

create policy "metrics_cache: members can select"
  on public.metrics_cache for select
  using (
    tenant_id in (
      select tenant_id from public.user_tenants where user_id = auth.uid()
    )
  );

-- ── promotions: add form_data and ai_analysis columns ────────────────────────
alter table public.promotions
  add column if not exists form_data   jsonb default '{}'::jsonb,
  add column if not exists ai_analysis jsonb default '{}'::jsonb,
  add column if not exists target_audience text,
  add column if not exists promotion_type  text,
  add column if not exists channel         text,
  add column if not exists budget          numeric(10, 2),
  add column if not exists duration_days   integer;
