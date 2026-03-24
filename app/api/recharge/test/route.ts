import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { testConnection } from '@/lib/recharge'

export const maxDuration = 30

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { apiToken } = await req.json() as { apiToken: string }
  if (!apiToken?.trim()) return Response.json({ error: 'API token required' }, { status: 400 })

  const result = await testConnection(apiToken.trim())
  return Response.json(result)
}
