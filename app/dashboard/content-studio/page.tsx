import { redirect } from 'next/navigation'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'
import ContentStudio from './ContentStudio'

export const metadata = {
  title: 'Content Studio | Store Signal',
}

const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const STORE_ID = '00000000-0000-0000-0000-000000000002'

// Mirrors Shopify's handle generation algorithm.
// NOTE: product_stats has no handle column so we derive it.
// Known edge cases to verify manually against actual Shopify URLs:
//   "FAVORITE - Cashmere FauxMink..."  → favorite-cashmere-fauxmink-...
//   "OMega - Fast Lash Extension..."   → omega-fast-lash-extension-...
//   "Pretty Little Y's - YY, Fairy..." → pretty-little-y-s-yy-fairy-...
function titleToHandle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export default async function ContentStudioPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createSupabaseServiceClient()

  const [{ data: history }, { data: productRows }] = await Promise.all([
    service
      .from('content_generations')
      .select('id, channel, topic, product_focus, audience, custom_audience, tones, talking_points, versions, created_at')
      .eq('store_id', STORE_ID)
      .order('created_at', { ascending: false })
      .limit(20),

    service
      .from('product_stats')
      .select('product_title, total_revenue')
      .eq('tenant_id', TENANT_ID)
      .gt('revenue_90d', 0)
      .not('product_title', 'ilike', '%return%')
      .not('product_title', 'ilike', '%protection%')
      .not('product_title', 'ilike', '%package%')
      .not('product_title', 'ilike', '%shipping%')
      .not('product_title', 'ilike', '%insurance%')
      .order('total_revenue', { ascending: false }),
  ])

  // Deduplicate products by title (multiple variants share a title)
  const seenTitles = new Set<string>()
  const products: { title: string; handle: string }[] = []
  for (const row of productRows ?? []) {
    if (!seenTitles.has(row.product_title)) {
      seenTitles.add(row.product_title)
      products.push({ title: row.product_title, handle: titleToHandle(row.product_title) })
    }
  }

  return (
    <ContentStudio
      history={history ?? []}
      products={products}
    />
  )
}
