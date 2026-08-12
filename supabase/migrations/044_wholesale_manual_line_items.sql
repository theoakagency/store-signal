-- ============================================================
-- Store Signal — Migration 044: Wholesale manual line items
-- ============================================================
-- ⚑ RUN MANUALLY IN THE SUPABASE SQL EDITOR — do not auto-apply.
--
-- Hand-entered KLL line items for /lbla/reports/kll-wholesale, added directly
-- (no upload, no discount decision). Kept in their OWN table — NOT in
-- wholesale_kll_orders — because the upload REPLACES a month's rows on re-upload,
-- which would wipe them. The report merges them into the main detail table, SKUs
-- Sold, CSV and totals at read time, and also lists them in an audit section.
--
-- Works for any month regardless of that month's rule_set (legacy or simplified);
-- a manual entry always counts immediately, no review step.
--
--   order_number is OPTIONAL — a manual line can join an existing order (same
--   Name) or stand alone (blank). gross is stored = quantity x unit_price.
--   added_by / added_at capture the audit trail, same pattern as the decisions.

CREATE TABLE IF NOT EXISTS public.wholesale_manual_line_items (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  month         text        NOT NULL,            -- 'YYYY-MM' the entry belongs to
  order_number  text,                            -- optional; may match an uploaded order
  sku           text        NOT NULL,
  product_title text,
  quantity      integer     NOT NULL,
  unit_price    numeric(12, 2) NOT NULL,
  gross         numeric(12, 2) NOT NULL,          -- quantity x unit_price
  added_by      text,                            -- user email, for audit
  added_at      timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wholesale_manual_line_items_tenant_month_idx
  ON public.wholesale_manual_line_items(tenant_id, month);

ALTER TABLE public.wholesale_manual_line_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wholesale_manual_line_items: members can select" ON public.wholesale_manual_line_items;
CREATE POLICY "wholesale_manual_line_items: members can select"
  ON public.wholesale_manual_line_items FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()));

-- Writes go through the manual-entry route (auth-checked) with the service client.
