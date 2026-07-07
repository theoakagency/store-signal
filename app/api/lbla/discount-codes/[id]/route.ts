import { NextRequest } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase'

// Public endpoint — no user auth required (LBLA team tool)

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

const VALID_MATCH_TYPES = ['exact', 'prefix'] as const
type MatchType = typeof VALID_MATCH_TYPES[number]

// ── PATCH — update a code ─────────────────────────────────────────────────────

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const { code_pattern, match_type, kit_eligible, category, notes } = body as {
    code_pattern?: string
    match_type?: string
    kit_eligible?: boolean
    category?: string | null
    notes?: string | null
  }

  const updates: Record<string, unknown> = {}
  if (code_pattern !== undefined) {
    if (!code_pattern.trim()) return Response.json({ error: 'code_pattern cannot be empty' }, { status: 400 })
    updates.code_pattern = code_pattern.trim().toUpperCase()
  }
  if (match_type !== undefined) {
    if (!VALID_MATCH_TYPES.includes(match_type as MatchType)) {
      return Response.json({ error: 'match_type must be "exact" or "prefix"' }, { status: 400 })
    }
    updates.match_type = match_type
  }
  if (kit_eligible !== undefined) {
    if (typeof kit_eligible !== 'boolean') return Response.json({ error: 'kit_eligible must be true or false' }, { status: 400 })
    updates.kit_eligible = kit_eligible
  }
  if (category !== undefined) updates.category = category?.trim() || null
  if (notes !== undefined) updates.notes = notes?.trim() || null

  const service = createSupabaseServiceClient()

  const { data: updated, error } = await service
    .from('allowed_discount_codes')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', TENANT_ID)
    .select('id, code_pattern, match_type, kit_eligible, category, notes, created_at')
    .single()

  if (error) {
    if (error.code === '23505') {
      return Response.json({ error: 'That code pattern is already on the list' }, { status: 409 })
    }
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ code: updated })
}

// ── DELETE — remove a code ────────────────────────────────────────────────────

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const service = createSupabaseServiceClient()

  const { error } = await service
    .from('allowed_discount_codes')
    .delete()
    .eq('id', id)
    .eq('tenant_id', TENANT_ID)

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ success: true })
}
