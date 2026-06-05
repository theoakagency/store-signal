import { redirect } from 'next/navigation'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'
import StyleGuideSettings from './StyleGuideSettings'

export const metadata = {
  title: 'Style Guide | Content Studio | Store Signal',
}

const STORE_ID = '00000000-0000-0000-0000-000000000002'

export default async function StyleGuidePage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createSupabaseServiceClient()

  const { data: rules } = await service
    .from('style_guide_rules')
    .select('id, category, rule, active, sort_order, created_at, updated_at')
    .eq('store_id', STORE_ID)
    .order('category')
    .order('sort_order')
    .order('created_at')

  const seedNeeded = !rules || rules.length === 0

  return (
    <StyleGuideSettings
      rules={rules ?? []}
      seedNeeded={seedNeeded}
    />
  )
}
