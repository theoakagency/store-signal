-- ============================================================
-- Store Signal — Migration 014: Recharge + LoyaltyLion
-- ============================================================

-- ── Stores: new credential columns ───────────────────────────────────────────

ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS recharge_api_token text;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS loyaltylion_token  text;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS loyaltylion_secret text;

-- ── Recharge Subscriptions ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.recharge_subscriptions (
  id                            text        PRIMARY KEY,
  tenant_id                     uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id                   text,
  customer_email                text,
  status                        text,
  product_title                 text,
  variant_title                 text,
  price                         numeric(12, 2),
  quantity                      integer,
  charge_interval_frequency     integer,
  order_interval_unit           text,
  created_at                    timestamptz,
  cancelled_at                  timestamptz,
  next_charge_scheduled_at      timestamptz,
  updated_at                    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recharge_subscriptions_tenant_id_idx ON public.recharge_subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS recharge_subscriptions_status_idx    ON public.recharge_subscriptions(status);
CREATE INDEX IF NOT EXISTS recharge_subscriptions_email_idx     ON public.recharge_subscriptions(customer_email);

ALTER TABLE public.recharge_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recharge_subscriptions: members can select" ON public.recharge_subscriptions;
CREATE POLICY "recharge_subscriptions: members can select"
  ON public.recharge_subscriptions FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()));

-- ── Recharge Charges ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.recharge_charges (
  id                text        PRIMARY KEY,
  tenant_id         uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  subscription_id   text,
  customer_email    text,
  status            text,
  total_price       numeric(12, 2),
  scheduled_at      timestamptz,
  processed_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recharge_charges_tenant_id_idx    ON public.recharge_charges(tenant_id);
CREATE INDEX IF NOT EXISTS recharge_charges_processed_at_idx ON public.recharge_charges(processed_at DESC);
CREATE INDEX IF NOT EXISTS recharge_charges_email_idx        ON public.recharge_charges(customer_email);

ALTER TABLE public.recharge_charges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recharge_charges: members can select" ON public.recharge_charges;
CREATE POLICY "recharge_charges: members can select"
  ON public.recharge_charges FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()));

-- ── Recharge Metrics Cache ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.recharge_metrics_cache (
  tenant_id                       uuid        PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  active_subscribers              integer,
  mrr                             numeric(12, 2),
  arr                             numeric(12, 2),
  avg_subscription_value          numeric(12, 2),
  churn_rate_30d                  numeric(8, 4),
  top_subscribed_product          text,
  interval_breakdown              jsonb,
  subscriber_vs_nonsubscriber_ltv jsonb,
  product_breakdown               jsonb,
  adhesive_penetration            numeric(8, 4),
  adhesive_nonsubscribers         integer,
  calculated_at                   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.recharge_metrics_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recharge_metrics_cache: members can select" ON public.recharge_metrics_cache;
CREATE POLICY "recharge_metrics_cache: members can select"
  ON public.recharge_metrics_cache FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()));

-- ── LoyaltyLion Customers ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.loyalty_customers (
  id                    text        PRIMARY KEY,
  tenant_id             uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email                 text,
  points_balance        integer,
  points_earned_total   integer,
  points_spent_total    integer,
  tier                  text,
  enrolled_at           timestamptz,
  last_activity_at      timestamptz,
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS loyalty_customers_tenant_id_idx ON public.loyalty_customers(tenant_id);
CREATE INDEX IF NOT EXISTS loyalty_customers_email_idx     ON public.loyalty_customers(email);
CREATE INDEX IF NOT EXISTS loyalty_customers_tier_idx      ON public.loyalty_customers(tier);

ALTER TABLE public.loyalty_customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "loyalty_customers: members can select" ON public.loyalty_customers;
CREATE POLICY "loyalty_customers: members can select"
  ON public.loyalty_customers FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()));

-- ── LoyaltyLion Activities ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.loyalty_activities (
  id              text        PRIMARY KEY,
  tenant_id       uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_email  text,
  activity_type   text,
  points_change   integer,
  description     text,
  created_at      timestamptz
);

CREATE INDEX IF NOT EXISTS loyalty_activities_tenant_id_idx   ON public.loyalty_activities(tenant_id);
CREATE INDEX IF NOT EXISTS loyalty_activities_created_at_idx  ON public.loyalty_activities(created_at DESC);
CREATE INDEX IF NOT EXISTS loyalty_activities_email_idx       ON public.loyalty_activities(customer_email);

ALTER TABLE public.loyalty_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "loyalty_activities: members can select" ON public.loyalty_activities;
CREATE POLICY "loyalty_activities: members can select"
  ON public.loyalty_activities FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()));

-- ── LoyaltyLion Metrics Cache ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.loyalty_metrics_cache (
  tenant_id                 uuid        PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  enrolled_customers        integer,
  active_redeemers_30d      integer,
  points_issued_30d         integer,
  points_redeemed_30d       integer,
  redemption_rate           numeric(8, 4),
  avg_points_balance        numeric(10, 2),
  points_liability_value    numeric(12, 2),
  promotion_response_rate   jsonb,
  tier_breakdown            jsonb,
  top_redeemers             jsonb,
  calculated_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.loyalty_metrics_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "loyalty_metrics_cache: members can select" ON public.loyalty_metrics_cache;
CREATE POLICY "loyalty_metrics_cache: members can select"
  ON public.loyalty_metrics_cache FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()));
