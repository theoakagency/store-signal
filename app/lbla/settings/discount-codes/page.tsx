import { createSupabaseServiceClient } from '@/lib/supabase'
import DiscountCodesSettings from './DiscountCodesSettings'

export const metadata = {
  title: 'Discount Codes | LBLA',
}

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

export default async function DiscountCodesPage() {
  const service = createSupabaseServiceClient()

  const { data: codes } = await service
    .from('allowed_discount_codes')
    .select('id, code_pattern, match_type, kit_eligible, category, notes, created_at')
    .eq('tenant_id', TENANT_ID)
    .order('created_at')

  return <DiscountCodesSettings codes={codes ?? []} />
}
