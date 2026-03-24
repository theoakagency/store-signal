/**
 * GET  /api/agent/conversations — list conversations
 * DELETE /api/agent/conversations?id=<uuid> — delete a conversation
 */
import { NextRequest } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createSupabaseServiceClient()
  const { data } = await service
    .from('conversations')
    .select('id, title, created_at, updated_at')
    .eq('tenant_id', TENANT_ID)
    .order('updated_at', { ascending: false })
    .limit(50)

  return Response.json({ conversations: data ?? [] })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const id = searchParams.get('id')
  if (!id) return Response.json({ error: 'id required' }, { status: 400 })

  const service = createSupabaseServiceClient()
  await service.from('conversations').delete().eq('id', id).eq('tenant_id', TENANT_ID)
  return Response.json({ ok: true })
}

export async function PATCH(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, title } = (await req.json()) as { id: string; title: string }
  if (!id || !title) return Response.json({ error: 'id and title required' }, { status: 400 })

  const service = createSupabaseServiceClient()
  await service.from('conversations').update({ title }).eq('id', id).eq('tenant_id', TENANT_ID)
  return Response.json({ ok: true })
}
