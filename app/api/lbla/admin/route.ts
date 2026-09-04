import { NextRequest } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'
import { GRANTABLE_TOOL_KEYS } from '@/lib/lblaTools'

// Admin-only user access management. Middleware gates the path, but every
// handler re-verifies the caller server-side — middleware is a convenience, not
// the security boundary for a route that hands out permissions.

export const maxDuration = 30

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

export interface AdminUserRow {
  userId: string
  email: string
  isAdmin: boolean
  tools: string[]
  /** False when the user exists in auth.users but has no user_tenants row. */
  hasMembership: boolean
  createdAt: string
}

/** Returns the caller's id when they are an admin, otherwise an error Response. */
async function requireAdminCaller(): Promise<{ userId: string } | Response> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('user_tenants')
    .select('is_admin')
    .eq('user_id', user.id)
    .maybeSingle()

  if (membership?.is_admin !== true) {
    return Response.json({ error: 'Forbidden: admin access required' }, { status: 403 })
  }
  return { userId: user.id }
}

export async function GET() {
  const caller = await requireAdminCaller()
  if (caller instanceof Response) return caller

  const service = createSupabaseServiceClient()

  // auth.users is not exposed through PostgREST, so list via the admin API.
  const { data: authData, error: authErr } = await service.auth.admin.listUsers({ perPage: 1000 })
  if (authErr) {
    return Response.json({ error: `Could not list users: ${authErr.message}` }, { status: 500 })
  }

  const { data: memberships, error: memErr } = await service
    .from('user_tenants')
    .select('user_id, is_admin, lbla_tools')
    .eq('tenant_id', TENANT_ID)

  if (memErr) {
    return Response.json({ error: `Could not load memberships: ${memErr.message}` }, { status: 500 })
  }

  const byUserId = new Map((memberships ?? []).map((m) => [m.user_id, m]))

  // Every auth user is listed, including those with no membership row — that is
  // exactly what a freshly created account looks like, and it would otherwise be
  // invisible here.
  const users: AdminUserRow[] = authData.users.map((u) => {
    const m = byUserId.get(u.id)
    return {
      userId: u.id,
      email: u.email ?? '(no email)',
      isAdmin: m?.is_admin === true,
      tools: m?.lbla_tools ?? [],
      hasMembership: !!m,
      createdAt: u.created_at,
    }
  }).sort((a, b) => a.email.localeCompare(b.email))

  return Response.json({ users, callerId: caller.userId })
}

export async function PATCH(req: NextRequest) {
  const caller = await requireAdminCaller()
  if (caller instanceof Response) return caller

  const body = await req.json() as {
    userId?: string
    isAdmin?: boolean
    tools?: string[]
  }

  const { userId, isAdmin, tools } = body
  if (!userId) {
    return Response.json({ error: 'userId is required' }, { status: 400 })
  }

  // An admin cannot drop their own admin flag: the realistic lockout is the last
  // admin demoting themselves, after which nobody can reach this screen at all.
  if (userId === caller.userId && isAdmin === false) {
    return Response.json({
      error: 'You cannot remove your own admin access. Ask another admin to do it.',
    }, { status: 400 })
  }

  // Rejects 'admin' too: it is not grantable, so storing it would be misleading.
  if (tools && tools.some((t) => !GRANTABLE_TOOL_KEYS.includes(t))) {
    return Response.json({ error: 'Unknown or non-grantable tool key' }, { status: 400 })
  }

  const service = createSupabaseServiceClient()

  // Confirm the user actually exists before creating a membership for them.
  const { data: target, error: lookupErr } = await service.auth.admin.getUserById(userId)
  if (lookupErr || !target?.user) {
    return Response.json({ error: 'No such user' }, { status: 404 })
  }

  const { data: existing } = await service
    .from('user_tenants')
    .select('user_id, is_admin, lbla_tools')
    .eq('tenant_id', TENANT_ID)
    .eq('user_id', userId)
    .maybeSingle()

  // Upsert doubles as "create the membership row" for a new account.
  const row = {
    user_id:    userId,
    tenant_id:  TENANT_ID,
    is_admin:   isAdmin ?? existing?.is_admin ?? false,
    lbla_tools: tools   ?? existing?.lbla_tools ?? [],
  }

  const { error: writeErr } = await service
    .from('user_tenants')
    .upsert(row, { onConflict: 'user_id,tenant_id' })

  if (writeErr) {
    return Response.json({ error: `Could not save: ${writeErr.message}` }, { status: 500 })
  }

  return Response.json({
    success: true,
    user: {
      userId,
      email: target.user.email ?? '(no email)',
      isAdmin: row.is_admin,
      tools: row.lbla_tools,
      hasMembership: true,
    },
  })
}
