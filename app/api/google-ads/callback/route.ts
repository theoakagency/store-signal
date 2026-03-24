import { NextRequest } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase'

const STORE_ID = '00000000-0000-0000-0000-000000000002'

interface TokenResponse {
  access_token?: string
  refresh_token?: string
  error?: string
  error_description?: string
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  const dashboardBase = '/dashboard/integrations'

  if (error || !code) {
    const msg = encodeURIComponent(error ?? 'no_code')
    return Response.redirect(new URL(`${dashboardBase}?google_ads_error=${msg}`, req.url))
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://store-signal.vercel.app'}/api/google-ads/callback`

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  const tokenData = await tokenRes.json() as TokenResponse
  if (tokenData.error || !tokenData.refresh_token) {
    const msg = encodeURIComponent(tokenData.error_description ?? tokenData.error ?? 'token_exchange_failed')
    return Response.redirect(new URL(`${dashboardBase}?google_ads_error=${msg}`, req.url))
  }

  const service = createSupabaseServiceClient()
  await service
    .from('stores')
    .update({ google_ads_refresh_token: tokenData.refresh_token })
    .eq('id', STORE_ID)

  return Response.redirect(new URL(`${dashboardBase}?google_ads_connected=1`, req.url))
}
