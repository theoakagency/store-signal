-- ============================================================
-- Store Signal — Migration 036: ShipStation cost accuracy fields
-- ============================================================
-- ⚑ RUN MANUALLY IN THE SUPABASE SQL EDITOR — do not auto-apply.
--
-- Adds the fields needed to compute shipping cost correctly for the
-- shipping-margin report. Today `shipstation_shipments` stores only
-- `shipment_cost`, which is not enough:
--
--   status              text  -- CRITICAL. Label lifecycle status from
--                                ShipStation v2 ("completed", "voided",
--                                "processing", ...). A voided-then-reprinted
--                                label currently double-counts cost; the
--                                report (and the KLL royalty report) must
--                                exclude status = 'voided' from all cost sums.
--   insurance_cost      numeric(12,2) -- In ShipStation v2 insurance is a
--                                       SEPARATE money field, NOT included in
--                                       shipment_cost. Total carrier cost =
--                                       shipment_cost + insurance_cost.
--   external_shipment_id text -- Raw join provenance. The live join derives
--                                shopify_order_id from the first "-"-delimited
--                                segment of this value (commit 2149928);
--                                storing it verbatim makes bad joins debuggable.
--
-- Optional (cheap, enable zone/return analysis later — populated only if
-- ShipStation returns them on the label object; NULL otherwise):
--   is_return_label     boolean
--   ship_to_state       text
--   ship_to_postal_code text
--   weight_oz           numeric(12,2)
--
-- NOTE: existing rows keep these NULL until a ShipStation historical
-- backfill re-syncs the window (upsert on `id`/label_id updates in place).
-- The same backfill repairs any pre-2149928 rows whose shopify_order_id is
-- still NULL from before the external_shipment_id join fix.

ALTER TABLE public.shipstation_shipments ADD COLUMN IF NOT EXISTS status               text;
ALTER TABLE public.shipstation_shipments ADD COLUMN IF NOT EXISTS insurance_cost       numeric(12, 2);
ALTER TABLE public.shipstation_shipments ADD COLUMN IF NOT EXISTS external_shipment_id text;
ALTER TABLE public.shipstation_shipments ADD COLUMN IF NOT EXISTS is_return_label      boolean;
ALTER TABLE public.shipstation_shipments ADD COLUMN IF NOT EXISTS ship_to_state        text;
ALTER TABLE public.shipstation_shipments ADD COLUMN IF NOT EXISTS ship_to_postal_code  text;
ALTER TABLE public.shipstation_shipments ADD COLUMN IF NOT EXISTS weight_oz            numeric(12, 2);

-- Speeds up the "exclude voided" filter the report applies on every cost sum.
CREATE INDEX IF NOT EXISTS shipstation_shipments_status_idx ON public.shipstation_shipments(status);
