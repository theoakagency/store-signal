import { redirect } from 'next/navigation'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'
import ContentStudio from './ContentStudio'

export const metadata = {
  title: 'Content Studio | Store Signal',
}

const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const STORE_ID = '00000000-0000-0000-0000-000000000002'

export default async function ContentStudioPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createSupabaseServiceClient()

  const [{ data: history }, { data: productRows }, { data: profileRows }] = await Promise.all([
    service
      .from('content_generations')
      .select('id, channel, topic, product_focus, audience, tones, talking_points, versions, created_at')
      .eq('store_id', STORE_ID)
      .order('created_at', { ascending: false })
      .limit(20),

    service
      .from('product_stats')
      .select('product_title, total_revenue')
      .eq('tenant_id', TENANT_ID)
      .order('total_revenue', { ascending: false })
      .limit(10),

    service
      .from('customer_profiles')
      .select('segment')
      .eq('tenant_id', TENANT_ID)
      .not('segment', 'is', null),
  ])

  // Group profile rows into segment counts
  const segmentMap: Record<string, number> = {}
  for (const row of profileRows ?? []) {
    const seg = row.segment as string
    segmentMap[seg] = (segmentMap[seg] ?? 0) + 1
  }
  const segments = Object.entries(segmentMap)
    .map(([segment, count]) => ({ segment, count }))
    .sort((a, b) => b.count - a.count)

  // Deduplicate products by title (multiple variants share a title)
  const seenTitles = new Set<string>()
  const products: { title: string; total_revenue: number }[] = []
  for (const row of productRows ?? []) {
    if (!seenTitles.has(row.product_title)) {
      seenTitles.add(row.product_title)
      products.push({ title: row.product_title, total_revenue: Number(row.total_revenue) })
    }
  }

  return (
    <ContentStudio
      history={history ?? []}
      products={products}
      segments={segments}
    />
  )
}
