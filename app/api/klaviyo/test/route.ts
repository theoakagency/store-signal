import { NextRequest } from 'next/server'
import { getAccount } from '@/lib/klaviyo'
import { createSupabaseServerClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { apiKey } = await req.json()
  if (!apiKey?.trim()) {
    return Response.json({ error: 'API key is required' }, { status: 400 })
  }

  try {
    const account = await getAccount(apiKey.trim())
    return Response.json({
      success: true,
      account_id: account.id,
      org_name: account.attributes.contact_information.organization_name,
      currency: account.attributes.preferred_currency,
      timezone: account.attributes.timezone,
    })
  } catch (err) {
    const msg = (err as Error).message
    if (msg.includes('401') || msg.includes('403')) {
      return Response.json({ error: 'Invalid API key — check your Klaviyo Private API key' }, { status: 401 })
    }
    return Response.json({ error: `Connection failed: ${msg}` }, { status: 502 })
  }
}
