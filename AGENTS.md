# Store Signal — Agent Reference

> This file is the authoritative reference for AI coding assistants working in this repo.
> Keep it updated when adding integrations, pages, routes, migrations, or architectural changes.

---

## Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js (App Router) | 16.2.1 |
| Runtime | React | 19.2.4 |
| Language | TypeScript | ^5 |
| Styling | Tailwind CSS | 4 |
| Database | Supabase (Postgres + Auth + PostgREST) | @supabase/supabase-js ^2.99.3 |
| AI | Anthropic Claude (claude-sonnet-4-6) | @anthropic-ai/sdk ^0.80.0 |
| Deployment | Vercel (serverless, cron jobs) | — |

> **WARNING — This is NOT the Next.js you know.** Version 16 has breaking changes vs. 14/15.
> Read `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

---

## Client & Context

- **Client:** LashBox LA — a professional lash extension supply brand
- **Single-tenant app.** `TENANT_ID` and `STORE_ID` are hardcoded UUIDs throughout the codebase:
  ```
  TENANT_ID = '00000000-0000-0000-0000-000000000001'
  STORE_ID  = '00000000-0000-0000-0000-000000000002'
  ```
  These appear in every route and lib file. Do not replace with dynamic lookups unless explicitly instructed.

---

## Architecture & Data Flow

```
External APIs (Shopify, Meta, Klaviyo, etc.)
        │
        ▼  (cron jobs — every 2–6h or daily)
  Raw Supabase tables (orders, recharge_subscriptions, meta_campaigns, etc.)
        │
        ▼  (nightly derived builds — daily-rebuild @ 3am, daily-analysis @ 5am)
  Cache / derived tables (customer_profiles, product_stats, metrics_cache,
                          customer_overlap_cache, analytics_overview_cache, etc.)
        │
        ▼  (server components at render time — reads cache only)
  Dashboard pages
        │
        ▼  (user-triggered, never in cron)
  AI insight endpoints (Claude generates text from cached data)
```

**Rules:**
1. Dashboard pages read **only from cache/derived tables** — no live API calls at render.
2. Cron jobs write to raw tables; nightly builds produce derived tables.
3. AI (Claude) is **never called from cron jobs**. All insight routes are user-triggered POST endpoints.
4. The service client has write access to all tables. The server client is user-scoped (auth only).

---

## Key Conventions

### Supabase clients
Three factory functions in `lib/supabase.ts`:

| Function | When to use |
|---|---|
| `createSupabaseServerClient()` | Server components and API routes that need to check `auth.getUser()`. Must be `await`-ed. |
| `createSupabaseServiceClient()` | All writes, cron jobs, and privileged reads. Does not check user auth. Never expose to the browser. |
| `createSupabaseBrowserClient()` | Client components that need Supabase (rare — prefer server queries). |

Pattern for auth-gating an API route:
```ts
const supabase = await createSupabaseServerClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
const service = createSupabaseServiceClient()
// use service for all DB operations from here
```

### Cron auth
All cron routes must verify the `CRON_SECRET` bearer token:
```ts
import { verifyCronAuth } from '@/lib/cronAuth'
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request)
  if (authError) return authError
  // ...
}
```
Routes that need to be callable from both user auth and cron (e.g. `metrics/refresh`, `products/analyze`) use an `isCron` bypass:
```ts
const isCron = request.headers.get('Authorization') === `Bearer ${process.env.CRON_SECRET ?? ''}`
if (!user && !isCron) return Response.json({ error: 'Unauthorized' }, { status: 401 })
```

### Pagination — CRITICAL
PostgREST defaults to **1,000 rows max** regardless of table size. Any query against a large table (orders, subscriptions, loyalty_customers, etc.) **must** paginate:
```ts
const PAGE = 1000
let from = 0
while (true) {
  const { data } = await service
    .from('orders')
    .select('email, total_price')
    .eq('store_id', STORE_ID)
    .range(from, from + PAGE - 1)
  if (!data || data.length === 0) break
  rows.push(...data)
  if (data.length < PAGE) break
  from += PAGE
}
```
For aggregate queries on huge tables, use RPC functions (e.g. `get_monthly_revenue`, `count_distinct_customer_emails`) defined in migration 015.

### Cron logging
Every cron route follows this pattern:
```ts
// Log start
const { data: log } = await service
  .from('cron_logs')
  .insert({ cron_name: 'sync-xxx', status: 'running' })
  .select('id').single()

// ... do work, collecting errors[] and recordsSynced ...

// Log complete
if (log?.id) {
  await service.from('cron_logs').update({
    status: errors.length ? 'failed' : 'completed',
    completed_at: new Date().toISOString(),
    tenants_processed: 1,
    records_synced: recordsSynced,
    errors,
  }).eq('id', log.id)
}
```

### No AI in cron jobs
All cron route files must include the comment `// NO AI CALLS — insights are user-triggered only`. Claude is never called from automated jobs — only from user-triggered POST routes under `/api/insights/` and `/api/agent/`.

### maxDuration
All cron routes and heavy sync routes set `export const maxDuration = 300` (5 min Vercel limit). Routes that only read from cache can use lower values.

---

## Integrations

| Platform | `stores` table columns | Cron job | Schedule | What's synced |
|---|---|---|---|---|
| **Shopify** | `shopify_domain`, `shopify_access_token` | `sync-shopify` | Every 2h | Orders, customers, products (incremental from last sync; skips if <100 new orders and <4h since last) |
| **Klaviyo** | `klaviyo_api_key`, `klaviyo_account_id` | `sync-klaviyo` | Every 6h | Campaigns, flows, open/click rates, revenue attribution |
| **Meta Ads** | `meta_access_token`, `meta_ad_account_id` | `sync-ads` (shared) | Every 6h +30m | Campaigns, spend, impressions, ROAS, purchases |
| **Google Ads** | `google_ads_refresh_token`, `google_ads_developer_token`, `google_ads_customer_id` | `sync-ads` (shared) | Every 6h +30m | Campaigns, ad groups, spend, conversions |
| **Google Analytics (GA4)** | `ga4_refresh_token`, `ga4_property_id` | `sync-analytics` | Every 6h | Sessions by channel, landing pages, ecommerce metrics, monthly trend |
| **Recharge** | `recharge_api_token` | `sync-recharge` | Every 6h +30m | Active + cancelled subscriptions, MRR, churn, product mix |
| **LoyaltyLion** | `loyaltylion_token`, `loyaltylion_secret` | `sync-loyalty` | Every 6h | Members, tiers, points balances, rewards catalog, campaign lift |
| **Google Search Console** | `gsc_refresh_token`, `gsc_property_url` | `sync-gsc` | Daily 4:30am | Top 50 keywords, top 100 pages (current + prior 90d), monthly click trend (12m) |
| **SEMrush** | `semrush_api_key`, `semrush_domain` | `sync-search` | Daily 4am | Organic keywords, rankings, search volume, authority score, competitor gaps |

All API credentials for third-party platforms are stored in the `stores` table — **never in environment variables**. Only infrastructure secrets (Supabase keys, Anthropic key, Vercel cron secret) are in env vars.

---

## Cron Schedule (vercel.json)

| Cron name | Path | Schedule | Purpose |
|---|---|---|---|
| `sync-shopify` | `/api/cron/sync-shopify` | `0 */2 * * *` | Incremental Shopify order/customer sync |
| `sync-klaviyo` | `/api/cron/sync-klaviyo` | `0 */6 * * *` | Klaviyo campaigns, flows, metrics |
| `sync-ads` | `/api/cron/sync-ads` | `30 */6 * * *` | Meta Ads + Google Ads in parallel |
| `sync-analytics` | `/api/cron/sync-analytics` | `0 */6 * * *` | GA4 sessions, channels, ecommerce |
| `sync-recharge` | `/api/cron/sync-recharge` | `30 */6 * * *` | Recharge subscriptions (active + cancelled) |
| `sync-loyalty` | `/api/cron/sync-loyalty` | `0 */6 * * *` | LoyaltyLion members, rewards, campaign lift |
| `daily-rebuild` | `/api/cron/daily-rebuild` | `0 3 * * *` | Customer profiles (all batches) + agent context cache |
| `sync-search` | `/api/cron/sync-search` | `0 4 * * *` | SEMrush (skips if run <20h ago — API unit cost protection) |
| `sync-gsc` | `/api/cron/sync-gsc` | `30 4 * * *` | Google Search Console keywords + pages |
| `daily-analysis` | `/api/cron/daily-analysis` | `0 5 * * *` | Metrics refresh + analytics overview scores + product analysis |

Set `SYNC_ENABLED=false` to pause all crons (checked by each route at start).

---

## Dashboard Pages

| Page | Route | `page.tsx` | Primary data sources |
|---|---|---|---|
| Executive Summary | `/dashboard` | `app/dashboard/page.tsx` | `metrics_cache`, `sales_channel_cache`, AI insights brief |
| AI Chat | `/dashboard/chat` | `app/dashboard/chat/page.tsx` | `conversations`, `messages`, `agent_context_cache` |
| Shopify | `/dashboard/shopify` | `app/dashboard/shopify/page.tsx` | `orders`, `customers`, `metrics_cache`, `sales_channel_cache` |
| Subscriptions | `/dashboard/subscriptions` | `app/dashboard/subscriptions/page.tsx` | `recharge_subscriptions`, `recharge_metrics_cache` |
| Loyalty | `/dashboard/loyalty` | `app/dashboard/loyalty/page.tsx` | `loyalty_metrics_cache`, `stores.loyaltylion_token` |
| Klaviyo | `/dashboard/klaviyo` | `app/dashboard/klaviyo/page.tsx` | `klaviyo_campaigns`, `klaviyo_flows`, `klaviyo_metrics_cache` |
| Advertising | `/dashboard/advertising` | `app/dashboard/advertising/page.tsx` | `meta_metrics_cache`, `google_ads_campaigns`, `analytics_metrics_cache` |
| Meta Ads | `/dashboard/meta` | `app/dashboard/meta/page.tsx` | `meta_campaigns`, `meta_metrics_cache` |
| Google Ads | `/dashboard/google-ads` | `app/dashboard/google-ads/page.tsx` | `google_ads_campaigns` |
| Analytics | `/dashboard/analytics` | `app/dashboard/analytics/page.tsx` | `analytics_sessions`, `analytics_metrics_cache`, `analytics_monthly` |
| Analytics Overview | `/dashboard/analytics-overview` | `app/dashboard/analytics-overview/page.tsx` | `analytics_overview_cache` |
| Search (SEO) | `/dashboard/search` | `app/dashboard/search/page.tsx` | `gsc_keywords`, `gsc_pages`, `gsc_monthly_clicks`, `semrush_metrics_cache` |
| SEMrush | `/dashboard/semrush` | `app/dashboard/semrush/page.tsx` | `semrush_keywords`, `semrush_keyword_gaps`, `semrush_metrics_cache` |
| Product Intelligence | `/dashboard/products` | `app/dashboard/products/page.tsx` | `product_stats`, `product_affinities`, `purchase_sequences` |
| Customer Intelligence | `/dashboard/customers` | `app/dashboard/customers/page.tsx` | `customer_profiles`, `customer_overlap_cache` |
| Promotions | `/dashboard/promotions` | `app/dashboard/promotions/page.tsx` | `promotions` + AI scorer |
| Integrations | `/dashboard/integrations` | `app/dashboard/integrations/page.tsx` | `stores`, `cron_logs` |

**Stub directories (empty — no page.tsx yet):** `ad-spend/`, `inventory/`, `reports/`, `staff/`

### Executive Summary components (app/dashboard/*.tsx)
- `RevenueSection.tsx` — Monthly trend bar chart + channel breakdown (reads `sales_channel_cache`)
- `BusinessHealthScore.tsx` — Composite score from revenue, ad, email, SEO signals
- `AiInsightsBrief.tsx` — Cached AI-generated bullet points
- `KeyAlertsPanel.tsx` — Surface anomalies and actionable alerts
- `PlatformHealthRow.tsx` — Per-integration connection status cards
- `SyncButton.tsx` — Manual sync trigger

### Dashboard shell components (app/dashboard/_components/)
- `DashboardShell.tsx` — Main layout wrapper
- `Sidebar.tsx` — Navigation with integration connection dots
- `Topbar.tsx` — Header with sync status dropdown and user menu
- `NavLinks.tsx` — Route links with active state
- `ErrorBoundary.tsx` — Fallback for render errors
- `AskAiRow.tsx` — Inline AI question input
- `ChatBubble.tsx` — Reusable message bubble

---

## API Routes

### Agent (`/api/agent/`)
| Route | Method | Purpose |
|---|---|---|
| `/api/agent/chat` | POST | Process message, invoke tools, return Claude response (streaming) |
| `/api/agent/context` | POST | Rebuild `agent_context_cache` from live DB data |
| `/api/agent/conversations` | GET/POST | List or create conversations |
| `/api/agent/conversations/[id]/messages` | GET/POST | Fetch or add messages in a conversation |

### Analytics GA4 (`/api/analytics/`)
| Route | Method | Purpose |
|---|---|---|
| `/api/analytics/auth` | GET | Initiate Google OAuth2 for GA4 |
| `/api/analytics/callback` | GET | Handle OAuth callback, save `ga4_refresh_token` |
| `/api/analytics/sync` | POST | Pull GA4 sessions, channels, pages, ecommerce — delegates to `lib/syncAnalytics.ts` |
| `/api/analytics/insights` | POST | AI analysis of GA4 traffic data |
| `/api/analytics/overview/refresh` | POST | Recompute `analytics_overview_cache` (traffic health + organic visibility scores). Accepts cron auth. |

### Shopify (`/api/shopify/`)
| Route | Method | Purpose |
|---|---|---|
| `/api/shopify/install` | GET | Initiate Shopify OAuth app install |
| `/api/shopify/callback` | GET | Complete OAuth, save access token |
| `/api/shopify/sync` | POST | Incremental or full sync of orders/customers/products |
| `/api/shopify/sync/historical` | POST | Back-fill orders up to `SHOPIFY_SYNC_MONTHS_BACK` months |
| `/api/shopify/reauth` | POST | Refresh Shopify access token |
| `/api/shopify/debug` | GET | Return raw Shopify API response for debugging |

### Google Ads (`/api/google-ads/`)
| Route | Method | Purpose |
|---|---|---|
| `/api/google-ads/auth` | GET | Initiate Google OAuth2 for Ads |
| `/api/google-ads/callback` | GET | Save `google_ads_refresh_token` and `customer_id` |
| `/api/google-ads/sync` | POST | Pull campaigns, spend, conversions |

### Google Search Console (`/api/gsc/`)
| Route | Method | Purpose |
|---|---|---|
| `/api/gsc/auth` | GET | Initiate GSC OAuth2 |
| `/api/gsc/callback` | GET | Save `gsc_refresh_token` and `gsc_property_url` |
| `/api/gsc/sync` | POST | Pull keywords, pages, monthly clicks — delegates to `lib/syncGsc.ts` |
| `/api/gsc/diagnose` | GET | Debug GSC property resolution (lists available properties) |
| `/api/gsc/disconnect` | POST | Revoke GSC access, clear tokens |
| `/api/gsc/insights` | POST | AI analysis of search performance data |

### Klaviyo (`/api/klaviyo/`)
| Route | Method | Purpose |
|---|---|---|
| `/api/klaviyo/connect` | POST | Save API key, trigger initial sync |
| `/api/klaviyo/sync` | POST | Pull campaigns, flows, metrics — delegates to `lib/syncKlaviyo.ts` |
| `/api/klaviyo/insights` | POST | AI analysis of email performance |
| `/api/klaviyo/flow-analysis` | POST | Detailed flow step performance analysis |
| `/api/klaviyo/test` | POST | Validate API key |
| `/api/klaviyo/debug` | GET | Return raw API response |

### Meta Ads (`/api/meta/`)
| Route | Method | Purpose |
|---|---|---|
| `/api/meta/connect` | POST | Save `meta_access_token` and `meta_ad_account_id` |
| `/api/meta/sync` | POST | Pull campaigns, spend, ROAS — delegates to `lib/syncMeta.ts` |
| `/api/meta/insights` | POST | AI analysis of ad performance |
| `/api/meta/test` | POST | Validate token |

### Recharge (`/api/recharge/`)
| Route | Method | Purpose |
|---|---|---|
| `/api/recharge/connect` | POST | Save `recharge_api_token` |
| `/api/recharge/sync` | POST | Pull subscriptions, compute MRR/churn — delegates to `lib/syncRecharge.ts` |
| `/api/recharge/test` | POST | Validate token |

### LoyaltyLion (`/api/loyaltylion/`)
| Route | Method | Purpose |
|---|---|---|
| `/api/loyaltylion/connect` | POST | Save `loyaltylion_token` and `loyaltylion_secret` |
| `/api/loyaltylion/sync` | POST | Pull members, activities, rewards — delegates to `lib/syncLoyalty.ts` |
| `/api/loyaltylion/audit` | POST | Data-isolation audit (email matching vs orders table) |
| `/api/loyaltylion/test` | POST | Validate credentials |
| `/api/loyaltylion/debug` | GET | Return raw API response |

### SEMrush (`/api/semrush/`)
| Route | Method | Purpose |
|---|---|---|
| `/api/semrush/connect` | POST | Save `semrush_api_key` and `semrush_domain` |
| `/api/semrush/sync` | POST | Pull keywords, rankings, authority score — delegates to `lib/syncSEMrush.ts` |
| `/api/semrush/test` | POST | Validate API key |
| `/api/semrush/debug` | GET | Return raw API response |

### AI Insights (`/api/insights/`)
All are user-triggered POST endpoints. None call cron-auth. All use Claude claude-sonnet-4-6.

| Route | Purpose |
|---|---|
| `/api/insights/executive` | Revenue, order, top-product analysis for exec summary |
| `/api/insights/shopify` | Store intelligence (products, customers, channel trends) |
| `/api/insights/advertising` | Ad spend efficiency, ROAS gaps, budget recommendations |
| `/api/insights/analytics-overview` | Traffic health, organic opportunity analysis |
| `/api/insights/seo` | Keyword ranking gaps, GSC + SEMrush combined analysis |
| `/api/insights/loyalty` | Member engagement, tier health, redemption patterns |
| `/api/insights/subscriptions` | Churn drivers, MRR risk, win-back opportunities |
| `/api/insights/products` | Revenue drivers, affinity bundles, subscription gaps |

### Products & Customers
| Route | Method | Purpose |
|---|---|---|
| `/api/products/analyze` | POST | 3-step: product stats → affinity pairs → purchase sequences. Reads all paid orders. Accepts cron auth. |
| `/api/customers/build-profiles` | POST | Triggers `runProfileBatch()` for a single batch index |
| `/api/customers/rebuild-overlap` | POST | Recomputes `customer_overlap_cache` Venn diagram counts |
| `/api/customers/insight` | POST | AI analysis of a customer segment |

### Other
| Route | Method | Purpose |
|---|---|---|
| `/api/metrics/refresh` | POST/GET | Paginated 30d/prior-30d order aggregates + channel cache. Accepts cron auth. |
| `/api/promotions/score` | POST | AI-powered promotion effectiveness scoring |
| `/api/sync/status` | GET | Returns last/next run times + connection flags for all 10 crons |
| `/api/auth/signout` | POST | Clear session, redirect to login |

---

## Lib Modules

| File | Key exports | Notes |
|---|---|---|
| `lib/supabase.ts` | `createSupabaseServerClient`, `createSupabaseServiceClient`, `createSupabaseBrowserClient` | Three distinct client factories — do not mix them up |
| `lib/cronAuth.ts` | `verifyCronAuth(req)`, `cronAuthHeaders()` | Used by every cron route |
| `lib/agentTools.ts` | Tool definitions array, `executeTool(name, args)` | 12+ tools: revenue summary, top products, customer segments, ad performance, etc. |
| `lib/buildAgentContext.ts` | `runAgentContextRebuild()` | Aggregates DB data into JSON snapshot for AI chat system prompt |
| `lib/buildProfiles.ts` | `runProfileBatch(batch: number)` | Builds `customer_profiles` in 5,000-email batches; final batch writes overlap + segment/LTV stats to `customer_overlap_cache` |
| `lib/analytics.ts` | `buildAuthUrl`, `exchangeCode`, `refreshAccessToken`, `getChannelSessions`, `getMonthlySessions`, `getEcommerceMetrics` | GA4 API wrapper |
| `lib/gsc.ts` | `buildAuthUrl`, `exchangeCode`, `refreshAccessToken`, `querySearchAnalytics`, `toGscDate`, `toMonthStart` | GSC API wrapper |
| `lib/googleAds.ts` | `getCampaigns`, `getAccountSummary` | Google Ads API wrapper |
| `lib/klaviyo.ts` | `getAccount`, `getCampaigns`, `getFlows`, `getMetrics` | Klaviyo API wrapper |
| `lib/meta.ts` | `getAdAccounts`, `getCampaigns`, `getAccountInsights` | Meta Graph API v19.0 wrapper. `metaGet()` checks Content-Type before parsing to handle HTML error responses (expired token). |
| `lib/recharge.ts` | `getSubscriptions`, `getCustomers`, `toMonthlyRevenue` | Recharge API wrapper |
| `lib/loyaltylion.ts` | `getCustomers`, `getActivities`, `getRewards`, `getCampaigns` | LoyaltyLion API wrapper with 30s AbortController timeout per page, 200-page cap |
| `lib/semrush.ts` | `getDomainOverview`, `getOrganicKeywords`, `getCompetitorGap` | SEMrush API wrapper |
| `lib/syncShopify.ts` | `runShopifySync(token, mode, since?)` | Full or incremental Shopify sync |
| `lib/syncAnalytics.ts` | `runAnalyticsSync(credentials)` | GA4 sync orchestration |
| `lib/syncGoogleAds.ts` | `runGoogleAdsSync(credentials)` | Google Ads sync orchestration |
| `lib/syncGsc.ts` | `runGscSync(refreshToken, propertyUrl)` | GSC sync — extracted from route so cron can call it directly |
| `lib/syncKlaviyo.ts` | `runKlaviyoSync(apiKey)` | Klaviyo sync orchestration |
| `lib/syncMeta.ts` | `runMetaSync(token, accountId)` | Meta sync orchestration |
| `lib/syncRecharge.ts` | `runRechargeSync(apiToken)` | Recharge sync — extracted from route so cron can call it directly |
| `lib/syncLoyalty.ts` | `runLoyaltySync(token, secret)` | LoyaltyLion sync. Avoids activities endpoint (504 risk) unless completed campaigns exist. Computes tier LTV from `orders` table (not `customers`) to capture B2B guest-checkout spend. |
| `lib/syncSEMrush.ts` | `runSEMrushSync(apiKey, domain)` | SEMrush sync orchestration |

---

## Supabase Migrations (22 applied)

All migrations live in `supabase/migrations/`. Apply via Supabase SQL Editor or `supabase db push`.

| # | File | What it creates / changes |
|---|---|---|
| 001 | `001_initial_schema.sql` | Core tables: `tenants`, `stores`, `customers`, `orders`, `order_line_items`, `promotions`, `user_tenants`. RLS policies. |
| 002 | `002_store_access_token.sql` | Adds `shopify_access_token` to `stores` |
| 003 | `003_sync_infrastructure.sql` | `sync_logs` table; `line_items` JSONB on orders; `metrics_cache` table; first/last order timestamps on customers |
| 004 | `004_klaviyo_integration.sql` | Klaviyo credentials on `stores`; `klaviyo_campaigns`, `klaviyo_flows`, `klaviyo_metrics_cache` |
| 005 | `005_gsc_integration.sql` | GSC credentials on `stores`; `gsc_keywords`, `gsc_pages`, `gsc_monthly_clicks` |
| 006 | `006_sms_campaigns.sql` | Adds `channel` column (email/sms) to `klaviyo_campaigns` |
| 007 | `007_gsc_insights_cache.sql` | `gsc_insights_cache` table |
| 008 | `008_sales_channels.sql` | `sales_channel_cache` table; `source_name` column on orders |
| 009 | `009_ads.sql` | Ads credentials on `stores`; `meta_campaigns`, `meta_metrics_cache`, `google_ads_campaigns`, `google_ads_metrics`, related ad tables |
| 010 | `010_executive_insights_cache.sql` | `executive_insights_cache` table |
| 011 | `011_fix_google_ads_customer_id.sql` | Corrects stored Google Ads customer ID column type |
| 012 | `012_analytics.sql` | GA4 credentials on `stores`; `analytics_sessions`, `analytics_monthly`, `analytics_metrics_cache`, `analytics_pages` |
| 013 | `013_chat_agent.sql` | `conversations`, `messages`, `agent_context_cache` for AI chat |
| 014 | `014_recharge_loyalty.sql` | Recharge + LoyaltyLion credentials on `stores`; `recharge_subscriptions`, `loyalty_customers`, `loyalty_activities` |
| 015 | `015_rpc_metrics.sql` | SQL RPC functions: `get_monthly_revenue(p_store_id, p_months)`, `count_distinct_customer_emails(p_store_id)` |
| 016 | `016_loyaltylion_audit.sql` | `loyaltylion_audit_customers`, `loyaltylion_audit_activities` for data isolation audits |
| 017 | `017_semrush.sql` | SEMrush credentials on `stores`; `semrush_keywords`, `semrush_keyword_gaps`, `semrush_metrics_cache` |
| 018 | `018_product_customer_intelligence.sql` | `customer_profiles`, `product_stats`, `product_affinities`, `purchase_sequences`, `customer_overlap_cache` |
| 019 | `019_shopify_analytics_overview.sql` | `analytics_overview_cache` (traffic health score, organic visibility score, blended monthly data) |
| 020 | `020_cron_logs.sql` | `cron_logs` table (cron_name, status, started_at, completed_at, records_synced, errors, metadata) |
| 021 | `021_loyalty_complete.sql` | Adds `rewards_catalog` and loyalty tier/redemption columns to `loyalty_metrics_cache` |
| 022 | `022_customer_stats_cache.sql` | Adds `segment_counts jsonb` and `ltv_stats jsonb` columns to `customer_overlap_cache` |

---

## Environment Variables

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=           # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=      # Public anon key (browser-safe)
SUPABASE_SERVICE_ROLE_KEY=          # Privileged key — server/cron only, never expose to browser

# AI
ANTHROPIC_API_KEY=                  # Anthropic API key for Claude

# Cron
CRON_SECRET=                        # Shared secret; Vercel sends as Authorization: Bearer <secret>
SYNC_ENABLED=                       # Set to "false" to pause all cron jobs; omit or "true" to enable

# Shopify
SHOPIFY_RETAIL_STORE=               # e.g. lashboxla.myshopify.com
SHOPIFY_SYNC_MONTHS_BACK=           # How many months of historical orders to back-fill (default: 12)
```

All third-party integration credentials (Klaviyo, Recharge, LoyaltyLion, SEMrush, Meta, Google OAuth tokens) are stored per-store in the `stores` table. Do not add them as environment variables.

---

## Known Issues

### LoyaltyLion enrolled count capped at ~20,000
The LoyaltyLion API appears to return only recently-active members regardless of pagination. The actual enrolled count (per LoyaltyLion's own dashboard) is 56,824+ (Glow: 49,218 · Allure: 5,488 · Icon: 1,330 · Empire: 788). Downstream metrics — redemption rate, points liability, tier LTV — are calculated against this partial subset and will be understated. This is an upstream API limitation, not a code bug. `lib/loyaltylion.ts` paginates up to 200 pages × 500 per page = 100,000 max, so the cap is on LL's side.

### Customer segment pills show 0 after migration 022
The VIP/Active/At Risk/Lapsed/New pill counts and Diamond/Gold/Silver/Bronze LTV segment cards read from `customer_overlap_cache.segment_counts` and `customer_overlap_cache.ltv_stats`. These columns were added in migration 022 and are `null` until "Build Profiles" runs. The table rows themselves are correct (live DB query). Fix: run Build Profiles manually once; `daily-rebuild` at 3am will keep it current thereafter.

### Meta Ads token expiry
When the Meta access token expires, Meta returns an HTML error page. `lib/meta.ts` now checks `Content-Type` before parsing and throws a clean error with "token may be expired" in the message. However there is no automated re-auth flow or expiry warning in the UI. The user must manually disconnect and reconnect Meta in Integrations when this occurs.

### SEMrush API units exhausted
The account hit error `403: ERROR 132 — API UNITS BALANCE IS ZERO`. This is a billing issue on the SEMrush account, not a code problem. The cron skips gracefully (checked via `lastRun` guard). Will resume automatically once units are replenished.

### `first_purchase_leads_to_second` duplicates `repeat_purchase_rate`
In `product_stats`, the column `first_purchase_leads_to_second` is currently assigned the same value as `repeat_purchase_rate`. It was intended to be a distinct metric (% of first-time buyers who return for this product as their explicit second order). Not yet implemented separately.

### Product analysis runtime
`/api/products/analyze` reads all 115k+ paid orders into memory for affinity and sequence computation. Takes 2–4 minutes and runs close to the 300s Vercel limit. Runs daily at 5am via `daily-analysis`. Manual triggers from the UI should work but may timeout for very large datasets.

### Profile rebuild duration
`runProfileBatch()` processes customers in 5,000-email batches. With ~40k customers this takes 5–8 minutes total across batches. `daily-rebuild` calls all batches sequentially in a single 300s Vercel function. If customer count grows significantly the job will need to be split across multiple cron invocations.

---

## Roadmap

### High priority
- **Shopify webhooks** — Replace the 2-hour polling cron with `orders/paid` and `orders/create` webhooks for real-time order data. Would eliminate the cost-protection skip logic and make metrics near-real-time.
- **OAuth token expiry detection** — Proactively detect when Meta, Google, or GSC tokens are expired or within 7 days of expiry and surface a prominent banner on the Integrations page (and optionally send an email alert). Currently failures only appear in sync history.
- **Remove hardcoded tenant/store UUIDs** — `TENANT_ID` and `STORE_ID` are hardcoded in ~30 files. Replacing these with dynamic per-user lookups would make Store Signal a true multi-tenant SaaS product.
- **LoyaltyLion full member fetch** — Investigate LL bulk export endpoint, webhook feed, or partner API to fetch all 56,824+ members instead of the ~20,000 currently returned by the paginated REST API.

### Medium priority
- **Klaviyo segment push** — After identifying high-value segments in Customer Intelligence (e.g. "high repeat rate + no subscription"), automatically create or update a matching Klaviyo list for targeted campaigns.
- **Refund and return tracking** — Shopify sync captures `financial_status` but refunded orders are not surfaced as a separate metric. Net revenue (gross minus refunds) is not currently displayed.
- **Customer cohort analysis** — Group customers by `first_order_at` month and show retention rate, repeat purchase rate, and LTV per cohort. All required data exists in `customer_profiles`.
- **Subscription win-back scoring** — Score churned subscribers (Recharge `status = 'cancelled'`) who are still placing one-time orders for re-subscription likelihood based on purchase cadence vs. their prior subscription interval.
- **Google Ads + GA4 attribution join** — Correlate Google Ads spend by campaign with GA4 conversion data to produce a true channel-level ROAS that accounts for attribution model differences.

### Lower priority
- **CSV/PDF export** — Downloadable exports for customer segment tables, product performance, and channel breakdowns.
- **Weekly email digest** — Automated summary of top metrics, sync failures, and AI-surfaced alerts delivered via email or Slack without requiring a dashboard login.
- **Promotional calendar** — Calendar view overlaying promotion creation dates, Klaviyo send dates, and revenue spikes to visually attribute marketing activity to revenue outcomes.
- **Abandoned cart analysis** — Shopify's `abandoned_checkouts` endpoint is not currently synced. Would unlock abandonment rate, average cart value at abandonment, and recovery rate metrics.
- **Mobile-responsive tables** — The dashboard is desktop-first. Most tables have horizontal scroll on small screens. The customer Venn diagram and product affinity visualizations do not adapt to narrow viewports.
- **Competitive benchmarking view** — `semrush_keyword_gaps` is synced but only surfaced in the Search page. A dedicated competitor tracking view showing keyword overlap and estimated traffic share over time would make this data more actionable.
