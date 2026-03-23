import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createSupabaseServiceClient } from '@/lib/supabase'

const CLIENT_ID = process.env.SHOPIFY_RETAIL_CLIENT_ID!
const CLIENT_SECRET = process.env.SHOPIFY_RETAIL_CLIENT_SECRET!
const STORE = process.env.SHOPIFY_RETAIL_STORE!
const STORE_ID = '00000000-0000-0000-0000-000000000002'

// ── HMAC verification ─────────────────────────────────────────────────────────

function verifyHmac(searchParams: URLSearchParams): boolean {
  const hmac = searchParams.get('hmac')
  if (!hmac) return false

  const pairs: string[] = []
  searchParams.forEach((value, key) => {
    if (key !== 'hmac') {
      pairs.push(
        `${key.replace(/%/g, '%25').replace(/&/g, '%26')}=${value
          .replace(/%/g, '%25')
          .replace(/&/g, '%26')}`
      )
    }
  })
  pairs.sort()

  const digest = crypto
    .createHmac('sha256', CLIENT_SECRET)
    .update(pairs.join('&'))
    .digest('hex')

  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmac))
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl

  // 1. Verify HMAC signature
  if (!verifyHmac(searchParams)) {
    return Response.json({ error: 'Invalid HMAC — request may be forged' }, { status: 401 })
  }

  // 2. Verify CSRF nonce — read directly from the incoming request cookies
  const returnedState = searchParams.get('state')
  const savedNonce = req.cookies.get('shopify_oauth_nonce')?.value

  if (!returnedState || !savedNonce || returnedState !== savedNonce) {
    return Response.json({ error: 'State mismatch — possible CSRF' }, { status: 401 })
  }

  // 3. Exchange the one-time code for an offline access token
  const code = searchParams.get('code')
  if (!code) {
    return Response.json({ error: 'No code in callback' }, { status: 400 })
  }

  const tokenRes = await fetch(`https://${STORE}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code }),
  })

  if (!tokenRes.ok) {
    const body = await tokenRes.text()
    return Response.json(
      { error: `Token exchange failed (${tokenRes.status}): ${body}` },
      { status: 502 }
    )
  }

  const { access_token } = (await tokenRes.json()) as { access_token: string; scope: string }

  // 4. Persist the token
  const supabase = createSupabaseServiceClient()
  const { error: dbError } = await supabase
    .from('stores')
    .update({ shopify_access_token: access_token })
    .eq('id', STORE_ID)

  if (dbError) {
    return Response.json(
      { error: `DB write failed: ${dbError.message}` },
      { status: 500 }
    )
  }

  // 5. Redirect to dashboard — clear the nonce cookie
  const response = NextResponse.redirect(new URL('/dashboard', req.url))
  response.cookies.set('shopify_oauth_nonce', '', { maxAge: 0, path: '/' })
  return response
}
