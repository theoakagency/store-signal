import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { toolForPagePath, toolForApiPath } from '@/lib/lblaTools'

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session tokens and gate authenticated areas.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname, search } = request.nextUrl

  // Protected page areas — the dashboard and the LBLA team tools. /lbla was
  // previously public; it is now behind the same Supabase login as /dashboard.
  const isProtectedPage =
    pathname.startsWith('/dashboard') || pathname.startsWith('/lbla')

  // Data endpoints backing the LBLA tools. These serve the same sensitive data
  // as the pages (KLL royalty, shipping margin, etc.), so gating the pages alone
  // would leave the data reachable by calling the API directly.
  const isProtectedApi =
    pathname.startsWith('/api/lbla') || pathname.startsWith('/api/skuvault')

  if (!user && (isProtectedPage || isProtectedApi)) {
    // API callers get a 401 (redirecting an API call to an HTML login page is
    // useless); page requests redirect to /login with ?next so the user lands
    // back on the page they asked for after signing in.
    if (isProtectedApi) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname + search)
    return NextResponse.redirect(loginUrl)
  }

  // ── Authorisation ─────────────────────────────────────────────────────────
  // Signed in is not the same as allowed. Admins get everything; everyone else
  // is confined to the LBLA tools explicitly granted to them.
  if (user && (isProtectedPage || isProtectedApi)) {
    // RLS on user_tenants ("users see own rows") means the user-scoped client can
    // read exactly this row and nothing else — no service key needed at the edge.
    const { data: membership } = await supabase
      .from('user_tenants')
      .select('is_admin, lbla_tools')
      .eq('user_id', user.id)
      .maybeSingle()

    const isAdmin = membership?.is_admin === true
    const grants: string[] = membership?.lbla_tools ?? []

    if (!isAdmin) {
      const denyPage = () =>
        NextResponse.redirect(new URL('/lbla', request.url))

      // The dashboard is admin-only, full stop.
      if (pathname.startsWith('/dashboard')) return denyPage()

      if (isProtectedApi) {
        const tool = toolForApiPath(pathname)
        if (!tool) {
          // Fails closed by design — but say so, because this is a wiring bug,
          // not a permissions decision about this user.
          return NextResponse.json({
            error: 'Forbidden: this API route is not mapped to a tool',
            detail: `No entry in LBLA_TOOLS.apiPrefixes matches "${pathname}". Add it to lib/lblaTools.ts to make the route reachable by non-admins.`,
            reason: 'unmapped_route',
          }, { status: 403 })
        }
        if (!grants.includes(tool.key)) {
          return NextResponse.json({
            error: `Forbidden: you do not have access to ${tool.label}`,
            reason: 'not_granted',
            tool: tool.key,
          }, { status: 403 })
        }
      } else if (pathname.startsWith('/lbla')) {
        // toolForPagePath returns null for /lbla itself, which stays open to any
        // signed-in user so there is always somewhere to land.
        const tool = toolForPagePath(pathname)
        // The admin screen manages grants, so a grant must never open it.
        if (tool?.key === 'admin') return denyPage()
        if (tool && !grants.includes(tool.key)) return denyPage()
      }
    }
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static  (static files)
     * - _next/image   (image optimisation)
     * - favicon.ico and common static assets
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
