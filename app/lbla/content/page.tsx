import { createSupabaseServiceClient } from '@/lib/supabase'
import LblaContent from './LblaContent'

export const metadata = {
  title: 'Content Generator | LashBox LA',
}

const STORE_ID = '00000000-0000-0000-0000-000000000002'

export default async function ContentPage() {
  const service = createSupabaseServiceClient()
  const { data: rules } = await service
    .from('style_guide_rules')
    .select('id')
    .eq('store_id', STORE_ID)
    .eq('active', true)
    .limit(1)

  const styleGuideConfigured = (rules?.length ?? 0) > 0

  return <LblaContent styleGuideConfigured={styleGuideConfigured} />
}
