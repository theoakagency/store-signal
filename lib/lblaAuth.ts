import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase'

export interface LblaAccess {
  userId: string
  email: string
  isAdmin: boolean
  tools: string[]
}

/**
 * Resolve the signed-in user's LBLA access. Redirects to /login when there is no
 * session. Returns admin status plus the granted tool keys.
 */
export async function getLblaAccess(): Promise<LblaAccess> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // RLS restricts this to the caller's own membership row.
  const { data: membership } = await supabase
    .from('user_tenants')
    .select('is_admin, lbla_tools')
    .eq('user_id', user.id)
    .maybeSingle()

  return {
    userId: user.id,
    email: user.email ?? '',
    isAdmin: membership?.is_admin === true,
    tools: membership?.lbla_tools ?? [],
  }
}

/**
 * Defense in depth for a gated page: middleware already blocks unauthorised
 * paths, but each page re-checks so a middleware matcher gap or a direct render
 * never exposes a tool. Redirects to /lbla when the tool is not granted.
 */
export async function requireLblaTool(toolKey: string): Promise<LblaAccess> {
  const access = await getLblaAccess()
  if (!access.isAdmin && !access.tools.includes(toolKey)) redirect('/lbla')
  return access
}

/**
 * Admin-only guard. `is_admin` is deliberately NOT satisfiable by an lbla_tools
 * grant — the admin screen edits grants, so a grant must not be able to open it.
 */
export async function requireLblaAdmin(): Promise<LblaAccess> {
  const access = await getLblaAccess()
  if (!access.isAdmin) redirect('/lbla')
  return access
}
