import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'

export async function DELETE() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createSupabaseServiceClient()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const { count } = await service
    .from('cron_logs')
    .delete({ count: 'exact' })
    .lt('started_at', thirtyDaysAgo)

  return Response.json({ deleted: count ?? 0 })
}
