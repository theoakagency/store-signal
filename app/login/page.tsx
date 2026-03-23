import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase'
import LoginForm from './LoginForm'

export const metadata = {
  title: 'Sign in — Store Signal',
}

export default async function LoginPage() {
  // Already authenticated → go straight to dashboard
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) redirect('/dashboard')

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo / wordmark */}
        <div className="mb-8 text-center">
          <span className="inline-block text-2xl font-bold tracking-tight text-gray-900">
            Store<span className="text-indigo-600">Signal</span>
          </span>
          <p className="mt-1 text-sm text-gray-500">Business intelligence for Shopify</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-gray-200 bg-white px-8 py-8 shadow-sm">
          <h1 className="mb-6 text-lg font-semibold text-gray-900">Sign in to your account</h1>
          <LoginForm />
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          LashBox LA &mdash; Powered by Store Signal
        </p>
      </div>
    </main>
  )
}
