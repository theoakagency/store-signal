-- ============================================================
-- Store Signal — Initial Schema
-- Run this in the Supabase SQL Editor or via supabase db push
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- TENANTS
-- One row per merchant / business (e.g. LashBox LA)
-- ──────────────────────────────────────────────────────────
create table if not exists public.tenants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  created_at  timestamptz not null default now()
);

-- ──────────────────────────────────────────────────────────
-- STORES
-- Connected Shopify stores per tenant
-- ──────────────────────────────────────────────────────────
create table if not exists public.stores (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  shopify_domain    text not null unique,        -- e.g. lashboxla.myshopify.com
  name              text not null,
  currency          text not null default 'USD',
  store_type        text not null default 'retail', -- retail | wholesale
  last_synced_at    timestamptz,
  created_at        timestamptz not null default now()
);

create index if not exists stores_tenant_id_idx on public.stores(tenant_id);

-- ──────────────────────────────────────────────────────────
-- CUSTOMERS
-- Synced from Shopify per store
-- ──────────────────────────────────────────────────────────
create table if not exists public.customers (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  store_id            uuid not null references public.stores(id) on delete cascade,
  shopify_customer_id bigint not null,
  email               text,
  first_name          text,
  last_name           text,
  phone               text,
  orders_count        integer not null default 0,
  total_spent         numeric(12, 2) not null default 0,
  tags                text[] default '{}',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (store_id, shopify_customer_id)
);

create index if not exists customers_tenant_id_idx on public.customers(tenant_id);
create index if not exists customers_store_id_idx on public.customers(store_id);
create index if not exists customers_shopify_id_idx on public.customers(shopify_customer_id);

-- ──────────────────────────────────────────────────────────
-- ORDERS
-- Synced from Shopify per store
-- ──────────────────────────────────────────────────────────
create table if not exists public.orders (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  store_id            uuid not null references public.stores(id) on delete cascade,
  shopify_order_id    bigint not null,
  order_number        text not null,
  email               text,
  financial_status    text,         -- paid | pending | refunded | voided
  fulfillment_status  text,         -- fulfilled | partial | null
  total_price         numeric(12, 2) not null default 0,
  subtotal_price      numeric(12, 2) not null default 0,
  total_tax           numeric(12, 2) not null default 0,
  total_discounts     numeric(12, 2) not null default 0,
  currency            text not null default 'USD',
  customer_id         bigint,       -- Shopify customer ID (nullable for guest checkouts)
  line_items_count    integer not null default 0,
  tags                text[] default '{}',
  processed_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (store_id, shopify_order_id)
);

create index if not exists orders_tenant_id_idx on public.orders(tenant_id);
create index if not exists orders_store_id_idx on public.orders(store_id);
create index if not exists orders_processed_at_idx on public.orders(processed_at desc);
create index if not exists orders_shopify_id_idx on public.orders(shopify_order_id);

-- ──────────────────────────────────────────────────────────
-- PROMOTIONS
-- Promotion scorer history per store
-- ──────────────────────────────────────────────────────────
create table if not exists public.promotions (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  store_id        uuid not null references public.stores(id) on delete cascade,
  name            text not null,
  description     text,
  discount_type   text not null,  -- percentage | fixed_amount | free_shipping
  discount_value  numeric(10, 2),
  score           numeric(5, 2),  -- computed effectiveness score 0-100
  orders_count    integer not null default 0,
  revenue         numeric(12, 2) not null default 0,
  started_at      timestamptz,
  ended_at        timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists promotions_tenant_id_idx on public.promotions(tenant_id);
create index if not exists promotions_store_id_idx on public.promotions(store_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.tenants   enable row level security;
alter table public.stores     enable row level security;
alter table public.customers  enable row level security;
alter table public.orders     enable row level security;
alter table public.promotions enable row level security;

-- ──────────────────────────────────────────────────────────
-- Helper: resolve the tenant_id for the authenticated user.
-- Users are linked to tenants via a user_tenants mapping table
-- defined below. Falls back gracefully if no membership exists.
-- ──────────────────────────────────────────────────────────

create table if not exists public.user_tenants (
  user_id    uuid not null references auth.users(id) on delete cascade,
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  role       text not null default 'member', -- owner | admin | member
  primary key (user_id, tenant_id)
);

alter table public.user_tenants enable row level security;

-- Users can only see their own memberships
create policy "user_tenants: users see own rows"
  on public.user_tenants for select
  using (user_id = auth.uid());

-- ──────────────────────────────────────────────────────────
-- RLS Policies — tenant isolation via user_tenants
-- ──────────────────────────────────────────────────────────

-- TENANTS
create policy "tenants: members can select"
  on public.tenants for select
  using (
    id in (
      select tenant_id from public.user_tenants where user_id = auth.uid()
    )
  );

-- STORES
create policy "stores: members can select"
  on public.stores for select
  using (
    tenant_id in (
      select tenant_id from public.user_tenants where user_id = auth.uid()
    )
  );

-- CUSTOMERS
create policy "customers: members can select"
  on public.customers for select
  using (
    tenant_id in (
      select tenant_id from public.user_tenants where user_id = auth.uid()
    )
  );

-- ORDERS
create policy "orders: members can select"
  on public.orders for select
  using (
    tenant_id in (
      select tenant_id from public.user_tenants where user_id = auth.uid()
    )
  );

-- PROMOTIONS
create policy "promotions: members can select"
  on public.promotions for select
  using (
    tenant_id in (
      select tenant_id from public.user_tenants where user_id = auth.uid()
    )
  );

-- ============================================================
-- SEED: LashBox LA tenant + retail store
-- Update the shopify_domain to match SHOPIFY_RETAIL_STORE env var.
-- ============================================================

insert into public.tenants (id, name, slug)
values ('00000000-0000-0000-0000-000000000001', 'LashBox LA', 'lashboxla')
on conflict (slug) do nothing;

insert into public.stores (id, tenant_id, shopify_domain, name, store_type)
values (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'REPLACE_WITH_YOUR_SHOPIFY_RETAIL_STORE_DOMAIN',
  'LashBox LA — Retail',
  'retail'
)
on conflict (shopify_domain) do nothing;
