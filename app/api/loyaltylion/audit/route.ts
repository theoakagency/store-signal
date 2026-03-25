/**
 * POST /api/loyaltylion/audit
 * Re-runs the data-isolation audit with corrected case-insensitive email matching.
 *
 * Original audit used case-sensitive JS Set comparison against the LoyaltyLion
 * customer list only — LoyaltyLion disputed the 87/100 "foreign email" finding.
 *
 * Corrected audit:
 *   1. Pulls 100 activity records from LoyaltyLion API
 *   2. Compares against customer_profiles (our DB) — case-sensitive AND insensitive
 *   3. Compares against orders (our DB) — case-sensitive AND insensitive
 *   4. Reports the delta so we can see if the original result was a false positive
 *
 * No DB writes — read-only analysis.
 * TEMPORARY — remove once data-ownership question is resolved.
 */
import { NextRequest } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'

const STORE_ID  = '00000000-0000-0000-0000-000000000002'
const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const BASE = 'https://api.loyaltylion.com/v2'

function normalize(email: unknown): string {
  return String(email ?? '').toLowerCase().trim()
}

export async function POST(_req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createSupabaseServiceClient()
  const { data: store } = await service
    .from('stores')
    .select('loyaltylion_token')
    .eq('id', STORE_ID)
    .single()

  const token = (store as { loyaltylion_token: string | null } | null)?.loyaltylion_token
  if (!token) return Response.json({ error: 'LoyaltyLion not connected' }, { status: 400 })

  // ── Step 1: Fetch 100 activity records from LoyaltyLion ────────────────────
  const actRes = await fetch(`${BASE}/activities?per_page=100`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
  if (!actRes.ok) {
    const body = await actRes.text()
    return Response.json({ error: `LoyaltyLion API error ${actRes.status}: ${body}` }, { status: 502 })
  }

  const actData = await actRes.json() as { activities: Record<string, unknown>[] }
  const activities = actData.activities ?? []

  // Extract activity emails — original casing and normalized
  const rawActivityEmails: string[] = activities
    .map((a) => (a.customer as Record<string, unknown> | null)?.email as string)
    .filter(Boolean)

  const uniqueRawEmails    = [...new Set(rawActivityEmails)]
  const uniqueNormEmails   = [...new Set(uniqueRawEmails.map(normalize))]

  // ── Step 2: Load customer_profiles emails from our DB ──────────────────────
  // Paginate to get all rows — could be large
  const profileEmailsRaw: string[] = []
  {
    let from = 0
    while (true) {
      const { data } = await service
        .from('customer_profiles')
        .select('email')
        .eq('tenant_id', TENANT_ID)
        .range(from, from + 999)
      if (!data || data.length === 0) break
      for (const row of data) profileEmailsRaw.push(row.email as string)
      if (data.length < 1000) break
      from += 1000
    }
  }

  // ── Step 3: Load orders emails from our DB ─────────────────────────────────
  const orderEmailsRaw: string[] = []
  {
    let from = 0
    while (true) {
      const { data } = await service
        .from('orders')
        .select('email')
        .eq('store_id', STORE_ID)
        .eq('financial_status', 'paid')
        .range(from, from + 999)
      if (!data || data.length === 0) break
      for (const row of data) if (row.email) orderEmailsRaw.push(row.email as string)
      if (data.length < 1000) break
      from += 1000
    }
  }

  // ── Step 4: Build lookup sets ──────────────────────────────────────────────
  // Case-sensitive sets (original casing)
  const profilesSetExact = new Set(profileEmailsRaw)
  const ordersSetExact   = new Set(orderEmailsRaw)

  // Case-insensitive sets (normalized)
  const profilesSetNorm  = new Set(profileEmailsRaw.map(normalize))
  const ordersSetNorm    = new Set(orderEmailsRaw.map(normalize))

  // ── Step 5: Compare each unique activity email ────────────────────────────
  interface EmailResult {
    email: string
    normalizedEmail: string
    inProfilesExact: boolean
    inProfilesNorm: boolean
    inOrdersExact: boolean
    inOrdersNorm: boolean
    matchedAnyExact: boolean
    matchedAnyNorm: boolean
  }

  const results: EmailResult[] = uniqueRawEmails.map((email) => {
    const norm = normalize(email)
    const inProfilesExact = profilesSetExact.has(email)
    const inProfilesNorm  = profilesSetNorm.has(norm)
    const inOrdersExact   = ordersSetExact.has(email)
    const inOrdersNorm    = ordersSetNorm.has(norm)
    return {
      email,
      normalizedEmail: norm,
      inProfilesExact,
      inProfilesNorm,
      inOrdersExact,
      inOrdersNorm,
      matchedAnyExact: inProfilesExact || inOrdersExact,
      matchedAnyNorm:  inProfilesNorm  || inOrdersNorm,
    }
  })

  // ── Step 6: Aggregate counts ───────────────────────────────────────────────
  const totalUniqueActivityEmails = uniqueRawEmails.length

  const exactCounts = {
    matchedProfiles: results.filter((r) => r.inProfilesExact).length,
    matchedOrders:   results.filter((r) => r.inOrdersExact).length,
    matchedEither:   results.filter((r) => r.matchedAnyExact).length,
    unmatched:       results.filter((r) => !r.matchedAnyExact).length,
  }

  const normCounts = {
    matchedProfiles: results.filter((r) => r.inProfilesNorm).length,
    matchedOrders:   results.filter((r) => r.inOrdersNorm).length,
    matchedEither:   results.filter((r) => r.matchedAnyNorm).length,
    unmatched:       results.filter((r) => !r.matchedAnyNorm).length,
  }

  // Emails that changed result when using case-insensitive comparison
  const falsePositives = results.filter((r) => !r.matchedAnyExact && r.matchedAnyNorm)
  const stillUnmatched = results.filter((r) => !r.matchedAnyNorm)

  return Response.json({
    summary: {
      activity_records_fetched: activities.length,
      unique_activity_emails:   totalUniqueActivityEmails,
      db_customer_profiles_loaded: profileEmailsRaw.length,
      db_orders_loaded:            orderEmailsRaw.length,
    },
    case_sensitive_comparison: {
      description: 'Original audit method — exact string match, no normalization',
      matched_in_customer_profiles: exactCounts.matchedProfiles,
      matched_in_orders:            exactCounts.matchedOrders,
      matched_in_either:            exactCounts.matchedEither,
      unmatched:                    exactCounts.unmatched,
      match_rate: `${Math.round((exactCounts.matchedEither / totalUniqueActivityEmails) * 100)}%`,
    },
    case_insensitive_comparison: {
      description: 'Corrected method — LOWER(TRIM(email)) on both sides',
      matched_in_customer_profiles: normCounts.matchedProfiles,
      matched_in_orders:            normCounts.matchedOrders,
      matched_in_either:            normCounts.matchedEither,
      unmatched:                    normCounts.unmatched,
      match_rate: `${Math.round((normCounts.matchedEither / totalUniqueActivityEmails) * 100)}%`,
    },
    false_positive_analysis: {
      description: 'Emails that appeared foreign under case-sensitive but match under case-insensitive — these were false positives in the original audit',
      count: falsePositives.length,
      emails: falsePositives.map((r) => ({
        original: r.email,
        normalized: r.normalizedEmail,
        found_in_profiles_norm: r.inProfilesNorm,
        found_in_orders_norm: r.inOrdersNorm,
      })),
    },
    still_unmatched: {
      description: 'Emails that do NOT match in either DB table even after case-insensitive normalization — genuinely foreign if any remain',
      count: stillUnmatched.length,
      emails: stillUnmatched.map((r) => r.email),
    },
  })
}
