import { NextRequest } from 'next/server'

// Temporary debug endpoint — fetches one 1-day chunk and returns raw SKU Vault response
// so we can inspect the exact field names and structure.
// DELETE or protect this route once the sales parser is fixed.

export async function POST(req: NextRequest) {
  const tenantToken = process.env.SKUVAULT_TENANT_TOKEN
  const userToken   = process.env.SKUVAULT_USER_TOKEN

  if (!tenantToken || !userToken) {
    return Response.json({ error: 'SKU Vault credentials not configured.' }, { status: 500 })
  }

  const { date } = await req.json() as { date?: string }
  const d = date ?? new Date().toISOString().split('T')[0]

  const body = {
    FromDate:    `${d}T00:00:00`,
    ToDate:      `${d}T23:59:59`,
    TenantToken: tenantToken,
    UserToken:   userToken,
  }

  try {
    const res = await fetch('https://app.skuvault.com/api/sales/getSalesByDate', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })

    const text = await res.text()
    let parsed: unknown = null
    try { parsed = JSON.parse(text) } catch { /* non-JSON */ }

    return Response.json({
      status:  res.status,
      headers: Object.fromEntries(res.headers.entries()),
      raw:     text.slice(0, 5000),
      parsed,
      requestBody: body,
    })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 })
  }
}
