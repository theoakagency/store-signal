/**
 * DataCoverageBar — shows the date range covered by each connected platform.
 * Renders as a small muted text line beneath the page header.
 * Pass only the platforms that are actually connected for this page.
 */

interface PlatformEntry {
  label: string
  range: string
}

interface Props {
  platforms: PlatformEntry[]
}

export default function DataCoverageBar({ platforms }: Props) {
  if (platforms.length === 0) return null

  return (
    <p className="text-[11px] text-ink-3 leading-relaxed">
      <span className="font-medium text-ink-3">Data coverage:</span>{' '}
      {platforms.map((p, i) => (
        <span key={p.label}>
          {p.label}: <span className="text-ink-2">{p.range}</span>
          {i < platforms.length - 1 && <span className="mx-1.5 text-cream-3">·</span>}
        </span>
      ))}
    </p>
  )
}

// ── Pre-built coverage entries ──────────────────────────────────────────────

/**
 * Build a "Month Year – Month Year" label for a rolling window of N days.
 */
function rollingRange(days: number): string {
  const end = new Date()
  const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  return `${fmt(start)} – ${fmt(end)}`
}

export const COVERAGE = {
  shopify:          { label: 'Shopify',         range: rollingRange(730) },
  klaviyo_12m:      { label: 'Klaviyo',          range: rollingRange(365) + ' (API limit)' },
  klaviyo_flows:    { label: 'Klaviyo flows',    range: 'All time (cumulative)' },
  meta_ads:         { label: 'Meta Ads',         range: rollingRange(90) },
  google_ads:       { label: 'Google Ads',       range: rollingRange(90) + ' (via GA4)' },
  ga4:              { label: 'GA4',              range: rollingRange(90) },
  gsc:              { label: 'Search Console',   range: rollingRange(90) },
  semrush:          { label: 'SEMrush',          range: 'Current snapshot + ' + rollingRange(365).split(' – ')[0] + ' trend' },
  recharge:         { label: 'Recharge',         range: 'Current state + ' + rollingRange(365).split(' – ')[0] + ' charges' },
  loyaltylion:      { label: 'LoyaltyLion',      range: rollingRange(365) + ' (~20k of 56k+ members)' },
}
