# Shipping Margin Report — Feasibility & Spec (July 2026)

Second deliverable, separate from the dashboard audit. Goal: a Kate-readable report answering whether LashBox's on-site shipping prices should change to capture more margin or to remove friction and drive more orders. Scope here is investigation + feasibility + spec, not a build.

**Verdict: feasible, and cheaper than expected — but blocked by one Shopify schema gap.** The ShipStation side is nearly ready; the Shopify side receives shipping-charged data in every API payload and throws it away.

---

## 1. Current state (verified in code)

### The join is already fixed
The `external_shipment_id` first-segment join is **already live** — commit `2149928` implemented exactly it:

```ts
// lib/syncShipStation.ts:22-28
const firstSegment = label.external_shipment_id?.split('-')[0]
```

Unparseable IDs → `shopify_order_id = null`, tallied as `unmatched`. What's stale is the *documentation*: `supabase/migrations/029_shipstation.sql:19` and the AGENTS.md Known Issue still describe the old `external_order_id` join. One data-hygiene step: any labels synced before that commit may have `null shopify_order_id`; re-running the ShipStation historical backfill over that window repairs rows in place (upsert keys on `label_id`). Verify after with:
`SELECT count(*) FROM shipstation_shipments WHERE shopify_order_id IS NULL;`

### ShipStation data captured today
`shipstation_shipments`: label id, `shopify_order_id`, `shipment_cost`, currency, `ship_date`, `carrier_id`, `service_code`, `label_created_at`. One row per label; multiple labels per order sum naturally by grouping on `shopify_order_id` (the KLL route already does this, `app/api/lbla/reports/kll-royalty/route.ts:170-172`).

**Gaps:**
- **Voided labels are not filtered** — `label.status` is fetched but never stored. A voided-then-reprinted label double-counts cost today. Must fix for this report (it also slightly inflates KLL shipping deductions).
- **Insurance cost not captured** — in ShipStation v2 it is a separate money field, *not* inside `shipment_cost`. Confirmation/signature fees are inside the carrier rate, so those are covered.
- Raw `external_shipment_id` isn't stored (join provenance), and `ship_to` state/zip and weight aren't captured (would enable zone analysis later; optional).

### Shopify data — the real gap
- The orders fetch uses no `fields` param (`lib/syncShopify.ts:78`), so **`shipping_lines` and `total_shipping_price_set` already arrive in every payload** — no new scope, endpoint, or API cost.
- Nothing shipping-related is mapped or stored. Zero shipping columns exist in any migration (verified).
- Both order mappers (`lib/syncShopify.ts:149` and the historical route's duplicate) need the same 3-field addition. Migration 030 (`discount_codes`) is the exact precedent: add column → extend mappers → re-run backfill.

### Backfill pattern (exists, used twice)
Both Shopify and ShipStation have chunked historical backfill routes: POST a window, process one 7-day chunk, return `next_chunk_start`, caller loops. Shopify's upserts on `(store_id, shopify_order_id)` update existing rows in place — so a full-history re-backfill after adding the columns populates shipping data for past orders. ~52 chunk calls per 12 months.

---

## 2. Migrations needed (⚑ flag only — run manually in SQL Editor)

**⚑ Migration A — `orders` (shipping charged):**
- `shipping_charged numeric(12,2)` — from `total_shipping_price_set.shop_money.amount`
- `shipping_discounted numeric(12,2)` — sum of `shipping_lines[].discounted_price`; distinguishes code-driven free shipping from threshold-driven
- `shipping_method text` — `shipping_lines[0].title` (the tier the customer picked: "Free Shipping", "Standard", etc.)

**⚑ Migration B — `shipstation_shipments` (cost accuracy):**
- `status text` — exclude `voided` from all cost sums (critical)
- `insurance_cost numeric(12,2)`
- `external_shipment_id text` — raw join provenance
- Optional but cheap: `is_return_label boolean`, `ship_to_state text`, `ship_to_postal_code text`, `weight_oz numeric`

**Code changes alongside:** extend both Shopify mappers + interfaces; extend `lib/shipstation.ts` label type + `lib/syncShipStation.ts` row mapping; then re-run both historical backfills over the analysis window; fix the stale join docs.

---

## 3. Data feasibility assessment

- **Match rate: high but not 100%, and that's fine.** Only physically shipped orders have labels — digital/GWP-only, local pickup, POS (`source_name='pos'`, filterable), and externally-fulfilled orders won't match. The report must show a **match-rate KPI** (orders with ≥1 label ÷ shipped orders in range) so every figure is self-qualifying. The KLL report proves the join works in production.
- **Coverage window:** ShipStation data exists only for backfilled windows; constrain the report's date picker to the overlap of both datasets (or extend the backfill first).
- **Split shipments:** sum label costs per order (existing pattern). Exclude voided and return labels once columns exist.
- **Refunds/cancellations:** follow the KLL precedent (`financial_status = 'paid'`). Note the audit's finding that refund status goes stale — the dashboard-audit Phase 1 fix improves this report too. Cancelled-after-label orders (label bought, order cancelled) are a real cost with zero revenue — surface separately, don't silently drop.
- **Honest naming:** `shipment_cost` is the **carrier label cost** (+insurance once captured). It excludes packaging materials and pick/pack labor. The report must say "carrier cost", never "fulfillment cost".
- **Free-shipping threshold: fully computable after Migration A + backfill.** The current threshold is empirically discoverable — plot % of orders with `shipping_charged = 0` against `subtotal_price` buckets; the threshold appears as a sharp step, corroborated by `shipping_method` titles. `shipping_discounted` disambiguates promo-code free shipping. A manual threshold override input is a cheap safety net for promo-heavy months. The classic analysis (order density just below the threshold = cart padding; label cost on free-ship orders just above it vs incremental basket margin) needs only `subtotal_price`, `shipping_charged`, `shipping_method`, and summed label cost — all available post-migration.

---

## 4. Proposed report spec

Follow the KLL royalty report template exactly: page at `app/lbla/reports/shipping-margin/page.tsx` + `GET /api/lbla/reports/shipping-margin?start&end` (service client, paginated orders, chunked `.in()` shipment lookup). Reuse its date-range picker, collapsible plain-language explainer, summary stat cards, zebra table with totals footer, CSV export, and skeleton loader.

**Sections (in Kate's reading order):**

1. **Headline cards** — Shipping Collected · Shipping Paid to Carriers · Net Shipping Margin ($ and %) · Data Coverage (match rate + date range).
2. **"How this is calculated"** collapsible, in the KLL plain-language style. Example copy (client-facing, plain, no em-dashes): *"For every order, we compare what the customer paid for shipping at checkout with what we actually paid the carrier for the shipping label. Some orders are excluded, like pickups and orders we could not match to a label, and we show you how many. These numbers cover carrier label costs only, not boxes or packing time."*
3. **Margin by shipping tier** (group by `shipping_method`): orders, avg charged, avg paid, avg margin per order, total margin. Directly answers "are we underpricing Priority?" and "what does Free Shipping really cost us?"
4. **Margin by order-value bucket** ($0–25 / 25–50 / 50–75 / 75–100 / 100–150 / 150+ on `subtotal_price`): orders, % free shipping, avg label cost, shipping margin per order. Highlight the detected free-shipping threshold and the bucket straddling it, with the estimated monthly cost of free shipping above it.
5. **Threshold what-if** (v1 keeps it simple): for a proposed threshold $X, show (a) orders that would newly pay shipping and the revenue that adds, (b) orders currently padding carts to reach the threshold (density just below it), with a clearly-labeled assumption note. Skip elasticity modeling in v1 — show the raw distributions and let the numbers argue.
6. **Loss leaders table** — the individual orders where carrier cost most exceeded what was charged (order #, tier, charged, paid, gap). Concrete and persuasive.
7. **Exclusions footnote** — unmatched/POS/digital counts, voided-label handling, carrier-cost-only disclaimer.

---

## 5. Build order & effort

1. ⚑ Migrations A + B (manual, SQL Editor)
2. Extend both Shopify mappers + ShipStation sync (small, mechanical)
3. Re-run both historical backfills over the analysis window (existing UI controls on the Integrations page)
4. Fix stale join docs (029 comment + AGENTS.md)
5. Spot-check 10–15 matched orders against ShipStation + Shopify admin before showing Kate anything
6. Build route + page from the KLL template

Rough size: the sync/migration work is a day-scale change; the report itself is comparable to the KLL report build. The only genuinely new logic is the bucket/threshold analysis — everything else is established patterns in this codebase.
