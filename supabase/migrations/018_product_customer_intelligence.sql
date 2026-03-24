-- ============================================================
-- Store Signal — Migration 018: Product & Customer Intelligence
-- ============================================================

-- ── Customer Profiles ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.customer_profiles (
  tenant_id                  uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email                      text        NOT NULL,
  shopify_customer_id        text,
  total_orders               integer     NOT NULL DEFAULT 0,
  total_revenue              numeric     NOT NULL DEFAULT 0,
  avg_order_value            numeric     NOT NULL DEFAULT 0,
  first_order_at             timestamptz,
  last_order_at              timestamptz,
  days_since_last_order      integer,
  avg_days_between_orders    numeric,
  segment                    text,
  is_subscriber              boolean     NOT NULL DEFAULT false,
  subscription_interval      text,
  subscription_mrr           numeric     NOT NULL DEFAULT 0,
  is_loyalty_member          boolean     NOT NULL DEFAULT false,
  loyalty_tier               text,
  loyalty_points_balance     integer     NOT NULL DEFAULT 0,
  loyalty_points_spent       integer     NOT NULL DEFAULT 0,
  top_categories             jsonb,
  top_products               jsonb,
  first_product_bought       text,
  most_recent_product        text,
  predicted_next_order_date  date,
  ltv_segment                text,        -- Diamond | Gold | Silver | Bronze
  engagement_score           integer,     -- 0–100
  calculated_at              timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, email)
);

CREATE INDEX IF NOT EXISTS customer_profiles_tenant_id_idx   ON public.customer_profiles(tenant_id);
CREATE INDEX IF NOT EXISTS customer_profiles_ltv_segment_idx ON public.customer_profiles(tenant_id, ltv_segment);
CREATE INDEX IF NOT EXISTS customer_profiles_engagement_idx  ON public.customer_profiles(tenant_id, engagement_score DESC);

ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customer_profiles: members can select" ON public.customer_profiles;
CREATE POLICY "customer_profiles: members can select"
  ON public.customer_profiles FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()));

-- ── Customer Overlap Cache ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.customer_overlap_cache (
  tenant_id                 uuid        PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  total_customers           integer     NOT NULL DEFAULT 0,
  subscribers_only          integer     NOT NULL DEFAULT 0,
  loyalty_only              integer     NOT NULL DEFAULT 0,
  vip_only                  integer     NOT NULL DEFAULT 0,
  subscriber_and_loyalty    integer     NOT NULL DEFAULT 0,
  subscriber_and_vip        integer     NOT NULL DEFAULT 0,
  loyalty_and_vip           integer     NOT NULL DEFAULT 0,
  all_three                 integer     NOT NULL DEFAULT 0,
  overlap_details           jsonb,
  calculated_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.customer_overlap_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customer_overlap_cache: members can select" ON public.customer_overlap_cache;
CREATE POLICY "customer_overlap_cache: members can select"
  ON public.customer_overlap_cache FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()));

-- ── Product Stats ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.product_stats (
  tenant_id                       uuid    NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_title                   text    NOT NULL,
  variant_title                   text    NOT NULL DEFAULT '',
  total_revenue                   numeric NOT NULL DEFAULT 0,
  total_quantity_sold             integer NOT NULL DEFAULT 0,
  total_orders                    integer NOT NULL DEFAULT 0,
  unique_customers                integer NOT NULL DEFAULT 0,
  avg_order_value_with_product    numeric NOT NULL DEFAULT 0,
  repeat_purchase_rate            numeric NOT NULL DEFAULT 0,
  avg_days_to_repurchase          numeric NOT NULL DEFAULT 0,
  first_purchase_leads_to_second  numeric NOT NULL DEFAULT 0,
  subscription_conversion_rate    numeric NOT NULL DEFAULT 0,
  is_subscribable                 boolean NOT NULL DEFAULT false,
  revenue_30d                     numeric NOT NULL DEFAULT 0,
  revenue_90d                     numeric NOT NULL DEFAULT 0,
  revenue_12m                     numeric NOT NULL DEFAULT 0,
  calculated_at                   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, product_title, variant_title)
);

CREATE INDEX IF NOT EXISTS product_stats_tenant_id_idx ON public.product_stats(tenant_id);
CREATE INDEX IF NOT EXISTS product_stats_revenue_idx   ON public.product_stats(tenant_id, total_revenue DESC);

ALTER TABLE public.product_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "product_stats: members can select" ON public.product_stats;
CREATE POLICY "product_stats: members can select"
  ON public.product_stats FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()));

-- ── Product Affinities ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.product_affinities (
  tenant_id          uuid    NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_a          text    NOT NULL,
  product_b          text    NOT NULL,
  co_purchase_count  integer NOT NULL DEFAULT 0,
  co_purchase_rate   numeric NOT NULL DEFAULT 0,
  confidence         numeric NOT NULL DEFAULT 0,
  lift               numeric NOT NULL DEFAULT 0,
  calculated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, product_a, product_b)
);

CREATE INDEX IF NOT EXISTS product_affinities_tenant_id_idx ON public.product_affinities(tenant_id);
CREATE INDEX IF NOT EXISTS product_affinities_lift_idx      ON public.product_affinities(tenant_id, lift DESC);

ALTER TABLE public.product_affinities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "product_affinities: members can select" ON public.product_affinities;
CREATE POLICY "product_affinities: members can select"
  ON public.product_affinities FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()));

-- ── Purchase Sequences ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.purchase_sequences (
  tenant_id                       uuid    NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  first_product                   text    NOT NULL,
  second_product                  text    NOT NULL,
  sequence_count                  integer NOT NULL DEFAULT 0,
  avg_days_between                numeric NOT NULL DEFAULT 0,
  ltv_of_customers_in_sequence    numeric NOT NULL DEFAULT 0,
  calculated_at                   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, first_product, second_product)
);

CREATE INDEX IF NOT EXISTS purchase_sequences_tenant_id_idx ON public.purchase_sequences(tenant_id);
CREATE INDEX IF NOT EXISTS purchase_sequences_ltv_idx       ON public.purchase_sequences(tenant_id, ltv_of_customers_in_sequence DESC);

ALTER TABLE public.purchase_sequences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "purchase_sequences: members can select" ON public.purchase_sequences;
CREATE POLICY "purchase_sequences: members can select"
  ON public.purchase_sequences FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()));
