import { NextRequest } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'

const STORE_ID = '00000000-0000-0000-0000-000000000002'

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { apiKey, domain } = await req.json() as { apiKey?: string; domain?: string }
  if (!apiKey?.trim() || !domain?.trim()) {
    return Response.json({ error: 'apiKey and domain are required' }, { status: 400 })
  }

  const service = createSupabaseServiceClient()
  const { error } = await service
    .from('stores')
    .update({ semrush_api_key: apiKey.trim(), semrush_domain: domain.trim() })
    .eq('id', STORE_ID)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
