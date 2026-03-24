import { NextRequest } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'
import { getAdAccounts } from '@/lib/meta'

const STORE_ID = '00000000-0000-0000-0000-000000000002'

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { accessToken, adAccountId } = await req.json() as { accessToken?: string; adAccountId?: string }
  if (!accessToken || !adAccountId) {
    return Response.json({ error: 'Missing accessToken or adAccountId' }, { status: 400 })
  }

  // Validate the token by fetching ad accounts
  try {
    const accounts = await getAdAccounts(accessToken)
    const normalizedId = adAccountId.replace(/^act_/, '')
    const matched = accounts.find((a) => a.id === `act_${normalizedId}` || a.id === normalizedId)
    if (!matched && accounts.length > 0) {
      return Response.json({ error: `Ad account ${adAccountId} not found on this token. Available: ${accounts.map((a) => a.id).join(', ')}` }, { status: 400 })
    }

    const service = createSupabaseServiceClient()
    await service
      .from('stores')
      .update({
        meta_access_token: accessToken,
        meta_ad_account_id: adAccountId,
      })
      .eq('id', STORE_ID)

    return Response.json({ ok: true, account_name: matched?.name ?? adAccountId })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
