import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

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
