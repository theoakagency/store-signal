'use client'

import { useActionState } from 'react'
import { signIn } from '@/app/actions/auth'

export default function LoginForm() {
  const [state, action, isPending] = useActionState(signIn, null)

  const inputCls =
    'w-full rounded-lg border border-white/[0.12] bg-charcoal px-3.5 py-2.5 text-sm text-cream placeholder:text-cream/30 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal transition'

  return (
    <form action={action} className="flex flex-col gap-4">
      {state?.error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {state.error}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-xs font-medium text-cream/60">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          className={inputCls}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-xs font-medium text-cream/60">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
          className={inputCls}
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="mt-1 rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-dark focus:outline-none focus:ring-2 focus:ring-teal focus:ring-offset-2 focus:ring-offset-charcoal-800 disabled:opacity-60 disabled:cursor-not-allowed transition"
      >
        {isPending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
