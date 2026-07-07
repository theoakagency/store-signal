import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { testConnection } from '@/lib/shipstation'

export const maxDuration = 30

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { apiKey } = await req.json() as { apiKey: string }
  if (!apiKey?.trim()) return Response.json({ error: 'API key required' }, { status: 400 })

  const result = await testConnection(apiKey.trim())
  return Response.json(result)
}
