import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

const CLIENT_ID = process.env.SHOPIFY_RETAIL_CLIENT_ID!
const STORE = process.env.SHOPIFY_RETAIL_STORE!

const SCOPES = 'read_orders,read_customers'

export async function GET(req: NextRequest) {
  if (!CLIENT_ID || !STORE) {
    return Response.json({ error: 'Missing Shopify env vars' }, { status: 500 })
  }

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
  response.cookies.set('shopify_oauth_nonce', nonce, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })

  return response
}
