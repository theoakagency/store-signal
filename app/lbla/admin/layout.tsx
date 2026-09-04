import { requireLblaAdmin } from '@/lib/lblaAuth'

// Admin-only. proxy.ts also blocks this path for non-admins; this is the
// server-side backstop for a route that hands out permissions.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireLblaAdmin()
  return <>{children}</>
}
