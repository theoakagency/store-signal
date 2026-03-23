import { NextRequest } from 'next/server'
import { getAccount } from '@/lib/klaviyo'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'

const STORE_ID = '00000000-0000-0000-0000-000000000002'

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { apiKey, accountId } = await req.json()
  if (!apiKey?.trim()) {
    return Response.json({ error: 'API key is required' }, { status: 400 })
  }

  // Verify the key before saving
  let resolvedAccountId = accountId?.trim() || null
  try {
    const account = await getAccount(apiKey.trim())
    if (!resolvedAccountId) resolvedAccountId = account.id
  } catch (err) {
    return Response.json({ error: `Invalid API key: ${(err as Error).message}` }, { status: 401 })
  }

  // Persist credentials — Supabase encrypts data at rest (AES-256)
  const service = createSupabaseServiceClient()
  const { error } = await service
    .from('stores')
    .update({
      klaviyo_api_key: apiKey.trim(),
      klaviyo_account_id: resolvedAccountId,
    })
    .eq('id', STORE_ID)

  if (error) {
    return Response.json({ error: `Failed to save credentials: ${error.message}` }, { status: 500 })
  }

  return Response.json({ success: true, account_id: resolvedAccountId })
}

export async function DELETE(_req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createSupabaseServiceClient()
  await service
    .from('stores')
    .update({ klaviyo_api_key: null, klaviyo_account_id: null })
    .eq('id', STORE_ID)

  return Response.json({ success: true })
}
