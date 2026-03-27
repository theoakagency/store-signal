/**
 * Standardized data window definitions for Store Signal.
 *
 * The smallest common window across all connected platforms is 90 days
 * (Meta Ads, Google Ads, GA4, GSC all use 90-day windows). Any cross-platform
 * comparison must use this as the base window for apples-to-apples comparisons.
 */

export const DATA_WINDOWS = {
  LAST_7_DAYS:    { days: 7,   label: 'Last 7 days' },
  LAST_30_DAYS:   { days: 30,  label: 'Last 30 days' },
  LAST_90_DAYS:   { days: 90,  label: 'Last 90 days' },
  LAST_12_MONTHS: { days: 365, label: 'Last 12 months' },
  LAST_24_MONTHS: { days: 730, label: 'Last 24 months' },
} as const

export type DataWindowKey = keyof typeof DATA_WINDOWS

/**
 * Per-platform data availability limits.
 * Use these when generating prompts or labels so Claude and the UI
 * always acknowledge what window each data point actually covers.
 */
export const PLATFORM_DATA_WINDOWS = {
  shopify: {
    max_days: 730,
    label: '24 months',
    note: 'Full history available via historical sync',
  },
  klaviyo_campaigns: {
    max_days: 365,
    label: '12 months',
    note: 'Klaviyo API limit for revenue attribution',
  },
  klaviyo_flows: {
    max_days: null,
    label: 'All time',
    note: 'Cumulative flow performance since creation',
  },
  meta_ads: {
    max_days: 90,
    label: '90 days',
    note: 'Default Meta Ads API reporting window',
  },
  google_ads: {
    max_days: 90,
    label: '90 days',
    note: 'Via GA4 fallback (direct Google Ads API pending)',
  },
  ga4: {
    max_days: 90,
    label: '90 days',
    note: 'Standard GA4 reporting window',
  },
  gsc: {
    max_days: 90,
    label: '90 days',
    note: 'GSC standard reporting window',
  },
  semrush: {
    max_days: 365,
    label: '12-month trend',
    note: 'Current snapshot + 12-month traffic history',
  },
  recharge: {
    max_days: 365,
    label: '12 months charges',
    note: 'Active subscriptions reflect current state',
  },
  loyaltylion: {
    max_days: 365,
    label: '12 months activity',
    note: 'API returns ~20k of 56,824+ enrolled members',
  },
} as const

export type PlatformKey = keyof typeof PLATFORM_DATA_WINDOWS

/**
 * The cross-platform comparison window — the smallest common denominator
 * across Meta, Google, GA4, and GSC. All multi-platform AI prompts should
 * normalize to this window and explicitly state it.
 */
export const CROSS_PLATFORM_WINDOW = DATA_WINDOWS.LAST_90_DAYS

/**
 * LTV disclaimer shown wherever customer lifetime value is displayed.
 * LTV figures are understated because Shopify history is limited to 24 months.
 */
export const LTV_DISCLAIMER =
  'LTV figures are based on 24 months of Shopify order history. Actual lifetime value may be significantly higher for customers who have been buying since before 2024.'

/**
 * Build a date-range string for display (e.g. "Jan 2026 – Mar 2026").
 */
export function dateRangeLabel(days: number): string {
  const end = new Date()
  const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  return `${fmt(start)} – ${fmt(end)}`
}

/**
 * Build an ISO date string for N days ago (for use in DB queries).
 */
export function daysAgoISO(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}
