/**
 * GET /api/shopify/reauth
 * Authenticated route that re-initiates the Shopify OAuth flow to refresh
 * the stored access token with updated scopes (e.g. read_all_orders).
 * Requires the user to be logged into Store Signal first.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import crypto from 'crypto'

const CLIENT_ID = (process.env.SHOPIFY_RETAIL_CLIENT_ID ?? '').trim()
const STORE = (process.env.SHOPIFY_RETAIL_STORE ?? '').trim()
const SCOPES = 'read_orders,read_all_orders,read_customers'

export async function GET(req: NextRequest) {
  // Require Store Signal authentication
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  if (!CLIENT_ID || !STORE) {
    return Response.json({ error: 'Missing SHOPIFY_RETAIL_CLIENT_ID or SHOPIFY_RETAIL_STORE env vars' }, { status: 500 })
  }

  // Use the app URL as redirect — same callback as the install flow
  const host = req.headers.get('host') ?? req.nextUrl.host
  const redirectUri = `https://${host}/api/shopify/callback`

  const nonce = crypto.randomBytes(16).toString('hex')

  const authUrl = new URL(`https://${STORE}/admin/oauth/authorize`)
  authUrl.searchParams.set('client_id', CLIENT_ID)
  authUrl.searchParams.set('scope', SCOPES)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('state', nonce)
  authUrl.searchParams.set('grant_options[]', 'offline')

  const response = NextResponse.redirect(authUrl.toString())
  // Reuse the same nonce cookie that the callback validates
  response.cookies.set('shopify_oauth_nonce', nonce, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })

  return response
}
