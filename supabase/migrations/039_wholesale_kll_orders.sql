-- ============================================================
-- Store Signal — Migration 039: Wholesale KLL orders (manual CSV upload)
-- ============================================================
-- ⚑ RUN MANUALLY IN THE SUPABASE SQL EDITOR — do not auto-apply.
--
-- Backs /lbla/reports/kll-wholesale. wholesale.lashboxla.com is a SEPARATE
-- Shopify store with no API connection in Store Signal, so its KLL sales arrive
-- as a manual "Orders and line items" CSV export that the team uploads monthly.
--
-- One row per target-SKU line item, already filtered and costed at upload time:
--   * only the 16 KLL target SKUs (lib/kll.ts TARGET_SKUS)
--   * only orders whose Financial Status is "paid"
--   * gross = quantity x unit_price
--
-- Prices from this store are Sparklayer B2B tier prices — `Lineitem price` is
-- ALREADY the net wholesale price after the customer's tier discount, so there
-- is nothing further to subtract. That is why there is no discount column here
-- and why gross is the final figure, unlike the retail KLL report.
--
-- `month` is the YYYY-MM taken from the export's `Created at` column as written
-- (store-local), NOT re-derived in UTC — it has to agree with the date range the
-- exporter picked in Shopify Admin.
--
-- Re-uploading a corrected file for a month REPLACES that month: the upload
-- route deletes every row for (tenant_id, month) before inserting. There is
-- deliberately no unique constraint on (order, sku) — one order legitimately can
-- carry the same SKU on two lines — so replacement is by month, not by upsert.

CREATE TABLE IF NOT EXISTS public.wholesale_kll_orders (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  month            text        NOT NULL,          -- 'YYYY-MM', from the export's Created at
  order_number     text        NOT NULL,          -- Shopify export "Name", e.g. "#WS1042"
  order_created_at text,                          -- raw Created at, kept verbatim for tracing
  sku              text        NOT NULL,
  product_title    text,
  quantity         integer     NOT NULL,
  unit_price       numeric(12, 2) NOT NULL,       -- net wholesale price (Sparklayer tier)
  gross            numeric(12, 2) NOT NULL,       -- quantity * unit_price
  source_filename  text,
  uploaded_at      timestamptz NOT NULL DEFAULT now()
);

-- Every read is "one month for one tenant"; every write deletes by the same key.
CREATE INDEX IF NOT EXISTS wholesale_kll_orders_tenant_month_idx
  ON public.wholesale_kll_orders(tenant_id, month);

ALTER TABLE public.wholesale_kll_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wholesale_kll_orders: members can select" ON public.wholesale_kll_orders;
CREATE POLICY "wholesale_kll_orders: members can select"
  ON public.wholesale_kll_orders FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()));

-- Writes go through the service client in the upload route, which bypasses RLS,
-- so no INSERT/DELETE policy is granted to end users.
