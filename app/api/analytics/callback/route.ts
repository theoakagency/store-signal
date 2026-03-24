import { NextRequest } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { exchangeCode, APP_URL } from '@/lib/analytics'

const STORE_ID = '00000000-0000-0000-0000-000000000002'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  if (error || !code || !state) {
    const msg = encodeURIComponent(error ?? 'OAuth cancelled or failed')
    return Response.redirect(`${APP_URL}/dashboard/integrations?ga4_error=${msg}`)
  }

  let propertyId: string
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString())
    propertyId = decoded.propertyId
  } catch {
    return Response.redirect(`${APP_URL}/dashboard/integrations?ga4_error=invalid_state`)
  }

  try {
    const tokens = await exchangeCode(code)
    const service = createSupabaseServiceClient()
    await service
      .from('stores')
      .update({ ga4_refresh_token: tokens.refresh_token, ga4_property_id: propertyId })
      .eq('id', STORE_ID)
    return Response.redirect(`${APP_URL}/dashboard/integrations?ga4_connected=1`)
  } catch (err) {
    const msg = encodeURIComponent((err as Error).message)
    return Response.redirect(`${APP_URL}/dashboard/integrations?ga4_error=${msg}`)
  }
}
