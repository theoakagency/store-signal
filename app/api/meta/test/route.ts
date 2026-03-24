import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { getAdAccounts } from '@/lib/meta'

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { accessToken } = await req.json() as { accessToken?: string }
  if (!accessToken) return Response.json({ error: 'Missing accessToken' }, { status: 400 })

  try {
    const accounts = await getAdAccounts(accessToken)
    return Response.json({ ok: true, accounts })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
