/**
 * Manual KLL line items for /lbla/reports/kll-wholesale.
 *   POST   — create   { month, order_number?, sku, product_title?, quantity, unit_price }
 *   PATCH  — edit     { id, order_number?, sku, product_title?, quantity, unit_price }
 *   DELETE — remove   ?id=<uuid>
 *
 * Stored in their own table so they survive a month re-upload (which replaces the
 * uploaded rows). The report merges them into the totals at read time.
 */
import { NextRequest } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'

export const maxDuration = 30

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

interface Body {
  id?: string
  month?: string
  order_number?: string | null
  sku?: string
  product_title?: string | null
  quantity?: number | string
  unit_price?: number | string
}

// Validate + normalise the shared line fields. Returns an error string or the row.
function buildFields(body: Body): { error: string } | {
  order_number: string | null; sku: string; product_title: string | null; quantity: number; unit_price: number; gross: number
} {
  const sku = (body.sku ?? '').trim()
  if (!sku) return { error: 'SKU is required' }
  const quantity = typeof body.quantity === 'string' ? parseInt(body.quantity, 10) : body.quantity
  if (quantity == null || !Number.isInteger(quantity) || quantity <= 0) return { error: 'Quantity must be a whole number greater than 0' }
  const unitPrice = typeof body.unit_price === 'string' ? parseFloat(body.unit_price) : body.unit_price
  if (unitPrice == null || !Number.isFinite(unitPrice) || unitPrice < 0) return { error: 'Unit price must be a number of 0 or more' }
  const orderNumber = (body.order_number ?? '').trim() || null
  const productTitle = (body.product_title ?? '').trim() || null
  const price = Math.round(unitPrice * 100) / 100
  return {
    order_number: orderNumber,
    sku: sku.toUpperCase(),
    product_title: productTitle,
    quantity,
    unit_price: price,
    gross: Math.round(quantity * price * 100) / 100,
  }
}

async function requireUser() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function POST(req: NextRequest) {
  const user = await requireUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Body
  try { body = await req.json() } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }) }

  const month = (body.month ?? '').trim()
  if (!/^\d{4}-\d{2}$/.test(month)) return Response.json({ error: 'A valid month (YYYY-MM) is required' }, { status: 400 })
  const fields = buildFields(body)
  if ('error' in fields) return Response.json({ error: fields.error }, { status: 400 })

  const now = new Date().toISOString()
  const service = createSupabaseServiceClient()
  const { data, error } = await service
    .from('wholesale_manual_line_items')
    .insert({ tenant_id: TENANT_ID, month, ...fields, added_by: user.email ?? null, added_at: now, updated_at: now })
    .select('id').single()
  if (error) return Response.json({ error: `Could not add line item: ${error.message}` }, { status: 500 })
  return Response.json({ ok: true, id: data?.id })
}

export async function PATCH(req: NextRequest) {
  const user = await requireUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Body
  try { body = await req.json() } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }) }

  const id = (body.id ?? '').trim()
  if (!id) return Response.json({ error: 'id is required' }, { status: 400 })
  const fields = buildFields(body)
  if ('error' in fields) return Response.json({ error: fields.error }, { status: 400 })

  const service = createSupabaseServiceClient()
  // added_by / added_at are preserved (who created it); only updated_at moves.
  const { error } = await service
    .from('wholesale_manual_line_items')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('tenant_id', TENANT_ID)
    .eq('id', id)
  if (error) return Response.json({ error: `Could not update line item: ${error.message}` }, { status: 500 })
  return Response.json({ ok: true, id })
}

export async function DELETE(req: NextRequest) {
  const user = await requireUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const id = (req.nextUrl.searchParams.get('id') ?? '').trim()
  if (!id) return Response.json({ error: 'id is required' }, { status: 400 })

  const service = createSupabaseServiceClient()
  const { error } = await service
    .from('wholesale_manual_line_items')
    .delete()
    .eq('tenant_id', TENANT_ID)
    .eq('id', id)
  if (error) return Response.json({ error: `Could not delete line item: ${error.message}` }, { status: 500 })
  return Response.json({ ok: true, id, deleted: true })
}
