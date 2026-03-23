import { createSupabaseServerClient } from '@/lib/supabase'
import CustomerTable from './CustomerTable'

export const metadata = {
  title: 'Customer Intelligence — Store Signal',
}

const STORE_ID = '00000000-0000-0000-0000-000000000002'

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; segment?: string }>
}) {
  const { page: pageStr, segment } = await searchParams
  const page = Math.max(1, parseInt(pageStr ?? '1', 10))
  const pageSize = 50
  const offset = (page - 1) * pageSize

  const supabase = await createSupabaseServerClient()

  // Fetch store aggregate for segment thresholds
  const { data: storeStats } = await supabase
    .from('customers')
    .select('total_spent, orders_count, updated_at')
    .eq('store_id', STORE_ID)

  const stats = storeStats ?? []
  const avgSpent = stats.length > 0
    ? stats.reduce((s, c) => s + Number(c.total_spent), 0) / stats.length
    : 0
  const vipThreshold = avgSpent * 2.5
  const activeThreshold = 90 // days

  const now = Date.now()

  // Build segment filter
  let query = supabase
    .from('customers')
    .select('*', { count: 'exact' })
    .eq('store_id', STORE_ID)
    .order('total_spent', { ascending: false })
    .range(offset, offset + pageSize - 1)

  const { data: customers, count } = await query

  const totalPages = Math.ceil((count ?? 0) / pageSize)

  // Classify each customer into a segment
  function classify(c: { total_spent: number; orders_count: number; updated_at: string }) {
    const daysSinceUpdate = (now - new Date(c.updated_at).getTime()) / 86400000
    if (c.orders_count === 0) return 'new'
    if (Number(c.total_spent) >= vipThreshold) return 'vip'
    if (daysSinceUpdate < activeThreshold) return 'active'
    if (daysSinceUpdate < 180) return 'at_risk'
    return 'lapsed'
  }

  const classified = (customers ?? []).map((c) => ({
    ...c,
    segment: classify(c),
  }))

  // Segment counts for the filter tabs
  const segmentCounts = stats.reduce(
    (acc, c) => {
      const daysSince = (now - new Date(c.updated_at).getTime()) / 86400000
      let seg = 'lapsed'
      if (c.orders_count === 0) seg = 'new'
      else if (Number(c.total_spent) >= vipThreshold) seg = 'vip'
      else if (daysSince < activeThreshold) seg = 'active'
      else if (daysSince < 180) seg = 'at_risk'
      acc[seg] = (acc[seg] ?? 0) + 1
      return acc
    },
    {} as Record<string, number>
  )

  return (
    <CustomerTable
      customers={classified}
      page={page}
      totalPages={totalPages}
      totalCount={count ?? 0}
      segmentCounts={segmentCounts}
    />
  )
}
