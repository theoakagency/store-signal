import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase'
import ChatInterface from './ChatInterface'

export const metadata = { title: 'AI Chat — Store Signal' }

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { q } = await searchParams

  return <ChatInterface initialQuestion={q} />
}
