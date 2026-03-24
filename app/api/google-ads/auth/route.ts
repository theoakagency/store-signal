import { NextRequest } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase'

const STORE_ID = '00000000-0000-0000-0000-000000000002'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const customerId = searchParams.get('customer_id')
  const developerToken = searchParams.get('developer_token')

  if (!customerId || !developerToken) {
    return Response.redirect(new URL('/dashboard/integrations?google_ads_error=missing_params', req.url))
  }

  // Temporarily store the customer_id and developer_token in the DB so the callback can retrieve them
  const service = createSupabaseServiceClient()
  await service
    .from('stores')
    .update({
      google_ads_customer_id: customerId.replace(/-/g, ''),
      google_ads_developer_token: developerToken,
    })
    .eq('id', STORE_ID)

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://store-signal.vercel.app'}/api/google-ads/callback`
  const scope = [
    'https://www.googleapis.com/auth/adwords',
  ].join(' ')

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope,
    access_type: 'offline',
    prompt: 'consent',
  })

  return Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
}
