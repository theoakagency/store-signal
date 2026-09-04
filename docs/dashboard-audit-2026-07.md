# Store Signal Dashboard Audit — July 2026

Full-code audit of every `/dashboard` page, every metric, and every integration sync path. All findings verified against the working tree (file:line citations throughout). Companion doc: `docs/shipping-margin-report-spec.md` (separate deliverable).

---

## 1. The ten findings that matter most

1. **Refunds and cancellations never reach the database.** The incremental Shopify sync filters on `created_at_min`, not `updated_at_min` (`lib/syncShopify.ts:79`, `app/api/cron/sync-shopify/route.ts:58-62`). An order refunded after its first sync keeps `financial_status = 'paid'` forever. Every revenue figure in the app is overstated by post-sync refunds; the Refunds panel chronically shows ~$0 (and hides itself when 0, `ShopifyDashboard.tsx:469`); **the KLL royalty report pays royalties on refunded orders**. This is the single most important fix.

2. **The headline numbers Kate sees first are silently truncated at 1,000 orders.** The exec summary's 30d/7d revenue, orders, and AOV are recomputed live with unpaginated queries (`app/dashboard/page.tsx:410-413`; same on `shopify/page.tsx:30-32` and `app/api/insights/shopify/route.ts:30-31`). PostgREST caps at 1,000 rows; LashBox does ~4,500+ orders/30d. A *correct*, paginated version of the same numbers already exists in `metrics_cache` (built by `app/api/metrics/refresh`) — the page just doesn't read it. The truncated `revDelta` also feeds the Business Health Score and the revenue alerts.

3. **The AI chat agent's numbers are structurally wrong twice over.** (a) `lib/agentTools.ts` contains zero `.range()` calls — every raw-table tool (revenue summary, order trends, segments) is capped at 1,000 rows. `lib/buildAgentContext.ts:23-24` has the same bug, so the system-prompt snapshot's `revenue_30d` is computed from an arbitrary 1,000-order slice. (b) The whole AI stack windows on `orders.created_at` — which is **DB-insert time, not order date**, because `mapOrder()` never maps Shopify's `created_at` (`lib/syncShopify.ts:149-187`) and the column defaults to `now()`. After any backfill, "revenue last 30 days" from chat includes the entire backfilled history. Dashboard pages correctly use `processed_at`; chat and dashboard will confidently disagree.

4. **An expired Meta token is invisible.** The shared ads cron logs `'failed'` only if *both* platforms error (`app/api/cron/sync-ads/route.ts:70`), so a Meta-only failure logs "completed", the Integrations token-expired banner (which requires `status === 'failed'`, `app/dashboard/integrations/page.tsx:29-35`) never trips, and the Meta pages silently freeze on the last good 90d snapshot under a green Connected badge.

5. **Google Ads will break differently the day the developer token is approved.** Current state (test mode): the GA4 fallback only triggers on the literal string `'501'` in the error (`lib/syncGoogleAds.ts:65-70`) — an unapproved-token 403 doesn't match, so the sync throws, the cron still logs "completed" (see #4), and the page shows **$0 spend / 0x ROAS as if it were data**, under a green Connected badge. Latent bugs waiting for approval: (a) the GAQL row types expect snake_case but the REST API returns camelCase (`lib/googleAds.ts:63-83`) — every multi-word metric (`costMicros`, `conversionsValue`) will parse as `undefined → 0`, producing campaigns with real clicks but $0 spend; (b) old `ga4_*` fallback rows are never deleted, and the page renders in fallback mode if *any* row has `data_source='ga4'` (`app/dashboard/google-ads/page.tsx:21`) — the page will stay stuck in "pending approval" mode after approval; (c) the sync ignores `stores.google_ads_customer_id` in favor of a hardcoded `'9145748200'` (`lib/syncGoogleAds.ts:7`) while the Integrations UI displays the stored one.

6. **Klaviyo's sync fabricates its economics.** Unpaginated all-time `orders`/`customers` queries (`lib/syncKlaviyo.ts:80-84, 160-161`, duplicated in the separate manual route `app/api/klaviyo/sync/route.ts:129-133, 238-243`) mean avg LTV, "Est. Unsubscribe Cost," "SMS Opt-out Cost," and `email_revenue_vs_total` are computed from ≤1,000 arbitrary rows — and the bogus email-share ratio is fed verbatim to the Claude insights prompt (`app/api/klaviyo/insights/route.ts:75`). Separately: "Total Email Revenue" includes SMS (`lib/syncKlaviyo.ts:58,90`); multi-channel flows are counted in both the email and SMS buckets (`:153-156`); "Est. Cost" is recipients × a hardcoded $0.002 applied identically to email and SMS (`KlaviyoDashboard.tsx:118,533`) and drives Net ROI columns and Good/Negative badges; campaign/flow stats failures are swallowed (`lib/klaviyo.ts:396-398`) and overwrite good rows with zeros, which the page filter then hides entirely.

7. **The "Adhesive Subscription Opportunity" panel is permanently zero — a real opportunity shown as nonexistent.** `lib/syncRecharge.ts:211-215` queries an `order_line_items` table that does not exist in any migration (AGENTS.md is wrong about migration 001), and even if it did, `:224` builds subscriber emails from `s.customer?.email`, which the code's own comment says is always null. The panel renders unconditionally with 0 customers / 0.0% / $0, and those zeros are served to the AI as fact (`lib/agentTools.ts:853-854`). Its "See these customers" link also points to a segment value the customers page doesn't support.

8. **Two LoyaltyLion metrics are mislabeled lifetime numbers.** "Points Flow — Last 30 Days" sums lifetime balances of members *enrolled* in the last 30 days, not program-wide 30d flow (`lib/syncLoyalty.ts:100-108`); "Active Redeemers (30d)" is anyone who *ever* redeemed (`:109`). Both drive alerts (low-redemption callout, win-back panel). Separately, the ~20k API subset makes the customer Venn's loyalty intersections wrong with no panel-level caveat, and the banner's "understated" framing is backwards for rate metrics (the subset is recently-active-biased, so rates are *overstated*).

9. **SEMrush is broken and mostly vanity.** Gained/lost keyword counters have a sign inversion making "lost" structurally always 0 (`lib/syncSEMrush.ts:118-119`); API filters are double-URL-encoded so they never apply (`lib/semrush.ts:178,223` + `:28,46`); keyword rows keyed `${keyword}_${i}` accumulate stale duplicates forever (`lib/syncSEMrush.ts:21`); Analytics Overview reads a column that doesn't exist (`organic_traffic_monthly` vs actual `organic_traffic_estimate`) so "Monthly Organic Traffic" is always 0 (`AnalyticsOverviewDashboard.tsx:416` vs `lib/syncSEMrush.ts:124`). The account has zero API units anyway. Only the competitor gap table is differentiated value. **Recommendation: remove from the dashboard** (park the tables; nothing else depends on them except the Search page's optional enrichment columns).

10. **Stale-row accumulation is systemic.** `meta_campaigns`, `gsc_keywords`, `gsc_pages`, `analytics_pages`, `analytics_campaigns`, `semrush_keywords`, `google_campaigns`, and `sales_channel_cache` are all upsert-only with no pruning and no read-time window filter. Items that fall out of the current window keep their last-known numbers forever, so "top N" panels silently mix data from different 90-day windows. Meta's "Ad Spend (90d)" can include spend from an older window via campaigns with no current delivery (`lib/syncMeta.ts:37`, skip logic `lib/meta.ts:166-168`).

---

## 2. Cross-cutting problems

### 2.1 Two revenue definitions, one word
Dashboard pages window on `processed_at` (correct); the AI stack windows on `created_at` (= sync time, see #3). Additionally `count_distinct_customer_emails` (migration 015) counts unpaid orders and is case-sensitive — a different population than every revenue metric. The chat agent's segment tool (`lib/agentTools.ts:190-237`) uses completely different VIP/New definitions than `buildProfiles` — same words, different numbers.

### 2.2 Gross vs net, everywhere
All "revenue" = sum of full original `total_price` (includes tax + shipping charged) of orders whose *stored* status is `'paid'`. Refunds never subtracted (see #1); `partially_refunded` orders vanish from both revenue and refunds. Not wrong to show gross — wrong to show it unlabeled. Shopify Analytics "Net sales" will never reconcile with these numbers.

### 2.3 Timezone
Every window boundary is UTC (`new Date()`, `date_trunc` in UTC), while Shopify/LashBox report in America/Los_Angeles. Orders placed 4–5pm PT on the last day of a month land in the next month vs Shopify's own reports. Systematic small drift, worst at month boundaries and for the KLL monthly report.

### 2.4 Invented economics presented as data
- Klaviyo $0.002/recipient cost → Net ROI columns + badges (`KlaviyoDashboard.tsx:118,533`)
- Subscriptions 20%-conversion MRR projection (`SubscriptionsDashboard.tsx:471`)
- GSC 11%-CTR-at-position-3 gain model — at least disclosed, but overstated ~3x because it applies 90-day impressions to a "clicks/mo" label (`SearchDashboard.tsx:132-138,695`)

### 2.5 Composite scores are arbitrary and inconsistent
Business Health Score: hardcoded weights (25/20/15/15/15/10), four-step scoring, **absolute MRR** as "health" (a small healthy program scores 0.15 forever), a fabricated 0.25 retention default when profiles are empty, mixed time horizons (30d revenue vs 12mo email vs snapshot authority), and a Recalculate button that doesn't refresh the displayed ring (`BusinessHealthScore.tsx:86-94`). The Search page has a *second* composite with different weights (30/25/25/20). Two scoring philosophies, both presenting as measurements.

### 2.6 Fake zeros and silent staleness
- Segment pills / LTV cards show 0 until Build Profiles runs (known, still live)
- Analytics Overview renders 0/100 **red** score rings when the cache is simply empty (`AnalyticsOverviewDashboard.tsx:348,353`)
- GA4 KPI helper defaults missing metrics to 0 / 0.00% (`AnalyticsDashboard.tsx:326`)
- Connection status = token-column-is-not-null, nothing else (`app/api/sync/status/route.ts:93-103`). No page shows a data-freshness timestamp except Subscriptions; a dead token shows old cache indefinitely. The data exists in `cron_logs` — it's just not surfaced next to the numbers.
- The chat UI never shows the context snapshot's build date (model knows it; user doesn't).
- `metrics/refresh` overwrites `customer_count` with **0** whenever the `count_distinct_customer_emails` RPC errors or times out — it does `Number(distinctEmailCount ?? 0)` with no guard (`app/api/metrics/refresh/route.ts:102`, written at `:120`), rather than preserving the prior cached value. Observed live 2026-07-09: a slow ~38s run wrote 0 while the RPC (which returns 46,612 on its own) timed out; the next ~16s run wrote the correct value. So if the 5am `daily-analysis` cron ever hits this, the exec-summary customer count silently drops to 0 until the next successful run. **Follow-up:** guard against writing 0 on RPC failure (preserve prior value or retry). Surfaced while fixing the `.range()` pagination stable-sort sweep (PR #4); intentionally left as a separate fix.

### 2.7 Caveats live in three hand-maintained copies
Integrations "Data Notes" collapsible, Data Audit `KNOWN_DISCREPANCIES` (hardcoded in `page.tsx:26-90`), and the Loyalty banner — including the LL member counts (56,824/49k/…) baked into UI copy in three places. One registry, referenced everywhere, is the fix.

### 2.8 Discount codes (LL- / DT-)
Discount-code awareness exists **only** in the KLL royalty report + its allowlist admin. That's internally fine — all dashboard "revenue" is `total_price`, which is already post-discount — but note two things: (a) **there is no LL- rule in the allowlist** (seed has only `DT` prefix + WELCOME15/20 + LASHBOXJENNA, `031_allowed_discount_codes.sql:35-41`). If LoyaltyLion cash should count as a deductible discount for KLL, it must be added, and today an LL- code stacked with a DT- code zeroes the *entire line's* discount via the strict every-code-must-match rule (`kll-royalty/route.ts:101-107`) — overstating the royalty owed. (b) Orders synced before migration 030 have empty `discount_codes`, so pre-030 months overstate royalties unless the window was re-backfilled. Also hardcoded in the KLL route: royalty rate, 16 target SKUs, GWP costs matched by *product title substring* (a rename silently changes the royalty), and shipping split evenly per line rather than by value.

---

## 3. Integration-by-integration findings

### Shopify — mostly right where it uses the cache, wrong where it goes live
- **Accurate:** `metrics/refresh` (paginated, consistent), `get_monthly_revenue` RPC, upsert on `(store_id, shopify_order_id)` prevents double-counting, `processed_at` used by all dashboard pages, `financial_status='paid'` applied at every sum site.
- **Broken:** refund/cancel staleness (#1); live-query truncation (#2); `created_at` = sync time (#3); customers sync capped at 2,500/run (`lib/syncShopify.ts:104,112`) so `customers.total_spent`-based panels (Top Customers, New-vs-Returning heuristic) go stale; the Shopify page's New Customers / Returning Rate is computed against only the top-200 customers fetched (`shopify/page.tsx:56-60`) — methodologically silent and wrong.
- **Not captured (schema gaps):** shipping charged (`total_shipping_price_set`/`shipping_lines` — arrives in every payload, thrown away), refund amounts, `cancelled_at`, `test` flag. First two block the shipping report and net revenue.
- **Three near-identical copies of the order mapper** (`lib/syncShopify.ts:149`, `app/api/shopify/sync/route.ts`, `.../historical/route.ts`) — drift risk; consolidate.
- Data window: UI claims 24 months (`DataCoverageBar` `rollingRange(730)`), env default is `SHOPIFY_SYNC_MONTHS_BACK=12`. Actual DB coverage = whatever backfills ran. Verify with a query and make the label read from data, not a constant.

### Klaviyo
See #6. Also: stats window is 12 months (code comment claims 2 years — comment wrong, `lib/klaviyo.ts:466`); flows use the same 12-month window while the coverage bar says "All time" (label wrong); attributed revenue is reconstructed as `revenue_per_recipient × delivered` (rounding error; request the revenue statistic directly); `avg_campaign_open_rate` is an unweighted mean across campaigns (a 500-recipient test counts like a 40k blast); attribution window (Klaviyo's ~5-day click+open) is never stated anywhere while sitting near GA4 last-click numbers; two separate sync implementations (cron uses `lib/syncKlaviyo.ts`, manual button uses a duplicated `app/api/klaviyo/sync/route.ts`); the dashboard auto-fires an AI insights call on page load (`KlaviyoDashboard.tsx:246-250`), against the user-triggered-only convention.

### GA4
- Correct: 90d windows match labels; AOV/CVR guarded; "Revenue (GA4)" labeled "GA4-attributed" (best labeling in the app).
- Wrong: **two conversion definitions on one page** — Channel Efficiency uses GA4 `conversions` (= all key events, could include add-to-cart) against thresholds that assume purchase CVR, while the KPI uses `ecommercePurchases/sessions` (`lib/analytics.ts:110,144` vs `:219`). A channel firing non-purchase key events looks artificially healthy. Also `conversions` is deprecated (→ `keyEvents`).
- "Sessions (90d)" card glues a month-over-month delta (with a partial current month) onto a 90-day metric (`AnalyticsDashboard.tsx:331-334,381`) — reads as fake declines early in a month.
- Stale-row accumulation in `analytics_pages`/`analytics_campaigns` (#10); Google-Ads-via-GA4 fetch failures silently swallowed (`lib/syncAnalytics.ts:14`).

### Google Search Console
- Correct: sync windows (90d ending yesterday, prior-90d, 12mo daily→monthly), CTR fraction convention, property resolution fallback.
- Wrong: "Clicks (90 days)" actually sums the last 3 *calendar months* including a partial current month (`SearchDashboard.tsx:313-316`) — biased negative early in a month, and the vs-prior delta inherits it; Avg CTR is an unweighted mean over the top-50 keywords only; "Potential Gain clicks/mo" ~3x overstated (90d impressions, monthly label); stale keyword/page rows (#10); branded terms hardcoded `['lashbox','lash box','lbla','lash box la']` (`:339`); Search Health Score arbitrary (#2.5). Only *AI insight* freshness is shown, never data freshness.

### Meta Ads
- The best-labeled page in the app (90d labels, honest amber "no spend in last 30 days" banner).
- Issues: token-expiry invisibility chain (#4); stale-window contamination of the 90d sums (#10 — `date_start`/`date_stop` are stored; filter on them at read time); attribution window (7d-click/1d-view) never stated while compared against GA4 last-click on the Advertising page; the expired-banner regex `/expired|token|non-json|html/i` can fire "Meta token expired" off a *Google* error containing "token".

### Google Ads
See #5. Additionally, in GA4-fallback mode the "Clicks" column is actually GA4 *sessions* (`lib/syncGoogleAds.ts:34`) and "Conversions" are GA4 key events — both mislabeled. The micros→dollars conversion itself is correct where it applies. The Advertising page's blended ROAS in fallback mode adds GA4 Google revenue to the numerator with only Meta spend in the denominator (`AdvertisingOverview.tsx:165-168`) — disclosed in a sub-label but the headline number is strictly inflated; should render "—" or Meta-only.

### Recharge
- MRR normalization in the sync is **correct** (handles every-2-months, quantities, week/day intervals; `lib/recharge.ts:161-180`). Churn is a legitimate 30d definition, labeled. Subscriber-vs-one-time LTV comparison is sound (paginated, lowercased emails).
- Bugs: adhesive panel permanently zero (#7); `lib/buildProfiles.ts:60-66` computes a *different, wrong* per-customer MRR (ignores `charge_interval_frequency` and quantity — a $50/4-week sub shows as ~$217/mo in the customer detail panel) and keeps only one subscription per email; `expired` subs never fetched (churn understated); `avg_subscription_value` is per-charge but labeled "/mo"; the coverage bar advertises "12m charges" but `getCharges()` is dead code — charges are never synced.
- **Oct 14, 2026 migration blast radius** (Recharge → Shopify Checkout): the entire Subscriptions page, `recharge_subscriptions` + `recharge_metrics_cache`, subscriber flags in `customer_profiles` (and therefore the Venn's Subscribers circle), product `subscription_conversion_rate`/`is_subscribable`, the exec MRR tile + health-score component, `get_subscription_data` agent tool, the subscriptions insight route, the promotions scorer input, and the LBLA content-ideas routes. **Key structural risk:** `recharge_metrics_cache` is an upsert-only singleton with no TTL — when the sync stops, every consumer silently serves the last snapshot forever, presented as "current state." Shopify Checkout subscriptions arrive as normal Shopify orders (so `orders`-based revenue survives), but nothing reads Shopify `subscription_contracts` — `is_subscriber`, MRR, churn, intervals, cohorts all need a new source. Do not build anything new on Recharge tables.

### LoyaltyLion
See #8. Tier-LTV-from-orders approach is correct (paginated, lowercased, captures B2B guest checkout) but is gross revenue over the synced window, while the AI loyalty prompt mislabels it "last 12 months." Campaign-lift analysis has baked-in selection bias (participants are defined by point-earning activity, which usually requires purchasing — positive lift is near-guaranteed) with verdict thresholds that don't account for it. The subset banner is the best honesty surface in the app but is directionally wrong for rate metrics and hardcodes member counts that will rot.

### Customer Intelligence
- Email joins are correctly case-normalized everywhere (verified). The Venn's loyalty regions are still wrong due to the LL subset (#8), with no panel-level caveat, and overlap only covers emails with ≥1 paid order in the window (members/subscribers who never ordered are invisible).
- The "New" segment is **unreachable** (requires `totalOrders === 0`, but profiles are built exclusively from order emails, `lib/buildProfiles.ts:165-169`) — the New pill is permanently 0. VIP is recency-blind (a big spender from 2 years ago is VIP forever, never lapsed). Thresholds (90/180 days, p50/75/90/95) hardcoded.
- `predicted_next_order_date` fires "Overdue" from as little as a single gap between 2 orders — noisy, no confidence.
- The page **defaults to the `sub_vip` Venn filter**, so the first view is not "all customers."

### Product Intelligence
- Affinity math (lift/confidence) verified correct; thresholds hardcoded (5 co-purchases / 3 sequences / lift ≥2 & ≥10 for bundle cards).
- **`first_purchase_leads_to_second` is now implemented distinctly** (`app/api/products/analyze/route.ts:189-209`) — CLAUDE.md/AGENTS.md known-issue entries are stale.
- Real bug: unpaginated `recharge_subscriptions` read (`:45-48`) → subscription conversion rates computed from ≤1,000 subs → the "Subscription Opportunities" panel over-recommends products that already convert.
- Purchase sequences represent each order by its *first line item* — arbitrary in Shopify — and rank by survivorship-biased LTV. Treat as noise; lowest-value tab on the page.

### SEMrush — see #9. Recommend removal.

### ShipStation
Covered in `docs/shipping-margin-report-spec.md`. Summary: the `external_shipment_id` first-segment join is already implemented (commit `2149928`) — the migration comment and AGENTS.md still describe the old `external_order_id` join (docs drift). Voided labels are not filtered (double-counts cost on reprints); insurance cost not captured; `sync-shipstation` is missing from the sync-status dropdown's cron map (`app/api/sync/status/route.ts:12-23`), so it's invisible there.

### Slack
No role in Store Signal. The only reference is a "coming soon" card (`IntegrationsClient.tsx:1836`) and two roadmap mentions. Nothing to audit; nothing to remove except keeping the card honest.

---

## 4. Data-window truth table

| Source | You believed | Actual query window | UI label | Verdict |
|---|---|---|---|---|
| Shopify | ~24mo | Whatever was backfilled; env default 12mo | "Rolling 730d" | Verify DB coverage; make label data-driven |
| Klaviyo campaigns | ~12mo | 12mo (code comment falsely says 2yr) | "last 12 months" | OK |
| Klaviyo flows | — | 12mo | "All time (cumulative)" | **Label wrong** |
| Meta | ~90d | 90d, but stale-window rows contaminate sums | 90d | Fix read-time filter |
| GA4 | ~90d | 90d | 90d | OK (fix MoM sub-label) |
| GSC | ~90d | 90d synced; KPI shows last-3-calendar-months incl. partial | "90 days" | **Label wrong** |
| Recharge | ~12mo | Current state only; charges never synced | "Current state + 12m charges" | **Label wrong** |
| LoyaltyLion | ~20k subset | ~20k subset | Banner + coverage bar | OK (fix "understated" direction) |
| Google Ads | test mode | Nothing real synced | Green "Connected" | **Misleading** |

---

## 5. Cut list (dead weight, vanity, or actively misleading)

**Remove now:**
- SEMrush page + Authority Score card + exec SEMrush card (broken sync, zero API units, vanity)
- Business Health Score *in its current form* (see IA below for replacement)
- Search Health Score
- Klaviyo Net ROI / Est. Cost columns and Good/Negative badges ($0.002 fiction); Est. Unsubscribe Cost + SMS Opt-out Cost KPIs (built on truncated LTV)
- Adhesive Opportunity panel (until the data path exists — currently permanent zeros)
- ARR tile (MRR x 12 adds nothing)
- Purchase Sequences tab (first-line-item artifact + survivorship ranking)
- Loyalty Top Redeemers list (vanity)
- Impressions KPI cards everywhere (keep impressions inside tables for CTR context)
- Analytics Overview page (its unique content is two arbitrary score rings and a broken SEMrush column; fold anything left into Analytics)
- Ahrefs teaser line; "Wholesale (Soon)" nav item; empty stub dirs (`ad-spend/`, `inventory/`, `reports/`, `staff/`)
- Exec summary cards for disconnected/parked platforms (Google Ads until approved; SEMrush)

**Keep but fix/relabel:** everything in sections 1–3.

---

## 6. Proposed dashboard structure

Organizing principle: each section answers one business question a decision gets made from, in funnel order. Every panel shows (a) its time window inline, (b) a freshness stamp from `cron_logs`, (c) which source's definition of revenue/attribution it uses.

### Nav (proposed)
1. **Home** (exec summary, rebuilt)
2. **Money** — Orders & Revenue (Shopify) · Fulfillment & Shipping (new report)
3. **Acquisition** — Paid Ads (Meta + Google unified) · Organic Search (GSC) · Site Traffic (GA4)
4. **Retention** — Email & SMS (Klaviyo) · Subscriptions · Loyalty · Customers
5. **Products**
6. **Tools** — AI Chat · Promotions · Content Studio
7. **Settings** — Integrations · Data Audit

### Home (what Kate sees, rebuilt)
- **Revenue this month vs last** (from `metrics_cache`, never live queries), orders, AOV, with "Gross sales, before refunds" labeling until net revenue ships — then net.
- **Channel mix** (30d, from `sales_channel_cache`, with Subscriptions broken out as a channel).
- **Five-signal status row** replacing the health score ring: Revenue trend, Ad efficiency (blended ROAS with attribution note), Email revenue/recipient trend, Subscription churn, Repeat-purchase rate — each a plain number + direction arrow + window label. No composite. A composite score built from arbitrary weights answers no question and invites "why did it go down?" conversations you can't answer.
- **Alerts** (kept, thresholds moved to a config table): sync failures surface here too (currently invisible unless you open the Integrations sync history).
- **AI brief** (kept, user-triggered only — remove the auto-generate-on-load).

### Acquisition
- **Paid Ads (one page, two platforms):** spend, ROAS, CPA per platform with per-platform attribution labels; flagged campaigns (<1x); paused-with-spend. Blended ROAS only when both platforms report real spend. Google Ads section shows an explicit "pending API approval" state — not zeros.
- **Organic Search:** clicks/position trend, losing pages, position-4-10 quick wins (fixed gain math). Kill the composite score. Branded-terms list → config.
- **Site Traffic:** GA4 channels with *purchase* CVR (one definition), landing pages (pruned windows).

### Retention
- **Email & SMS:** revenue per recipient (email vs SMS split honestly), flow vs campaign comparison (same window both sides), top flows/campaigns. Attribution window stated once at top of page.
- **Subscriptions:** churn, MRR, cohorts, cancellations (all already decent) — plus a visible "Recharge migration" plan (see roadmap). Remove adhesive panel until rebuilt on `orders.line_items`.
- **Loyalty:** redemption behavior (fixed 30d definitions), campaign lift (with selection-bias caveat), tier LTV. Subset caveat moves onto every affected panel programmatically, from a single caveat registry.
- **Customers:** buyer table + segments (fix "New", make VIP recency-aware), Venn with loyalty-subset caveat on-panel, default view = All.

### Products
Performance table + affinity/bundle cards (kept, they're good), subscription-gap panel (after the pagination fix). Sequences cut.

### Money
- **Orders & Revenue:** current Shopify page minus the broken New/Returning heuristic (compute from `customer_profiles` instead of top-200 customers), plus refunds once captured.
- **Fulfillment & Shipping:** the new margin report (separate spec).

---

## 7. Phased implementation plan

Bias: fix data first (most fixes are invisible to Kate), then trust/labeling, then IA, then new panels. Migrations flagged — run manually in SQL Editor.

### Phase 1 — Make the numbers true (no visible redesign)
1. **Refund correctness** — switch incremental sync to Shopify `updated_at_min`; store `cancelled_at`, `total_refunded`/`current_total_price`, `test` flag; map Shopify's real `created_at` into the row. Exclude cancelled/test orders at every sum site; subtract refunds where "net" is claimed. **⚑ Migration: new columns on `orders`** (`cancelled_at timestamptz`, `total_refunded numeric`, `shopify_created_at timestamptz` or repurpose `created_at`, `test boolean`). Then re-run the historical backfill to repair statuses (existing chunked pattern; upsert repairs in place).
2. **Kill the 1,000-row truncations** — exec summary + Shopify page read `metrics_cache` (already correct) instead of live queries; paginate or RPC-ify: `lib/agentTools.ts` (all tools), `lib/buildAgentContext.ts`, `lib/syncKlaviyo.ts` (+ delete the duplicated manual sync route in favor of the lib), `app/api/metrics/refresh` avgLTV, `app/api/products/analyze` subscriptions read, `app/api/promotions/score`, `app/api/insights/shopify`.
3. **sync-ads status** — `errors.length > 0 → 'failed'` (or a 'partial' status); fix the Meta-expired banner to key off per-platform errors; add `sync-shipstation` to the status route's cron map.
4. **Google Ads pre-approval hardening** — camelCase the REST field accessors; broaden the fallback trigger beyond `'501'`; delete `ga4_*` rows on first real sync; read `stores.google_ads_customer_id`; relabel GA4-fallback "clicks" as sessions. Do this *before* the token is approved.
5. **Recharge/loyalty/profile math** — remove or rebuild adhesive metrics on `orders.line_items` jsonb (no new table needed); fix `buildProfiles` per-customer MRR; fetch `expired` subs; fix loyalty 30d points-flow and active-redeemer definitions; fix the "New" segment or remove the pill.
6. **Stale-row hygiene** — delete-then-insert (or `synced_at`/`date_stop` read filters) for `meta_campaigns`, `gsc_keywords/pages`, `analytics_pages/campaigns`, `google_campaigns`, `sales_channel_cache`.
7. **KLL report integrity** (money leaves the building on this one): decide the LL- allowlist question with Kate/KLL; reconsider strict-AND (per-code matching instead); re-backfill pre-migration-030 months; move royalty rate + SKUs + GWP costs into config (**⚑ Migration: small `report_config` table or extend `allowed_discount_codes` pattern**); exclude refunded orders once #1 lands.

### Phase 2 — Make the numbers trustworthy (labeling & staleness)
1. Per-panel window labels + "Data as of {sync time}" stamps sourced from `cron_logs` (a small shared component; the data already exists).
2. Single caveat registry (one table or one TS module) feeding the Loyalty banner, Data Audit page, Integrations notes, and on-panel footnotes — delete the three hand-maintained copies.
3. Replace fake zeros with explicit empty states ("Not calculated yet — run Build Profiles") for segment pills, LTV cards, score rings, GA4 KPIs.
4. Standardize timezone: compute windows in America/Los_Angeles (store TZ) in the RPCs and window helpers, or keep UTC and label it. Pick one; PT matches how Kate reads Shopify.
5. Remove invented economics or move constants to config with on-screen "assumes X" notes (plain language, no em-dashes in client-facing copy).
6. Remove AI-on-page-load calls (Klaviyo insights); keep AI user-triggered.

### Phase 3 — IA reorg (section 6)
Nav regrouping, Home rebuild (status row replaces health score), page merges (Advertising+Meta+Google Ads → Paid Ads; Analytics Overview folded into Analytics), cut list executed. No migrations needed.

### Phase 4 — New value
1. **Shipping margin report** (separate spec; **⚑ Migrations 032a/032b** flagged there) — highest ROI new build.
2. **Net revenue / refund tracking** on Home + Orders page (unlocked by Phase 1.1).
3. **Recharge → Shopify Checkout migration prep** (before Oct 14, 2026): add TTL/staleness guard on `recharge_metrics_cache` consumers; build a `subscription_contracts` sync following the existing integration pattern; swap `buildProfiles`/Venn/product-analyze reads to the new source. **⚑ Migration: new `shopify_subscription_contracts` table.** The blast-radius table in §3 is the checklist.
4. Token-expiry surfacing on Integrations (roadmap item, now partially unblocked by Phase 1.3).

### Docs drift to fix while in there
- AGENTS.md: `google_campaigns` (not `google_ads_campaigns`); migration 001 does *not* create `order_line_items`; `first_purchase_leads_to_second` is implemented distinctly now; ShipStation join is `external_shipment_id` first-segment (not `external_order_id`) — also fix the comment in `029_shipstation.sql:19`; Klaviyo "2 years" comment in `lib/klaviyo.ts:466`.
