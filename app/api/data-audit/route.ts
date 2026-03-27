import { NextRequest } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    tenant_id: string
    platform: string
    metric_name: string
    time_window: string
    expected_value: string
    actual_value: string
    match: boolean
    tolerance_note: string | null
    discrepancy_note: string | null
    verified_by: string
    notes: string | null
  }

  const service = createSupabaseServiceClient()
  const { data, error } = await service
    .from('data_audit_log')
    .insert({
      tenant_id: body.tenant_id,
      platform: body.platform,
      metric_name: body.metric_name,
      time_window: body.time_window,
      expected_value: body.expected_value,
      actual_value: body.actual_value,
      match: body.match,
      tolerance_note: body.tolerance_note,
      discrepancy_note: body.discrepancy_note,
      verified_by: body.verified_by,
      notes: body.notes,
    })
    .select('id, platform, metric_name, time_window, expected_value, actual_value, match, tolerance_note, discrepancy_note, verified_by, verified_at, notes')
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ entry: data })
}
