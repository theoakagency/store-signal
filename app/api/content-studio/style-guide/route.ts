import { NextRequest } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'

const STORE_ID = '00000000-0000-0000-0000-000000000002'

const VALID_CATEGORIES = ['avoid', 'enforce', 'vocabulary', 'examples'] as const
type Category = typeof VALID_CATEGORIES[number]

async function getAuthedService(req?: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null, service: null }
  return { user, service: createSupabaseServiceClient() }
}

// ── GET — list all rules ──────────────────────────────────────────────────────

export async function GET() {
  const { user, service } = await getAuthedService()
  if (!user || !service) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: rules, error } = await service
    .from('style_guide_rules')
    .select('id, category, rule, active, sort_order, created_at, updated_at')
    .eq('store_id', STORE_ID)
    .order('category')
    .order('sort_order')
    .order('created_at')

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ rules: rules ?? [] })
}

// ── POST — add a rule ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { user, service } = await getAuthedService(req)
  if (!user || !service) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { category, rule } = body as { category: string; rule: string }

  if (!VALID_CATEGORIES.includes(category as Category)) {
    return Response.json({ error: 'Invalid category' }, { status: 400 })
  }
  if (!rule || typeof rule !== 'string' || rule.trim().length === 0) {
    return Response.json({ error: 'rule is required' }, { status: 400 })
  }
  if (rule.trim().length > 500) {
    return Response.json({ error: 'rule must be under 500 characters' }, { status: 400 })
  }

  // Max sort_order for this category
  const { data: existing } = await service
    .from('style_guide_rules')
    .select('sort_order')
    .eq('store_id', STORE_ID)
    .eq('category', category)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextOrder = existing ? (existing.sort_order + 1) : 0

  const { data: inserted, error } = await service
    .from('style_guide_rules')
    .insert({
      store_id:   STORE_ID,
      category,
      rule:       rule.trim(),
      sort_order: nextOrder,
    })
    .select('id, category, rule, active, sort_order, created_at, updated_at')
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ rule: inserted })
}

// ── DELETE — remove a rule ────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const { user, service } = await getAuthedService(req)
  if (!user || !service) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { id } = body as { id: string }
  if (!id) return Response.json({ error: 'id is required' }, { status: 400 })

  // Verify ownership before deleting
  const { data: existing } = await service
    .from('style_guide_rules')
    .select('id')
    .eq('id', id)
    .eq('store_id', STORE_ID)
    .maybeSingle()

  if (!existing) return Response.json({ error: 'Rule not found' }, { status: 404 })

  const { error } = await service
    .from('style_guide_rules')
    .delete()
    .eq('id', id)

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ success: true })
}

// ── PATCH — update active or rule text ───────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const { user, service } = await getAuthedService(req)
  if (!user || !service) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { id, active, rule } = body as { id: string; active?: boolean; rule?: string }
  if (!id) return Response.json({ error: 'id is required' }, { status: 400 })

  // Verify ownership
  const { data: existing } = await service
    .from('style_guide_rules')
    .select('id')
    .eq('id', id)
    .eq('store_id', STORE_ID)
    .maybeSingle()

  if (!existing) return Response.json({ error: 'Rule not found' }, { status: 404 })

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (active !== undefined) updates.active = active
  if (rule !== undefined) {
    if (rule.trim().length === 0) return Response.json({ error: 'rule cannot be empty' }, { status: 400 })
    if (rule.trim().length > 500) return Response.json({ error: 'rule must be under 500 characters' }, { status: 400 })
    updates.rule = rule.trim()
  }

  const { data: updated, error } = await service
    .from('style_guide_rules')
    .update(updates)
    .eq('id', id)
    .select('id, category, rule, active, sort_order, created_at, updated_at')
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ rule: updated })
}
