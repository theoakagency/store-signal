import { createSupabaseServiceClient } from '@/lib/supabase'
import LblaContent, { type GenerationLogRow } from './LblaContent'

export const metadata = {
  title: 'Content Generator | LBLA',
}

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

function titleToHandle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export default async function ContentPage() {
  const service = createSupabaseServiceClient()

  const [{ data: productRows }, { data: historyRows }] = await Promise.all([
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

    service
      .from('lbla_generation_log')
      .select('id, channel, content_type, topic, product_focus, audience, tones, talking_points, output, generated_at')
      .eq('tenant_id', TENANT_ID)
      .order('generated_at', { ascending: false })
      .limit(10),
  ])

  const seenTitles = new Set<string>()
  const products: { title: string; handle: string }[] = []
  for (const row of productRows ?? []) {
    if (!seenTitles.has(row.product_title)) {
      seenTitles.add(row.product_title)
      products.push({ title: row.product_title, handle: titleToHandle(row.product_title) })
    }
  }

  return (
    <LblaContent
      products={products}
      history={(historyRows ?? []) as GenerationLogRow[]}
    />
  )
}
