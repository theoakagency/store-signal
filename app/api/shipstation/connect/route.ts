import { NextRequest } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'

export const maxDuration = 30

const STORE_ID = '00000000-0000-0000-0000-000000000002'

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { apiKey } = await req.json() as { apiKey: string }
  if (!apiKey?.trim()) return Response.json({ error: 'API key required' }, { status: 400 })

  const service = createSupabaseServiceClient()
  await service.from('stores').update({ shipstation_api_key: apiKey.trim() }).eq('id', STORE_ID)

  return Response.json({ ok: true })
}
