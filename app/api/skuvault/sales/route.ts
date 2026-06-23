import { NextRequest } from 'next/server'

export const maxDuration = 300

const ALLOWED_STATUSES = new Set([
  'Completed',
  'Ready to Ship',
  'Shipped: Unpaid',
  'Pending',
  'Unpaid',
  'Payment Pending',
])

interface MerchantItem {
  Sku: string
  Quantity: number
}

interface MerchantKit {
  Sku: string
  Quantity: number
  Items?: unknown[] // component SKUs — ignored, only count the kit SKU itself
}

interface SkuVaultSale {
  Status: string
  MerchantItems?: MerchantItem[]
  MerchantKits?: MerchantKit[]
}

function chunkDateRange(start: Date, end: Date, days: number): { from: Date; to: Date }[] {
  const chunks: { from: Date; to: Date }[] = []
  let current = new Date(start)
  while (current <= end) {
    const chunkEnd = new Date(current)
    chunkEnd.setDate(chunkEnd.getDate() + days - 1)
    if (chunkEnd > end) chunkEnd.setTime(end.getTime())
    chunks.push({ from: new Date(current), to: new Date(chunkEnd) })
    current.setDate(current.getDate() + days)
  }
  return chunks
}

function toSvDate(d: Date, endOfDay = false): string {
  const y   = d.getFullYear()
  const m   = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}T${endOfDay ? '23:59:59' : '00:00:00'}`
}

export async function POST(req: NextRequest) {
  const tenantToken = process.env.SKUVAULT_TENANT_TOKEN
  const userToken   = process.env.SKUVAULT_USER_TOKEN

  if (!tenantToken || !userToken) {
    return Response.json({ error: 'SKU Vault credentials not configured.' }, { status: 500 })
  }

  const { startDate, endDate } = await req.json() as { startDate: string; endDate: string }

  if (!startDate || !endDate) {
    return Response.json({ error: 'startDate and endDate are required.' }, { status: 400 })
  }

  const start = new Date(startDate + 'T00:00:00')
  const end   = new Date(endDate   + 'T23:59:59')

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
    return Response.json({ error: 'Invalid date range.' }, { status: 400 })
  }

  const chunks      = chunkDateRange(start, end, 7)
  const skuTotals: Record<string, number> = {}
  const chunkErrors: string[] = []
  const seenStatuses = new Set<string>() // tracks all Status values for debugging
  const encoder     = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: unknown) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      for (let i = 0; i < chunks.length; i++) {
        const chunk   = chunks[i]
        const fromStr = toSvDate(chunk.from, false)
        const toStr   = toSvDate(chunk.to,   true)

        try {
          const res = await fetch('https://app.skuvault.com/api/sales/getSalesByDate', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              FromDate:    fromStr,
              ToDate:      toStr,
              TenantToken: tenantToken,
              UserToken:   userToken,
            }),
            signal: AbortSignal.timeout(30_000),
          })

          if (!res.ok) {
            const text = await res.text().catch(() => `HTTP ${res.status}`)
            chunkErrors.push(`Chunk ${i + 1}: ${text.slice(0, 200)}`)
            send({ type: 'chunk', chunk: i + 1, total: chunks.length, error: `HTTP ${res.status}` })
            continue
          }

          // Response is a direct JSON array of sale objects
          const sales = await res.json() as SkuVaultSale[]

          if (!Array.isArray(sales)) {
            chunkErrors.push(`Chunk ${i + 1}: unexpected response shape`)
            send({ type: 'chunk', chunk: i + 1, total: chunks.length, error: 'unexpected response shape' })
            continue
          }

          for (const sale of sales) {
            if (sale.Status) seenStatuses.add(sale.Status)
            if (!ALLOWED_STATUSES.has(sale.Status)) continue

            // Regular items
            for (const item of sale.MerchantItems ?? []) {
              const sku = item.Sku?.trim()
              if (!sku) continue
              const qty = Number(item.Quantity ?? 0)
              if (qty <= 0) continue
              skuTotals[sku] = (skuTotals[sku] ?? 0) + qty
            }

            // Kit/bundle SKUs — count the kit itself, ignore nested component Items
            for (const kit of sale.MerchantKits ?? []) {
              const sku = kit.Sku?.trim()
              if (!sku) continue
              const qty = Number(kit.Quantity ?? 0)
              if (qty <= 0) continue
              skuTotals[sku] = (skuTotals[sku] ?? 0) + qty
            }
          }

          send({ type: 'chunk', chunk: i + 1, total: chunks.length, skusFound: Object.keys(skuTotals).length })
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          chunkErrors.push(`Chunk ${i + 1}: ${msg}`)
          send({ type: 'chunk', chunk: i + 1, total: chunks.length, error: msg })
        }
      }

      const results = Object.entries(skuTotals)
        .map(([sku, quantity]) => ({ sku, quantity }))
        .sort((a, b) => a.sku.localeCompare(b.sku))

      const totalUnits = results.reduce((s, r) => s + r.quantity, 0)

      send({
        type: 'done',
        results,
        totalUnits,
        chunksProcessed: chunks.length,
        chunkErrors,
        dateRange: { start: startDate, end: endDate },
        allStatusesSeen: Array.from(seenStatuses).sort(),
      })

      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  })
}
