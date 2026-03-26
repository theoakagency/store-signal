-- Migration 023: Performance indexes
-- Adds missing indexes on ads, analytics, and composite indexes for
-- the most common query patterns (financial_status + date range,
-- email joins, cohort queries, cancellation lookups).

-- ── Orders compound indexes ────────────────────────────────────────────────────
-- Used by metrics/refresh, products/analyze, and Shopify page
CREATE INDEX IF NOT EXISTS orders_store_status_idx
  ON public.orders(store_id, financial_status);

CREATE INDEX IF NOT EXISTS orders_store_status_date_idx
  ON public.orders(store_id, financial_status, processed_at DESC);

-- Used by loyalty sync (join orders by email to compute tier LTV)
CREATE INDEX IF NOT EXISTS orders_store_email_idx
  ON public.orders(store_id, email);

-- ── Customers email index ──────────────────────────────────────────────────────
-- Used by profile building and customer overlap queries
CREATE INDEX IF NOT EXISTS customers_email_idx
  ON public.customers(email);

-- ── Recharge compound indexes ──────────────────────────────────────────────────
-- Created_at used by cohort queries added in Section 7 (subscriber cohorts)
CREATE INDEX IF NOT EXISTS recharge_subscriptions_tenant_created_at_idx
  ON public.recharge_subscriptions(tenant_id, created_at DESC);

-- Cancelled_at used for recent cancellation lookups
CREATE INDEX IF NOT EXISTS recharge_subscriptions_tenant_cancelled_at_idx
  ON public.recharge_subscriptions(tenant_id, cancelled_at DESC);

-- ── Customer profiles email ────────────────────────────────────────────────────
-- Used by profile build batch (email lookup) and segment queries
CREATE INDEX IF NOT EXISTS customer_profiles_email_idx
  ON public.customer_profiles(email);

-- ── Meta Ads indexes ───────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS meta_campaigns_tenant_id_idx
  ON public.meta_campaigns(tenant_id);

CREATE INDEX IF NOT EXISTS meta_campaigns_date_start_idx
  ON public.meta_campaigns(date_start DESC);

-- ── Google Ads indexes ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS google_ads_campaigns_tenant_id_idx
  ON public.google_ads_campaigns(tenant_id);

-- ── Analytics indexes ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS analytics_sessions_tenant_date_idx
  ON public.analytics_sessions(tenant_id, session_date DESC);

CREATE INDEX IF NOT EXISTS analytics_sessions_channel_idx
  ON public.analytics_sessions(tenant_id, channel_group);

CREATE INDEX IF NOT EXISTS analytics_monthly_tenant_month_idx
  ON public.analytics_monthly(tenant_id, month DESC);

CREATE INDEX IF NOT EXISTS analytics_pages_tenant_idx
  ON public.analytics_pages(tenant_id, pageviews DESC);
