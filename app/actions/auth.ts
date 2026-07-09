'use server'

import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase'

// Only allow same-origin relative paths as a post-login destination — never an
// absolute/protocol-relative URL — so ?next can't be used as an open redirect.
function safeNext(next: FormDataEntryValue | null): string {
  const value = typeof next === 'string' ? next : ''
  if (value.startsWith('/') && !value.startsWith('//')) return value
  return '/dashboard'
}

export async function signIn(
  _prevState: { error: string } | null,
  formData: FormData
): Promise<{ error: string }> {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const next = safeNext(formData.get('next'))

  if (!email || !password) {
    return { error: 'Email and password are required.' }
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { error: error.message }
  }

  redirect(next)
}
