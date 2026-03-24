import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { testConnection } from '@/lib/loyaltylion'

export const maxDuration = 30

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { token } = await req.json() as { token: string }
  if (!token?.trim()) {
    return Response.json({ error: 'Token is required' }, { status: 400 })
  }

  const result = await testConnection(token.trim())
  return Response.json(result)
}
