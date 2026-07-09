/**
 * Core ShipStation sync logic, extracted so it can be called from both the
 * manual POST /api/shipstation/sync(/historical) routes and the automated cron job.
 */
import { createSupabaseServiceClient } from '@/lib/supabase'
import { getLabels } from '@/lib/shipstation'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

// ShipStation v2 reports weight in a { value, unit } object; normalize to
// ounces for storage. Returns null for missing/unknown units rather than
// guessing, so downstream analysis never treats grams as ounces.
function toOunces(weight: { value?: number | null; unit?: string | null } | null | undefined): number | null {
  if (!weight || typeof weight.value !== 'number' || Number.isNaN(weight.value)) return null
  switch (weight.unit) {
    case 'ounce':
      return weight.value
    case 'pound':
      return weight.value * 16
    case 'gram':
      return weight.value / 28.349523125
    case 'kilogram':
      return weight.value * 35.27396195
    default:
      return null
  }
}

export async function runShipStationSync(
  apiKey: string,
  dateRange: { start: string; end: string }
): Promise<{ ok: true; synced: { labels: number }; unmatched: number }> {
  const service = createSupabaseServiceClient()

  const labels = await getLabels(apiKey, dateRange)

  let unmatched = 0

  if (labels.length > 0) {
    const rows = labels.map((label) => {
      // external_order_id is null for orders synced via the native Shopify-ShipStation
      // connection. The Shopify order ID instead lives as the first segment of
      // external_shipment_id, formatted "{shopify_order_id}-{secondary_id}".
      const firstSegment = label.external_shipment_id?.split('-')[0]
      const parsed = firstSegment ? Number(firstSegment) : NaN
      const shopifyOrderId = Number.isNaN(parsed) ? null : parsed
      if (shopifyOrderId === null) unmatched += 1

      return {
        id: label.label_id,
        tenant_id: TENANT_ID,
        shopify_order_id: shopifyOrderId,
        shipment_cost: label.shipment_cost?.amount ?? null,
        currency: label.shipment_cost?.currency ?? null,
        ship_date: label.ship_date,
        carrier_id: label.carrier_id,
        service_code: label.service_code,
        label_created_at: label.created_at,
        // Cost-accuracy fields (migration 036). status gates voided-label
        // exclusion; insurance_cost is billed separately from shipment_cost.
        status: label.status ?? null,
        insurance_cost: label.insurance_cost?.amount ?? null,
        external_shipment_id: label.external_shipment_id ?? null,
        // Optional — captured when ShipStation returns them, NULL otherwise.
        is_return_label: label.is_return_label ?? null,
        ship_to_state: label.ship_to?.state_province ?? null,
        ship_to_postal_code: label.ship_to?.postal_code ?? null,
        weight_oz: toOunces(label.weight),
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
