/**
 * Core ShipStation sync logic, extracted so it can be called from both the
 * manual POST /api/shipstation/sync(/historical) routes and the automated cron job.
 */
import { createSupabaseServiceClient } from '@/lib/supabase'
import { getLabels } from '@/lib/shipstation'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

export async function runShipStationSync(
  apiKey: string,
  dateRange: { start: string; end: string }
): Promise<{ ok: true; synced: { labels: number }; unmatched: number }> {
  const service = createSupabaseServiceClient()

  const labels = await getLabels(apiKey, dateRange)

  let unmatched = 0

  if (labels.length > 0) {
    const rows = labels.map((label) => {
      const shopifyOrderId = label.external_order_id ? Number(label.external_order_id) : null
      if (shopifyOrderId === null || Number.isNaN(shopifyOrderId)) unmatched += 1

      return {
        id: label.label_id,
        tenant_id: TENANT_ID,
        shopify_order_id: Number.isNaN(shopifyOrderId) ? null : shopifyOrderId,
        shipment_cost: label.shipment_cost?.amount ?? null,
        currency: label.shipment_cost?.currency ?? null,
        ship_date: label.ship_date,
        carrier_id: label.carrier_id,
        service_code: label.service_code,
        label_created_at: label.created_at,
      }
    })

    for (let i = 0; i < rows.length; i += 500) {
      const batch = rows.slice(i, i + 500)
      const { error } = await service.from('shipstation_shipments').upsert(batch, { onConflict: 'id' })
      if (error) throw new Error(`shipstation_shipments upsert failed: ${error.message}`)
    }
  }

  return { ok: true, synced: { labels: labels.length }, unmatched }
}
