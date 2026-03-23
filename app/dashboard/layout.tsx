import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase'
import DashboardShell from './_components/DashboardShell'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Fetch last synced time for topbar indicator
  const { data: store } = await supabase
    .from('stores')
    .select('last_synced_at')
    .eq('id', '00000000-0000-0000-0000-000000000002')
    .single()

  return (
    <DashboardShell
      userEmail={user.email ?? ''}
      lastSyncedAt={store?.last_synced_at ?? null}
    >
      {children}
    </DashboardShell>
  )
}
