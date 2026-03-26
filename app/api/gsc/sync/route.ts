import { NextRequest } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'
import { runGscSync } from '@/lib/syncGsc'

const STORE_ID = '00000000-0000-0000-0000-000000000002'

export const maxDuration = 300

export async function GET(req: NextRequest) { return POST(req) }

export async function POST(_req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createSupabaseServiceClient()
  const { data: store } = await service
    .from('stores')
    .select('gsc_refresh_token, gsc_property_url')
    .eq('id', STORE_ID)
    .single()

  if (!store?.gsc_refresh_token) {
    return Response.json({ error: 'GSC not connected' }, { status: 400 })
  }

  const { gsc_refresh_token: refreshToken, gsc_property_url: propertyUrl } = store

  try {
    const results = await runGscSync(refreshToken, propertyUrl)
    return Response.json(results, { status: results.errors.length > 0 ? 207 : 200 })
  } catch (err) {
    const msg = (err as Error).message
    if (msg.startsWith('Auth failed:')) {
      return Response.json({ error: msg }, { status: 400 })
    }
    return Response.json({ error: msg }, { status: 500 })
  }
}
