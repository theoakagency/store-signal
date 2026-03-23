import { NextRequest } from 'next/server'
import crypto from 'crypto'
import { cookies } from 'next/headers'
import { createSupabaseServiceClient } from '@/lib/supabase'

const CLIENT_ID = process.env.SHOPIFY_RETAIL_CLIENT_ID!
const CLIENT_SECRET = process.env.SHOPIFY_RETAIL_CLIENT_SECRET!
const STORE = process.env.SHOPIFY_RETAIL_STORE!
const STORE_ID = '00000000-0000-0000-0000-000000000002'

// ── HMAC verification ─────────────────────────────────────────────────────────
// Shopify signs the callback params with the client secret so we can confirm
// the request is genuine and not forged.

function verifyHmac(searchParams: URLSearchParams): boolean {
  const hmac = searchParams.get('hmac')
  if (!hmac) return false

  // Build the message: all params except `hmac`, sorted, joined with &
  const pairs: string[] = []
  searchParams.forEach((value, key) => {
    if (key !== 'hmac') {
      // Shopify percent-encodes & and % in values
      pairs.push(
        `${key.replace(/%/g, '%25').replace(/&/g, '%26')}=${value
          .replace(/%/g, '%25')
          .replace(/&/g, '%26')}`
      )
    }
  })
  pairs.sort()

  const message = pairs.join('&')
  const digest = crypto
    .createHmac('sha256', CLIENT_SECRET)
    .update(message)
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

  // 2. Verify CSRF nonce
  const returnedState = searchParams.get('state')
  const cookieStore = await cookies()
  const savedNonce = cookieStore.get('shopify_oauth_nonce')?.value

  if (!returnedState || returnedState !== savedNonce) {
    return Response.json({ error: 'State mismatch — possible CSRF' }, { status: 401 })
  }
  cookieStore.delete('shopify_oauth_nonce')

  // 3. Exchange the one-time code for an access token
  const code = searchParams.get('code')
  if (!code) {
    return Response.json({ error: 'No code in callback' }, { status: 400 })
  }

  const tokenRes = await fetch(`https://${STORE}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
    }),
  })

  if (!tokenRes.ok) {
    const body = await tokenRes.text()
    return Response.json(
      { error: `Token exchange failed (${tokenRes.status}): ${body}` },
      { status: 502 }
    )
  }

  const { access_token, scope } = (await tokenRes.json()) as {
    access_token: string
    scope: string
  }

  // 4. Persist the token in the stores table
  const supabase = createSupabaseServiceClient()
  const { error: dbError } = await supabase
    .from('stores')
    .update({ shopify_access_token: access_token })
    .eq('id', STORE_ID)

  if (dbError) {
    return Response.json(
      { error: `Token saved but DB write failed: ${dbError.message}` },
      { status: 500 }
    )
  }

  // 5. Kick off the first sync automatically
  const host = req.headers.get('host') ?? req.nextUrl.host
  const protocol = req.nextUrl.protocol ?? 'https:'
  await fetch(`${protocol}//${host}/api/shopify/sync`, { method: 'POST' })
    .catch(() => {/* non-fatal — sync can be triggered manually */})

  // 6. Redirect to dashboard
  return Response.redirect(new URL('/dashboard', req.url))
}
