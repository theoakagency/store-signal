import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { testConnection } from '@/lib/semrush'

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { apiKey, domain } = await req.json() as { apiKey?: string; domain?: string }
  if (!apiKey?.trim() || !domain?.trim()) {
    return Response.json({ error: 'apiKey and domain are required' }, { status: 400 })
  }

  const result = await testConnection(apiKey.trim(), domain.trim())
  return Response.json(result)
}
