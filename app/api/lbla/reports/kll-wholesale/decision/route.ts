/**
 * POST   /api/lbla/reports/kll-wholesale/decision
 *   Body: { order_number, action, custom_amount? }  — save/replace a decision.
 * DELETE /api/lbla/reports/kll-wholesale/decision?order_number=WS-8050
 *   Clear a decision (order returns to pending).
 *
 * Records how a flagged (order-level-discounted) wholesale order should be
 * treated in the report totals. Keyed by order number so it survives re-uploads.
 */
import { NextRequest } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'
import { isDiscountAction } from '@/lib/wholesaleDiscount'

export const maxDuration = 30

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { order_number?: string; action?: string; custom_amount?: number | string | null }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const orderNumber = (body.order_number ?? '').trim()
  if (!orderNumber) return Response.json({ error: 'order_number is required' }, { status: 400 })
  if (!isDiscountAction(body.action)) {
    return Response.json({ error: 'action must be one of ignore, distribute_full, distribute_custom, full_price' }, { status: 400 })
  }

  // Custom amount only applies to distribute_custom, where it must be > 0.
  let customAmount: number | null = null
  if (body.action === 'distribute_custom') {
    const n = typeof body.custom_amount === 'string' ? parseFloat(body.custom_amount) : body.custom_amount
    if (n == null || !Number.isFinite(n) || n <= 0) {
      return Response.json({ error: 'A positive custom amount is required for Distribute Custom' }, { status: 400 })
    }
    customAmount = Math.round(n * 100) / 100
  }

  const service = createSupabaseServiceClient()
  const now = new Date().toISOString()
  const { error } = await service
    .from('wholesale_order_discount_decisions')
    .upsert({
      tenant_id: TENANT_ID,
      order_number: orderNumber,
      action: body.action,
      custom_amount: customAmount,
      decided_by: user.email ?? null,
      decided_at: now,
      updated_at: now,
    }, { onConflict: 'tenant_id,order_number' })

  if (error) return Response.json({ error: `Could not save decision: ${error.message}` }, { status: 500 })
  return Response.json({ ok: true, order_number: orderNumber, action: body.action, custom_amount: customAmount, decided_by: user.email ?? null, decided_at: now })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const orderNumber = (req.nextUrl.searchParams.get('order_number') ?? '').trim()
  if (!orderNumber) return Response.json({ error: 'order_number is required' }, { status: 400 })

  const service = createSupabaseServiceClient()
  const { error } = await service
    .from('wholesale_order_discount_decisions')
    .delete()
    .eq('tenant_id', TENANT_ID)
    .eq('order_number', orderNumber)

  if (error) return Response.json({ error: `Could not clear decision: ${error.message}` }, { status: 500 })
  return Response.json({ ok: true, order_number: orderNumber, cleared: true })
}
