/**
 * POST /api/semrush/debug
 * Returns raw API responses to diagnose parsing issues. Remove after debugging.
 */
import { NextRequest } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'

const STORE_ID = '00000000-0000-0000-0000-000000000002'
const BASE_URL = 'https://api.semrush.com'

export async function POST(_req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createSupabaseServiceClient()
  const { data: store } = await service
    .from('stores')
    .select('semrush_api_key, semrush_domain')
    .eq('id', STORE_ID)
    .single()

  const apiKey = (store as { semrush_api_key: string | null; semrush_domain: string | null } | null)?.semrush_api_key
  const domain = (store as { semrush_api_key: string | null; semrush_domain: string | null } | null)?.semrush_domain

  if (!apiKey || !domain) return Response.json({ error: 'Not connected' }, { status: 400 })

  // Test domain_ranks with the stored domain
  const q1 = new URLSearchParams({ key: apiKey, type: 'domain_ranks', export_columns: 'Dn,Rk,Or,Ot,Oc,Ad,At,Ac', domain, database: 'us' })
  const r1 = await fetch(`${BASE_URL}/?${q1}`)
  const raw1 = await r1.text()

  // Also try www. prefix
  const q2 = new URLSearchParams({ key: apiKey, type: 'domain_ranks', export_columns: 'Dn,Rk,Or,Ot,Oc,Ad,At,Ac', domain: `www.${domain}`, database: 'us' })
  const r2 = await fetch(`${BASE_URL}/?${q2}`)
  const raw2 = await r2.text()

  // domain_organic with all columns to see position change header names
  const q3 = new URLSearchParams({ key: apiKey, type: 'domain_organic', export_columns: 'Ph,Po,Pp,Pd,Nq,Cp,Ur,Tr,Co', domain, database: 'us', display_limit: '2' })
  const r3 = await fetch(`${BASE_URL}/?${q3}`)
  const raw3 = await r3.text()

  // domain_ranks_history to see date column name
  const q4 = new URLSearchParams({ key: apiKey, type: 'domain_ranks_history', export_columns: 'Dt,Or,Ot', domain, database: 'us', display_limit: '3' })
  const r4 = await fetch(`${BASE_URL}/?${q4}`)
  const raw4 = await r4.text()

  // domain_organic_organic to see competitor column names
  const q5 = new URLSearchParams({ key: apiKey, type: 'domain_organic_organic', export_columns: 'Dn,Cr,Np,Or,Ot,Oc,Ad', domain, database: 'us', display_limit: '2' })
  const r5 = await fetch(`${BASE_URL}/?${q5}`)
  const raw5 = await r5.text()

  return Response.json({
    domain_stored: domain,
    domain_ranks_raw: raw1,
    domain_ranks_status: r1.status,
    www_domain_ranks_raw: raw2,
    www_domain_ranks_status: r2.status,
    domain_organic_full_raw: raw3,
    domain_organic_full_status: r3.status,
    domain_ranks_history_raw: raw4,
    domain_ranks_history_status: r4.status,
    domain_organic_organic_raw: raw5,
    domain_organic_organic_status: r5.status,
  })
}
