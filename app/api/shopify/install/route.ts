import { NextRequest } from 'next/server'
import crypto from 'crypto'
import { cookies } from 'next/headers'

const CLIENT_ID = process.env.SHOPIFY_RETAIL_CLIENT_ID!
const STORE = process.env.SHOPIFY_RETAIL_STORE!

// Scopes needed for orders + customers read access
const SCOPES = 'read_orders,read_customers'

export async function GET(req: NextRequest) {
  if (!CLIENT_ID || !STORE) {
    return Response.json({ error: 'Missing Shopify env vars' }, { status: 500 })
  }

  const host = req.headers.get('host') ?? req.nextUrl.host
  const protocol = req.nextUrl.protocol ?? 'https:'
  const redirectUri = `${protocol}//${host}/api/shopify/callback`

  // CSRF nonce — verified in the callback
  const nonce = crypto.randomBytes(16).toString('hex')
  const cookieStore = await cookies()
  cookieStore.set('shopify_oauth_nonce', nonce, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/',
  })

  const authUrl = new URL(`https://${STORE}/admin/oauth/authorize`)
  authUrl.searchParams.set('client_id', CLIENT_ID)
  authUrl.searchParams.set('scope', SCOPES)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('state', nonce)
  authUrl.searchParams.set('grant_options[]', 'offline') // offline = non-expiring token

  return Response.redirect(authUrl.toString())
}
