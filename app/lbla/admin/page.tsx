import { requireLblaAdmin } from '@/lib/lblaAuth'
import AdminUsers from './AdminUsers'

export const metadata = {
  title: 'User Access | LBLA',
}

export default async function AdminPage() {
  const access = await requireLblaAdmin()
  return <AdminUsers callerId={access.userId} />
}
