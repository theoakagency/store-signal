/**
 * GET /api/loyaltylion/debug
 * Returns 1 raw customer and 1 raw activity from LoyaltyLion API.
 * TEMPORARY — remove after field names are confirmed.
 */
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'

const STORE_ID = '00000000-0000-0000-0000-000000000002'

export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createSupabaseServiceClient()
  const { data: store } = await service.from('stores').select('loyaltylion_token').eq('id', STORE_ID).single()
  const token = (store as { loyaltylion_token: string | null } | null)?.loyaltylion_token
  if (!token) return Response.json({ error: 'Not connected' }, { status: 400 })

  const BASE = 'https://api.loyaltylion.com/v2'
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  const [custRes, actRes] = await Promise.all([
    fetch(`${BASE}/customers?per_page=1`, { headers }),
    fetch(`${BASE}/activities?per_page=1`, { headers }),
  ])

  const custJson = await custRes.json()
  const actJson = await actRes.json()

  return Response.json({ customers_response: custJson, activities_response: actJson })
}
