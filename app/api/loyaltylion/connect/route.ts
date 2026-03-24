import { NextRequest } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'

export const maxDuration = 30

const STORE_ID = '00000000-0000-0000-0000-000000000002'

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { token, secret } = await req.json() as { token: string; secret: string }
  if (!token?.trim() || !secret?.trim()) {
    return Response.json({ error: 'Token and secret are required' }, { status: 400 })
  }

  const service = createSupabaseServiceClient()
  await service.from('stores').update({
    loyaltylion_token: token.trim(),
    loyaltylion_secret: secret.trim(),
  }).eq('id', STORE_ID)

  return Response.json({ ok: true })
}
