-- ============================================================
-- Store Signal — Migration 017: SEMrush Integration
-- ============================================================

-- ── Stores: new credential columns ───────────────────────────────────────────

ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS semrush_api_key text;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS semrush_domain  text;

-- ── SEMrush Keywords ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.semrush_keywords (
  id                    text        PRIMARY KEY,
  tenant_id             uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  keyword               text,
  position              integer,
  previous_position     integer,
  position_change       integer,
  search_volume         integer,
  keyword_difficulty    integer,
  cpc                   numeric(10, 2),
  url                   text,
  traffic_estimate      integer,
  traffic_percent       numeric(8, 4),
  date_checked          date,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS semrush_keywords_tenant_id_idx  ON public.semrush_keywords(tenant_id);
CREATE INDEX IF NOT EXISTS semrush_keywords_position_idx   ON public.semrush_keywords(position);
CREATE INDEX IF NOT EXISTS semrush_keywords_volume_idx     ON public.semrush_keywords(search_volume DESC);

ALTER TABLE public.semrush_keywords ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "semrush_keywords: members can select" ON public.semrush_keywords;
CREATE POLICY "semrush_keywords: members can select"
  ON public.semrush_keywords FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()));

-- ── SEMrush Competitors ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.semrush_competitors (
  id                      text        PRIMARY KEY,
  tenant_id               uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  domain                  text,
  common_keywords         integer,
  organic_keywords        integer,
  organic_traffic         integer,
  organic_traffic_cost    numeric(12, 2),
  competition_level       numeric(8, 4),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS semrush_competitors_tenant_id_idx ON public.semrush_competitors(tenant_id);

ALTER TABLE public.semrush_competitors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "semrush_competitors: members can select" ON public.semrush_competitors;
CREATE POLICY "semrush_competitors: members can select"
  ON public.semrush_competitors FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()));

-- ── SEMrush Backlinks ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.semrush_backlinks (
  tenant_id                 uuid        PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  total_backlinks           integer,
  referring_domains         integer,
  referring_domains_change  integer,
  authority_score           integer,
  calculated_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.semrush_backlinks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "semrush_backlinks: members can select" ON public.semrush_backlinks;
CREATE POLICY "semrush_backlinks: members can select"
  ON public.semrush_backlinks FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()));

-- ── SEMrush Keyword Gaps ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.semrush_keyword_gaps (
  id                    text        PRIMARY KEY,
  tenant_id             uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  keyword               text,
  competitor_domain     text,
  competitor_position   integer,
  our_position          integer,
  search_volume         integer,
  keyword_difficulty    integer,
  opportunity_score     integer,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS semrush_keyword_gaps_tenant_id_idx ON public.semrush_keyword_gaps(tenant_id);
CREATE INDEX IF NOT EXISTS semrush_keyword_gaps_volume_idx    ON public.semrush_keyword_gaps(search_volume DESC);

ALTER TABLE public.semrush_keyword_gaps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "semrush_keyword_gaps: members can select" ON public.semrush_keyword_gaps;
CREATE POLICY "semrush_keyword_gaps: members can select"
  ON public.semrush_keyword_gaps FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()));

-- ── SEMrush Metrics Cache ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.semrush_metrics_cache (
  tenant_id                 uuid        PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  organic_keywords_total    integer,
  organic_traffic_estimate  integer,
  authority_score           integer,
  top_competitors           jsonb,
  keyword_opportunities     jsonb,
  traffic_trend             jsonb,
  lost_keywords_30d         integer,
  gained_keywords_30d       integer,
  calculated_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.semrush_metrics_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "semrush_metrics_cache: members can select" ON public.semrush_metrics_cache;
CREATE POLICY "semrush_metrics_cache: members can select"
  ON public.semrush_metrics_cache FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()));
