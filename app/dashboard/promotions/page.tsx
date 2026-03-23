import { createSupabaseServerClient } from '@/lib/supabase'
import PromotionScorer from './PromotionScorer'

export const metadata = {
  title: 'Promotion Scorer — Store Signal',
}

export default async function PromotionsPage() {
  const supabase = await createSupabaseServerClient()

  const { data: history } = await supabase
    .from('promotions')
    .select('id, name, score, promotion_type, discount_type, discount_value, created_at, ai_analysis')
    .order('created_at', { ascending: false })
    .limit(20)

  return <PromotionScorer history={history ?? []} />
}
