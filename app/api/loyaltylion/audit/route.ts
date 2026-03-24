/**
 * POST /api/loyaltylion/audit
 * Fetches ONE page of customers and activities and returns a cross-merchant
 * scope analysis. No DB writes — pure analysis to answer the data ownership question.
 * TEMPORARY — remove once confirmed with LoyaltyLion.
 */
import { NextRequest } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'

const STORE_ID = '00000000-0000-0000-0000-000000000002'
const BASE = 'https://api.loyaltylion.com/v2'

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
  if (!token) return Response.json({ error: 'Not connected' }, { status: 400 })

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  // Fetch one page each — no pagination, no DB writes
  const [custRes, actRes] = await Promise.all([
    fetch(`${BASE}/customers?per_page=500`, { headers }),
    fetch(`${BASE}/activities?per_page=500`, { headers }),
  ])

  if (!custRes.ok || !actRes.ok) {
    return Response.json({ error: `API error: customers=${custRes.status} activities=${actRes.status}` }, { status: 502 })
  }

  const custData = await custRes.json() as { customers: Record<string, unknown>[] }
  const actData  = await actRes.json() as { activities: Record<string, unknown>[] }

  const customers   = custData.customers  ?? []
  const activities  = actData.activities  ?? []

  // Analyse customers
  const custMerchantIds   = [...new Set(customers.map((c) => c.merchant_id as string))]
  const custShopifyUrls   = [...new Set(customers.map((c) => (c.metadata as Record<string,string>|null)?.shopify_source_url))]

  // Analyse activities — look at the merchant_id ON the activity and ON the nested customer
  const actMerchantIds    = [...new Set(activities.map((a) => a.merchant_id as string))]
  const actCustMerchantIds = [...new Set(activities.map((a) => (a.customer as Record<string,unknown>|null)?.merchant_id as string))]
  const actEmails         = [...new Set(activities.map((a) => (a.customer as Record<string,unknown>|null)?.email as string))]
  const custEmails        = new Set(customers.map((c) => c.email as string))
  const foreignEmails     = actEmails.filter((e) => e && !custEmails.has(e))

  return Response.json({
    note: 'One page (500) of each — sample only',
    customers: {
      count: customers.length,
      unique_merchant_ids: custMerchantIds.length,
      shopify_urls: custShopifyUrls,
      sample_merchant_ids: custMerchantIds.slice(0, 5),
    },
    activities: {
      count: activities.length,
      unique_activity_merchant_ids: actMerchantIds.length,
      unique_customer_merchant_ids: actCustMerchantIds.length,
      sample_activity_merchant_ids: actMerchantIds.slice(0, 5),
      sample_customer_merchant_ids: actCustMerchantIds.slice(0, 5),
      emails_not_in_your_customer_list: foreignEmails.length,
      sample_foreign_emails: foreignEmails.slice(0, 5),
    },
  })
}
