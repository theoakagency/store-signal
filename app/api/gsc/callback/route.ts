import { NextRequest } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { exchangeCode, APP_URL } from '@/lib/gsc'

const STORE_ID = '00000000-0000-0000-0000-000000000002'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  if (error || !code || !state) {
    const msg = error ?? 'Missing code or state'
    return Response.redirect(`${APP_URL}/dashboard/integrations?gsc_error=${encodeURIComponent(msg)}`)
  }

  let property: string
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString())
    property = decoded.property
  } catch {
    return Response.redirect(`${APP_URL}/dashboard/integrations?gsc_error=invalid_state`)
  }

  try {
    const tokens = await exchangeCode(code)
    const service = createSupabaseServiceClient()

    await service
      .from('stores')
      .update({
        gsc_refresh_token: tokens.refresh_token,
        gsc_property_url: property,
      })
      .eq('id', STORE_ID)

    return Response.redirect(`${APP_URL}/dashboard/integrations?gsc_connected=1`)
  } catch (err) {
    const msg = (err as Error).message
    return Response.redirect(`${APP_URL}/dashboard/integrations?gsc_error=${encodeURIComponent(msg)}`)
  }
}
