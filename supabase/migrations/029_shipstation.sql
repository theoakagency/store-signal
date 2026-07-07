-- ============================================================
-- Store Signal — Migration 029: ShipStation
-- ============================================================
-- Pulls actual shipping label cost per order from ShipStation (API v2),
-- matched to the corresponding Shopify order via shopify_order_id, for
-- cost/margin reporting (e.g. KLL royalty report — real shipping cost,
-- not customer-charged shipping).

-- ── Stores: credential + incremental sync cursor ─────────────────────────────

ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS shipstation_api_key text;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS shipstation_last_synced_at timestamptz;

-- ── ShipStation Shipments (one row per label) ────────────────────────────────

CREATE TABLE IF NOT EXISTS public.shipstation_shipments (
  id                 text        PRIMARY KEY,   -- ShipStation label_id
  tenant_id          uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  shopify_order_id   bigint,                     -- from labels.external_order_id; join key to orders.shopify_order_id
  shipment_cost      numeric(12, 2),
  currency           text,
  ship_date          timestamptz,
  carrier_id         text,
  service_code       text,
  label_created_at   timestamptz,                -- ShipStation label created_at; used as the incremental sync cursor
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shipstation_shipments_tenant_id_idx        ON public.shipstation_shipments(tenant_id);
CREATE INDEX IF NOT EXISTS shipstation_shipments_shopify_order_id_idx ON public.shipstation_shipments(shopify_order_id);
CREATE INDEX IF NOT EXISTS shipstation_shipments_label_created_at_idx ON public.shipstation_shipments(label_created_at DESC);

ALTER TABLE public.shipstation_shipments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shipstation_shipments: members can select" ON public.shipstation_shipments;
CREATE POLICY "shipstation_shipments: members can select"
  ON public.shipstation_shipments FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()));
