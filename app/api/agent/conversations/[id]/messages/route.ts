/**
 * GET /api/agent/conversations/[id]/messages
 * Returns messages for a conversation, paginated from oldest first.
 */
import { NextRequest } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const service = createSupabaseServiceClient()

  const { data } = await service
    .from('messages')
    .select('id, role, content, created_at')
    .eq('conversation_id', id)
    .eq('tenant_id', TENANT_ID)
    .order('created_at', { ascending: true })
    .limit(100)

  return Response.json({ messages: data ?? [] })
}
