import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import DataAuditClient from './DataAuditClient'

export const metadata = { title: 'Data Audit — Store Signal' }

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

export interface AuditEntry {
  id: string
  platform: string
  metric_name: string
  time_window: string
  expected_value: string
  actual_value: string
  match: boolean
  tolerance_note: string | null
  discrepancy_note: string | null
  verified_by: string
  verified_at: string
  notes: string | null
}

// Known discrepancies — hardcoded from CLAUDE.md / AGENTS.md known issues.
// These represent permanently-documented caveats, not spot-check results.
export const KNOWN_DISCREPANCIES: {
  platform: string
  metric: string
  issue: string
  root_cause: string
  impact: 'high' | 'medium' | 'low'
  fixable: boolean
}[] = [
  {
    platform: 'LoyaltyLion',
    metric: 'Enrolled member count',
    issue: 'System shows ~20,000 members; LoyaltyLion dashboard shows 56,824+',
    root_cause: 'LoyaltyLion API returns only recently-active members regardless of pagination settings. The 200-page × 500/page cap is never hit — the API itself is the bottleneck.',
    impact: 'high',
    fixable: false,
  },
  {
    platform: 'LoyaltyLion',
    metric: 'Redemption rate, tier LTV',
    issue: 'All loyalty-derived rates (redemption %, tier LTV) are computed against the ~20k subset, not all 56k+ members. Real rates likely lower.',
    root_cause: 'Downstream of the enrolled count limitation above.',
    impact: 'high',
    fixable: false,
  },
  {
    platform: 'Shopify',
    metric: 'Customer LTV',
    issue: 'LTV figures only reflect the last 24 months of order history. Long-standing customers show lower LTV than their true lifetime value.',
    root_cause: 'Shopify order history in the database is capped at 24 months. Older orders were not back-filled.',
    impact: 'medium',
    fixable: false,
  },
  {
    platform: 'Klaviyo',
    metric: 'Email revenue',
    issue: 'Klaviyo campaign/flow revenue only covers last 12 months due to API limit. Older campaigns not included.',
    root_cause: 'Klaviyo REST API enforces a 12-month maximum date range for campaign statistics.',
    impact: 'medium',
    fixable: false,
  },
  {
    platform: 'Product Intelligence',
    metric: 'first_purchase_leads_to_second',
    issue: '"First purchase leads to second purchase" metric is currently identical to repeat_purchase_rate. Not yet implemented as a distinct metric.',
    root_cause: 'Intentional placeholder — correct implementation pending.',
    impact: 'low',
    fixable: true,
  },
  {
    platform: 'Customer Intelligence',
    metric: 'Segment pill counts (VIP/Active/At Risk/Lapsed/New)',
    issue: 'Counts show 0 until "Build Profiles" is run after migration 022. Requires one manual trigger; then stays current via nightly rebuild.',
    root_cause: 'segment_counts and ltv_stats columns in customer_overlap_cache are null until the final profile batch writes them.',
    impact: 'low',
    fixable: true,
  },
  {
    platform: 'Google Analytics / Google Ads',
    metric: 'Revenue attribution',
    issue: 'GA4-reported revenue and Shopify revenue will differ. GA4 uses last-click attribution; Shopify records actual payments.',
    root_cause: 'Fundamental attribution model difference between analytics and payment systems — expected, not a data error.',
    impact: 'medium',
    fixable: false,
  },
]

export default async function DataAuditPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createSupabaseServiceClient()
  const { data: auditLog } = await service
    .from('data_audit_log')
    .select('id, platform, metric_name, time_window, expected_value, actual_value, match, tolerance_note, discrepancy_note, verified_by, verified_at, notes')
    .eq('tenant_id', TENANT_ID)
    .order('verified_at', { ascending: false })
    .limit(100)

  return (
    <DataAuditClient
      auditLog={(auditLog ?? []) as AuditEntry[]}
      knownDiscrepancies={KNOWN_DISCREPANCIES}
    />
  )
}
