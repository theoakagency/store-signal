import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase'
import LoginForm from './LoginForm'

export const metadata = {
  title: 'Sign in — Store Signal',
}

function safeNext(next: string | undefined): string {
  if (next && next.startsWith('/') && !next.startsWith('//')) return next
  return '/dashboard'
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const next = safeNext((await searchParams).next)

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) redirect(next)

  return (
    <main className="min-h-screen bg-charcoal flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <span className="font-display text-3xl font-semibold text-cream">
            LBLA
          </span>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-white/[0.08] bg-charcoal-800 px-8 py-8 shadow-xl">
          <h1 className="mb-6 font-display text-lg font-semibold text-cream">Sign in to your account</h1>
          <LoginForm next={next} />
        </div>

        <p className="mt-6 text-center font-data text-xs text-cream/30">
          LashBox LA &mdash; Powered by Store Signal
        </p>
      </div>
    </main>
  )
}
