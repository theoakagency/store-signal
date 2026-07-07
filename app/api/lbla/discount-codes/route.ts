import { NextRequest } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase'

// Public endpoint — no user auth required (LBLA team tool)

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

const VALID_MATCH_TYPES = ['exact', 'prefix'] as const
type MatchType = typeof VALID_MATCH_TYPES[number]

// ── GET — list all allowed discount codes ────────────────────────────────────

export async function GET() {
  const service = createSupabaseServiceClient()

  const { data: codes, error } = await service
    .from('allowed_discount_codes')
    .select('id, code_pattern, match_type, kit_eligible, category, notes, created_at')
    .eq('tenant_id', TENANT_ID)
    .order('created_at')

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ codes: codes ?? [] })
}

// ── POST — add a code ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { code_pattern, match_type, kit_eligible, category, notes } = body as {
    code_pattern?: string
    match_type?: string
    kit_eligible?: boolean
    category?: string | null
    notes?: string | null
  }

  if (!code_pattern?.trim()) {
    return Response.json({ error: 'code_pattern is required' }, { status: 400 })
  }
  if (!VALID_MATCH_TYPES.includes(match_type as MatchType)) {
    return Response.json({ error: 'match_type must be "exact" or "prefix"' }, { status: 400 })
  }
  if (typeof kit_eligible !== 'boolean') {
    return Response.json({ error: 'kit_eligible must be true or false' }, { status: 400 })
  }

  const service = createSupabaseServiceClient()

  const { data: inserted, error } = await service
    .from('allowed_discount_codes')
    .insert({
      tenant_id: TENANT_ID,
      code_pattern: code_pattern.trim().toUpperCase(),
      match_type,
      kit_eligible,
      category: category?.trim() || null,
      notes: notes?.trim() || null,
    })
    .select('id, code_pattern, match_type, kit_eligible, category, notes, created_at')
    .single()

  if (error) {
    if (error.code === '23505') {
      return Response.json({ error: `"${code_pattern.trim().toUpperCase()}" is already on the list` }, { status: 409 })
    }
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ code: inserted })
}
