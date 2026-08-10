-- ============================================================
-- Store Signal — Migration 041: Wholesale order discount decisions
-- ============================================================
-- ⚑ RUN MANUALLY IN THE SUPABASE SQL EDITOR — do not auto-apply.
--
-- Per-order decisions for the flagged (order-level-discounted) wholesale orders
-- on /lbla/reports/kll-wholesale. Each flagged order can be resolved one of four
-- ways; once resolved it re-enters the report's Gross / Total Orders using the
-- chosen method, and moves out of "pending, excluded from totals".
--
--   ignore            — exclude the order entirely (like KLLEVENT on retail)
--   distribute_full   — spread the order's full Discount Amount across its KLL
--                       lines proportionally to each line's share of the order's
--                       KLL line value; contribution = max(0, KLL gross − discount)
--   distribute_custom — same, but with a manually entered dollar amount
--   full_price        — real sale at recorded line prices; discount ignored
--
-- Keyed by order_number (Shopify "Name", e.g. "WS-8050"), NOT by month or upload
-- batch: order numbers are stable, and the wholesale upload REPLACES a month's
-- rows on re-upload, so a decision must survive that. One decision per order.

CREATE TABLE IF NOT EXISTS public.wholesale_order_discount_decisions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_number  text        NOT NULL,
  action        text        NOT NULL CHECK (action IN ('ignore', 'distribute_full', 'distribute_custom', 'full_price')),
  custom_amount numeric(12, 2),           -- only meaningful for distribute_custom
  decided_by    text,                     -- user email, for audit
  decided_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, order_number)
);

CREATE INDEX IF NOT EXISTS wholesale_order_discount_decisions_tenant_order_idx
  ON public.wholesale_order_discount_decisions(tenant_id, order_number);

ALTER TABLE public.wholesale_order_discount_decisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wholesale_order_discount_decisions: members can select" ON public.wholesale_order_discount_decisions;
CREATE POLICY "wholesale_order_discount_decisions: members can select"
  ON public.wholesale_order_discount_decisions FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()));

-- Writes go through the service client in the decision route (auth-checked there),
-- so no INSERT/UPDATE/DELETE policy is granted to end users.
