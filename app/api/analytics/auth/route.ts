import { NextRequest } from 'next/server'
import { buildAuthUrl } from '@/lib/analytics'

export async function GET(req: NextRequest) {
  const propertyId = req.nextUrl.searchParams.get('property_id') ?? ''
  if (!propertyId) {
    return Response.redirect(new URL('/dashboard/integrations?ga4_error=missing_property_id', req.url))
  }
  return Response.redirect(buildAuthUrl(propertyId))
}
