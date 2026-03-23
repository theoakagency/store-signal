import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { buildAuthUrl } from '@/lib/gsc'

export async function GET(req: NextRequest) {
  // Auth check — must be logged in
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const property = req.nextUrl.searchParams.get('property') ?? ''
  if (!property) {
    return Response.json({ error: 'Missing property URL' }, { status: 400 })
  }

  // Encode property URL in OAuth state so we can save it after callback
  const state = Buffer.from(JSON.stringify({ property, uid: user.id })).toString('base64url')
  const url = buildAuthUrl(state)

  return Response.redirect(url)
}
