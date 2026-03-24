-- Migration 016: LoyaltyLion raw data audit tables
-- Purpose: Store raw API responses to investigate cross-merchant data scope.
-- TEMPORARY — remove once LoyaltyLion data ownership is confirmed.

create table if not exists ll_audit_customers (
  id              bigint primary key,           -- LoyaltyLion customer ID
  merchant_id     text,                         -- Shopify customer ID (store identifier)
  email           text,
  shopify_source  text,                         -- metadata.shopify_source_url
  points_approved integer,
  points_pending  integer,
  points_spent    integer,
  enrolled        boolean,
  enrolled_at     timestamptz,
  tier_name       text,
  guest           boolean,
  raw             jsonb,                        -- full API response object
  synced_at       timestamptz default now()
);

create table if not exists ll_audit_activities (
  id                   bigint primary key,      -- LoyaltyLion activity ID
  activity_merchant_id text,                   -- merchant_id on the activity itself
  customer_id          bigint,
  customer_merchant_id text,                   -- merchant_id on the nested customer
  customer_email       text,
  value                integer,
  state                text,
  rule_id              bigint,
  rule_name            text,
  created_at           timestamptz,
  raw                  jsonb,                  -- full API response object
  synced_at            timestamptz default now()
);
