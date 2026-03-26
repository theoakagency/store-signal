@AGENTS.md

---

# Store Signal — Project Reference

**Stack:** Next.js 16 · React 19 · TypeScript · Tailwind 4 · Supabase · Vercel · Anthropic SDK
**Client:** LashBox LA (single-tenant; TENANT_ID and STORE_ID are hardcoded UUIDs throughout)
**Purpose:** Unified analytics + AI intelligence dashboard aggregating Shopify, subscriptions, loyalty, email, ads, and SEO data.

---

## Architecture

### Data flow
1. **Cron jobs** pull from external APIs → write to Supabase tables
2. **Derived builds** (profiles, analysis, scores) run nightly and read from raw tables → write to cache tables
3. **Dashboard pages** read from cache tables only — no live API calls at render time
4. **AI insights** are user-triggered only (no generative AI in cron jobs)

### Key conventions
- **Two Supabase clients:** `createSupabaseServerClient()` (user-scoped, for auth checks) and `createSupabaseServiceClient()` (privileged, for all writes). Never use the server client for bulk writes.
- **Cron auth:** All cron routes verify `Authorization: Bearer $CRON_SECRET` via `verifyCronAuth()` from `@/lib/cronAuth`.
- **Pagination:** PostgREST defaults to 1000 rows max. All queries over raw tables (orders, subscriptions, etc.) must paginate with `.range(from, from + PAGE - 1)`.
- **No AI in crons:** Insights endpoints are POST-only, user-triggered. Cron routes must include `// NO AI CALLS` comment.
- **Cron logging:** Every cron job inserts a `cron_logs` row with `status: 'running'` at start, then updates with `status`, `completed_at`, `records_synced`, `errors[]` on completion.

---

## Integrations

| Platform | Columns in `stores` | Cron | What's synced |
|---|---|---|---|
| Shopify | `shopify_domain`, `shopify_access_token` | Every 2h | Orders, customers, products |
| Klaviyo | `klaviyo_api_key`, `klaviyo_account_id` | Every 6h | Campaigns, flows, metrics |
| Meta Ads | `meta_access_token`, `meta_ad_account_id` | Every 6h | Campaigns, spend, ROAS |
| Google Ads | `google_ads_refresh_token`, `google_ads_developer_token`, `google_ads_customer_id` | Every 6h | Campaigns, spend, conversions |
| Google Analytics (GA4) | `ga4_refresh_token`, `ga4_property_id` | Every 6h | Sessions, channels, ecommerce |
| Recharge | `recharge_api_token` | Every 6h | Subscriptions, MRR, churn |
| LoyaltyLion | `loyaltylion_token`, `loyaltylion_secret` | Every 6h | Members, tiers, points, rewards |
| Google Search Console | `gsc_refresh_token`, `gsc_property_url` | Daily 4:30am | Keywords, pages, monthly clicks |
| SEMrush | `semrush_api_key`, `semrush_domain` | Daily 4am | Keywords, rankings, authority score |

---

## Cron Schedule

| Job | Schedule | Does |
|---|---|---|
| `sync-shopify` | `0 */2 * * *` | Incremental order/customer sync; skips if <100 new orders + <4h since last |
| `sync-klaviyo` | `0 */6 * * *` | Campaigns, flows, open/click rates |
| `sync-ads` | `30 */6 * * *` | Meta + Google Ads in parallel |
| `sync-analytics` | `0 */6 * * *` | GA4 sessions, channels, ecommerce |
| `sync-recharge` | `30 */6 * * *` | Subscriptions (active + cancelled) |
| `sync-loyalty` | `0 */6 * * *` | LoyaltyLion customers, rewards, campaigns |
| `daily-rebuild` | `0 3 * * *` | Customer profiles (all batches) + agent context cache |
| `sync-search` | `0 4 * * *` | SEMrush (skips if run <20h ago — API unit cost protection) |
| `sync-gsc` | `30 4 * * *` | Google Search Console keywords + pages |
| `daily-analysis` | `0 5 * * *` | Metrics refresh + analytics overview scores + product analysis |

---

## Dashboard Pages

| Page | Route | Data source |
|---|---|---|
| Executive Summary | `/dashboard` | `metrics_cache`, `sales_channel_cache`, AI insights |
| Chat | `/dashboard/chat` | `conversations`, `messages`, `agent_context_cache` |
| Shopify | `/dashboard/shopify` | `orders`, `customers`, `metrics_cache` |
| Subscriptions | `/dashboard/subscriptions` | `recharge_subscriptions`, `recharge_metrics_cache` |
| Loyalty | `/dashboard/loyalty` | `loyalty_metrics_cache` |
| Klaviyo | `/dashboard/klaviyo` | `klaviyo_campaigns`, `klaviyo_flows`, `klaviyo_metrics_cache` |
| Advertising | `/dashboard/advertising` | `meta_metrics_cache`, `google_ads_*` |
| Meta Ads | `/dashboard/meta` | `meta_campaigns` |
| Google Ads | `/dashboard/google-ads` | `google_ads_campaigns` |
| Analytics | `/dashboard/analytics` | `analytics_sessions`, `analytics_metrics_cache` |
| Analytics Overview | `/dashboard/analytics-overview` | `analytics_overview_cache` |
| Search (GSC+SEMrush) | `/dashboard/search` | `gsc_keywords`, `gsc_pages`, `semrush_metrics_cache` |
| SEMrush | `/dashboard/semrush` | `semrush_keywords`, `semrush_keyword_gaps` |
| Product Intelligence | `/dashboard/products` | `product_stats`, `product_affinities`, `purchase_sequences` |
| Customer Intelligence | `/dashboard/customers` | `customer_profiles`, `customer_overlap_cache` |
| Promotions | `/dashboard/promotions` | `promotions`, AI scorer |
| Integrations | `/dashboard/integrations` | `stores`, `cron_logs` |

---

## Migrations Applied (22 total)

```
001 — Core schema (tenants, stores, orders, customers, promotions)
002 — shopify_access_token column
003 — Sync infrastructure + sync_logs
004 — Klaviyo tables (campaigns, flows, metrics_cache)
005 — GSC tables (keywords, pages, monthly_clicks, insights_cache)
006 — SMS campaigns
007 — GSC insights cache
008 — Sales channel cache
009 — Ads tables (Meta, Google Ads campaigns/adsets/ads)
010 — Executive insights cache
011 — Fix Google Ads customer_id column type
012 — Analytics tables (GA4 channels, pages, ecommerce, monthly)
013 — Chat agent (conversations, messages, agent_context_cache)
014 — Recharge + LoyaltyLion tables
015 — RPC functions (get_monthly_revenue, count_distinct_customer_emails)
016 — LoyaltyLion audit tables
017 — SEMrush tables (keywords, keyword_gaps, metrics_cache)
018 — Product + customer intelligence (customer_profiles, product_stats, product_affinities, purchase_sequences, customer_overlap_cache)
019 — Analytics overview cache (traffic_health_score, organic_visibility_score)
020 — cron_logs table
021 — Loyalty program completion (rewards_catalog column, tier data)
022 — Customer stats cache (segment_counts, ltv_stats columns on customer_overlap_cache)
```

---

## Known Issues & Needs Testing

### Data accuracy
- **LoyaltyLion enrolled count is ~20,000 but real count is 56,824+.** The LL API appears to return only recently-active members server-side regardless of our pagination settings. This is an upstream API limitation — not fixable without a different LL endpoint or webhook feed. Redemption rates and tier LTV figures derived from this subset may be understated.
- **Customer segment pills (VIP/Active/At Risk/Lapsed/New) show 0** until "Build Profiles" is run after migration 022. The `segment_counts` and `ltv_stats` columns in `customer_overlap_cache` are populated by `runProfileBatch()` on the final batch. Run "Build Profiles" manually once to prime the cache; nightly `daily-rebuild` will keep it fresh after that.
- **LTV for loyalty tiers (Icon/Empire) shows $0** — just fixed in `lib/syncLoyalty.ts`. These are B2B/salon customers who use guest checkout and don't have Shopify customer accounts. The sync now sums from the `orders` table directly. Re-run the LoyaltyLion sync to see updated values.
- **Sales channel breakdown was capped at 1000 orders** — fixed in `app/api/metrics/refresh/route.ts` (all order queries now paginate). Run "Recalculate" on the exec summary to refresh channel data with the full order set.

### Integrations
- **Meta Ads token expiry:** When the Meta access token expires, the API returns an HTML error page. The sync now surfaces a clean error message, but there is no automated token refresh or re-auth prompt. The user must manually disconnect and reconnect Meta in Integrations when this happens.
- **SEMrush API units:** The account ran out of API units (error 403/132). This is a billing issue on the SEMrush account — not a code problem. The cron will resume once units are topped up.
- **Google Analytics and Google Ads use separate OAuth flows** (different scopes) even though they're both Google. A user could accidentally connect one expecting the other.

### Product Intelligence
- **`first_purchase_leads_to_second`** column in `product_stats` is currently a duplicate of `repeat_purchase_rate`. It was intended to be a more specific metric (% of first-time buyers who return specifically for this product as their second order) — not yet implemented distinctly.
- **Affinity minimum threshold is hardcoded at 5 co-purchases** and sequence threshold at 3. For smaller stores these may be too high; for large stores they may be too low. Consider making configurable.

### Customer Profiles
- **Profile rebuild takes 5–8 minutes** for ~40k customers due to sequential batch processing within the 300s Vercel limit. If the customer base grows significantly, the daily-rebuild cron may start timing out. Consider splitting into multiple cron jobs or using Supabase background jobs.
- **`predicted_next_order_date`** is computed from average days between orders. For customers with highly irregular purchase intervals this will be inaccurate. No confidence interval is stored.

### AI Chat Agent
- **Context is rebuilt per-session, not per-message.** The agent context cache (`agent_context_cache`) is rebuilt nightly — the AI agent will not reflect same-day data changes until the next rebuild. The "Rebuild Context" button on the exec summary forces a refresh.
- **Tool execution is sequential.** If the agent invokes multiple tools in one response, they run one at a time. Parallel tool execution is not implemented.

---

## Roadmap

### High priority
- **Shopify webhook support** — Replace polling with webhooks for `orders/create` and `orders/paid` to get real-time order data rather than waiting up to 2 hours for the next cron. Would eliminate the need for the cost-protection skip logic.
- **Token expiry alerts** — Detect when OAuth tokens (Meta, Google, GSC) are within 7 days of expiry or have already failed, and surface a prominent warning on the Integrations page + email notification. Currently failures are only visible in the sync history.
- **Multi-store / multi-tenant UI** — The data model supports multiple tenants (`user_tenants` table) but the dashboard has hardcoded `TENANT_ID` and `STORE_ID` UUIDs everywhere. Removing these hardcodes and adding store switching would make the app usable as a true SaaS product.
- **LoyaltyLion full member fetch** — Investigate whether LL has a bulk export endpoint, webhook, or a way to fetch all 56,824+ members (not just recently-active ones). The current 20,000-cap understates the loyalty program.

### Medium priority
- **Klaviyo segment push** — After identifying high-value segments in Customer Intelligence (e.g. "high repeat + no subscription"), automatically create or sync a Klaviyo list/segment for targeted email campaigns.
- **Refund and return rate tracking** — Shopify sync captures `financial_status` but refunded orders are not currently broken out as a separate metric. Net revenue (gross minus refunds) is not shown.
- **Cohort analysis** — Group customers by first-purchase month and track retention, LTV, and churn rate per cohort. The data exists in `customer_profiles` (`first_order_at`); just needs the analysis layer.
- **Subscription win-back scoring** — Identify churned subscribers (status = cancelled) who are still buying one-time and score them for re-subscription likelihood based on purchase cadence.
- **Product analysis scheduled trigger** — Product analysis (`/api/products/analyze`) reads all 115k+ orders on every run (2–3 min). Currently runs daily at 5am. Consider caching intermediate data (per-product customer maps) to speed up incremental runs.
- **Google Ads + GA4 attribution join** — Connect Google Ads spend data with GA4 conversion data by campaign/channel for a true ROAS view that accounts for attribution differences between platforms.

### Lower priority / nice-to-have
- **CSV/PDF export** — Allow exporting customer segments, product performance tables, and channel breakdowns as downloadable files.
- **Email digest** — Weekly automated email (or Slack message) summarizing top metrics, any sync failures, and AI-identified alerts without logging into the dashboard.
- **Promotional calendar** — A calendar view overlaying promotion dates, Klaviyo campaign sends, and revenue spikes to visually correlate marketing activity with revenue impact.
- **Abandoned cart analysis** — Shopify has checkout abandonment data via the abandoned_checkouts endpoint; this is not currently synced or analyzed.
- **Mobile-optimized views** — The dashboard is desktop-first. Tables are horizontally scrollable on mobile but several components (Venn diagram, product affinity charts) do not adapt well to small screens.
- **Dark mode** — The design system uses CSS variables that could support dark mode with a theme toggle.
- **Competitive benchmarking** — Use SEMrush competitor data (already synced to `semrush_keyword_gaps`) to build a structured competitor tracking view comparing keyword overlap and traffic share over time.

---

## Environment Variables Required

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
CRON_SECRET
ANTHROPIC_API_KEY
SHOPIFY_RETAIL_STORE          # e.g. lashboxla.myshopify.com
SHOPIFY_SYNC_MONTHS_BACK      # default 12
SYNC_ENABLED                  # set to "false" to pause all cron jobs
```

All third-party API keys (Klaviyo, Recharge, LoyaltyLion, SEMrush, Meta, Google) are stored per-store in the `stores` table and never in environment variables.
