import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'

const STORE_ID = '00000000-0000-0000-0000-000000000002'
const TENANT_ID = '00000000-0000-0000-0000-000000000001'

export async function DELETE() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createSupabaseServiceClient()
  await Promise.all([
    service.from('stores').update({ gsc_refresh_token: null, gsc_property_url: null }).eq('id', STORE_ID),
    service.from('gsc_keywords').delete().eq('tenant_id', TENANT_ID),
    service.from('gsc_pages').delete().eq('tenant_id', TENANT_ID),
    service.from('gsc_monthly_clicks').delete().eq('tenant_id', TENANT_ID),
  ])

  return Response.json({ ok: true })
}
