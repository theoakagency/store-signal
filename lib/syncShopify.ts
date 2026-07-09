import { createSupabaseServiceClient } from '@/lib/supabase'

export const SHOPIFY_STORE = (process.env.SHOPIFY_RETAIL_STORE ?? '').trim()
export const SYNC_MONTHS_BACK = parseInt(process.env.SHOPIFY_SYNC_MONTHS_BACK ?? '12', 10)

const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const STORE_ID = '00000000-0000-0000-0000-000000000002'

// ── Shopify Admin REST API types ──────────────────────────────────────────────

export interface ShopifyOrder {
  id: number
  order_number: number
  name: string
  email: string | null
  financial_status: string
  fulfillment_status: string | null
  total_price: string
  // current_total_price reflects the order total after refunds/edits;
  // total_price is the original sale total. The difference is what was refunded.
  current_total_price: string | null
  subtotal_price: string
  total_tax: string
  total_discounts: string
  discount_codes: Array<{ code: string; amount: string; type: string }> | null
  // Order-level discount applications, indexed. Each line-item discount
  // allocation references one of these by position (discount_application_index).
  // discount_code applications carry a `code`; automatic/script discounts carry
  // a `title` and no code.
  discount_applications: ShopifyDiscountApplication[] | null
  total_shipping_price_set: { shop_money: { amount: string } } | null
  // Per-tier shipping lines. `title` is the tier the customer picked
  // ("Free Shipping", "Standard", ...). `price` is the tier's pre-discount
  // price; `discounted_price` is what it became after any shipping discount
  // (code/promo) was applied. Present in every order payload.
  shipping_lines: Array<{ title: string | null; price: string | null; discounted_price: string | null }> | null
  shipping_address: { province_code: string | null } | null
  currency: string
  customer?: { id: number }
  line_items: ShopifyLineItem[]
  tags: string
  processed_at: string | null
  created_at: string
  updated_at: string
  cancelled_at: string | null
  test: boolean
  source_name: string | null
  referring_site: string | null
  landing_site: string | null
  note_attributes: Array<{ name: string; value: string }> | null
}

export interface ShopifyLineItem {
  id: number
  title: string
  variant_title: string | null
  quantity: number
  price: string
  total_discount: string
  // Per-line discount amounts. Shopify reports total_discount = "0.00" for
  // order-level code discounts; the real per-line amount lives here, one entry
  // per discount application that touched this line.
  discount_allocations: ShopifyDiscountAllocation[] | null
  sku: string | null
  variant_id: number | null
  product_id: number | null
}

export interface ShopifyDiscountAllocation {
  amount: string
  discount_application_index: number
}

export interface ShopifyDiscountApplication {
  type: string // 'discount_code' | 'automatic' | 'manual' | 'script'
  code?: string
  title?: string
}

export interface ShopifyCustomer {
  id: number
  email: string | null
  first_name: string | null
  last_name: string | null
  phone: string | null
  orders_count: number
  total_spent: string
  tags: string
  created_at: string
  updated_at: string
}

// ── Shopify fetch helpers ─────────────────────────────────────────────────────

async function shopifyFetch(path: string, token: string): Promise<Response> {
  return fetch(`https://${SHOPIFY_STORE}/admin/api/2024-10/${path}`, {
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json',
    },
  })
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Incremental sync filters on updated_at_min (NOT created_at_min) so that
// orders refunded or cancelled after their initial sync get re-fetched and
// their financial_status corrected — created_at_min would only ever return
// brand-new orders, leaving stale 'paid' status on refunded orders forever.
async function fetchAllOrders(token: string, updatedAtMin?: string): Promise<ShopifyOrder[]> {
  const orders: ShopifyOrder[] = []
  const baseParams = new URLSearchParams({ limit: '250', status: 'any' })
  if (updatedAtMin) baseParams.set('updated_at_min', updatedAtMin)

  let url: string | null = `orders.json?${baseParams.toString()}`
  let isFirst = true

  while (url) {
    if (!isFirst) await sleep(500)
    isFirst = false

    const res = await shopifyFetch(url, token)
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Shopify orders fetch failed (${res.status}): ${text}`)
    }
    const data = await res.json()
    orders.push(...(data.orders as ShopifyOrder[]))

    const linkHeader = res.headers.get('Link')
    const nextMatch = linkHeader?.match(/<[^>]+\/(\S+)>; rel="next"/)
    url = nextMatch ? nextMatch[1] : null
  }

  return orders
}

const CUSTOMER_PAGE_LIMIT = 10

async function fetchAllCustomers(token: string): Promise<ShopifyCustomer[]> {
  const customers: ShopifyCustomer[] = []
  let url: string | null = `customers.json?limit=250`
  let pages = 0
  let isFirst = true

  while (url && pages < CUSTOMER_PAGE_LIMIT) {
    if (!isFirst) await sleep(500)
    isFirst = false

    const res = await shopifyFetch(url, token)
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Shopify customers fetch failed (${res.status}): ${text}`)
    }
    const data = await res.json()
    customers.push(...(data.customers as ShopifyCustomer[]))
    pages++

    const linkHeader = res.headers.get('Link')
    const nextMatch = linkHeader?.match(/<[^>]+\/(\S+)>; rel="next"/)
    url = nextMatch ? nextMatch[1] : null
  }

  return customers
}

// ── UTM extraction ────────────────────────────────────────────────────────────

function extractUtm(landingSite: string | null, param: string): string | null {
  if (!landingSite) return null
  try {
    const url = new URL(
      landingSite.startsWith('http') ? landingSite : `https://x.com${landingSite.startsWith('/') ? '' : '/'}${landingSite}`
    )
    return url.searchParams.get(param)
  } catch {
    return null
  }
}

// ── Upsert helpers ────────────────────────────────────────────────────────────

// Shared order → DB row mapper. Exported so the manual and historical Shopify
// sync routes use the exact same mapping (previously three near-identical copies
// that drifted apart — the historical copy silently dropped source_name/UTM).
export function mapOrder(order: ShopifyOrder) {
  // Amount refunded (or removed via order edit) since the sale. current_total_price
  // is the order's value after refunds/edits; total_price is the original sale
  // total. Clamp at 0 so an edit that *increased* the total never reads negative.
  const totalPrice = parseFloat(order.total_price)
  const currentTotal =
    order.current_total_price != null ? parseFloat(order.current_total_price) : totalPrice
  const totalRefunded = Math.max(0, totalPrice - currentTotal)

  return {
    tenant_id: TENANT_ID,
    store_id: STORE_ID,
    shopify_order_id: order.id,
    order_number: order.name,
    email: order.email ?? null,
    financial_status: order.financial_status ?? null,
    fulfillment_status: order.fulfillment_status ?? null,
    total_price: totalPrice,
    subtotal_price: parseFloat(order.subtotal_price),
    total_tax: parseFloat(order.total_tax),
    total_discounts: parseFloat(order.total_discounts),
    total_refunded: totalRefunded,
    discount_codes: order.discount_codes ?? [],
    shipping_state: order.shipping_address?.province_code ?? null,
    shipping_charged: order.total_shipping_price_set?.shop_money?.amount
      ? parseFloat(order.total_shipping_price_set.shop_money.amount)
      : null,
    // The tier the customer selected at checkout. Group shipping margin by this.
    shipping_method: order.shipping_lines?.[0]?.title ?? null,
    // Total discount applied to shipping = sum of (price - discounted_price)
    // across shipping lines, clamped >= 0. Uses `discounted_price` per the
    // shipping-margin spec. > 0 means a code/promo reduced the shipping charge,
    // which distinguishes code-driven free shipping from a threshold-driven
    // "Free Shipping" tier that was simply priced at 0. null when the order has
    // no shipping lines at all (e.g. digital-only / local pickup).
    shipping_discounted: order.shipping_lines?.length
      ? order.shipping_lines.reduce((sum, line) => {
          const price = parseFloat(line.price ?? '0')
          const discounted = parseFloat(line.discounted_price ?? line.price ?? '0')
          return sum + Math.max(0, (Number.isNaN(price) ? 0 : price) - (Number.isNaN(discounted) ? 0 : discounted))
        }, 0)
      : null,
    currency: order.currency,
    customer_id: order.customer?.id ?? null,
    line_items_count: order.line_items.length,
    line_items: order.line_items.map((li) => ({
      id: li.id,
      title: li.title,
      variant_title: li.variant_title ?? null,
      quantity: li.quantity,
      price: li.price,
      total_discount: li.total_discount,
      // Resolve each per-line discount allocation to the code that produced it.
      // Shopify leaves line_items[].total_discount = "0.00" for order-level code
      // discounts and puts the real amount in discount_allocations, each keyed by
      // discount_application_index into the order's discount_applications. Resolving
      // the code here lets downstream reports credit each stacked code independently.
      //
      // `discount_code` applications carry the code in `.code`. MANUAL discounts
      // (e.g. staff applying a 100%-off event code like KLLEVENT) have no `.code`
      // — the identifier lives in `.title` — so fall back to the title for manual
      // applications ONLY. Automatic/script discounts are deliberately left null
      // (non-deductible) so a coincidental title match can never start crediting
      // them.
      discount_allocations: (li.discount_allocations ?? []).map((a) => {
        const app = order.discount_applications?.[a.discount_application_index]
        const code = app?.code ?? (app?.type === 'manual' ? app?.title ?? null : null)
        return { code, amount: a.amount }
      }),
      sku: li.sku,
      variant_id: li.variant_id,
      product_id: li.product_id,
    })),
    tags: order.tags ? order.tags.split(', ').filter(Boolean) : [],
    // Shopify's real order-creation time. Without this the column falls back to
    // its `default now()` (DB insert time), which breaks any created_at windowing.
    created_at: order.created_at,
    processed_at: order.processed_at ?? null,
    updated_at: order.updated_at,
    cancelled_at: order.cancelled_at ?? null,
    test: order.test ?? false,
    source_name: order.source_name ?? null,
    referring_site: order.referring_site ?? null,
    landing_site: order.landing_site ?? null,
    utm_source: extractUtm(order.landing_site, 'utm_source'),
    utm_medium: extractUtm(order.landing_site, 'utm_medium'),
    utm_campaign: extractUtm(order.landing_site, 'utm_campaign'),
  }
}

function mapCustomer(customer: ShopifyCustomer) {
  return {
    tenant_id: TENANT_ID,
    store_id: STORE_ID,
    shopify_customer_id: customer.id,
    email: customer.email ?? null,
    first_name: customer.first_name ?? null,
    last_name: customer.last_name ?? null,
    phone: customer.phone ?? null,
    orders_count: customer.orders_count,
    total_spent: parseFloat(customer.total_spent),
    tags: customer.tags ? customer.tags.split(', ').filter(Boolean) : [],
    updated_at: customer.updated_at,
  }
}

// ── Core sync logic ───────────────────────────────────────────────────────────

export async function runShopifySync(
  token: string,
  syncType: 'incremental' | 'historical',
  updatedAtMin?: string
) {
  const supabase = createSupabaseServiceClient()
  const results = { orders: 0, customers: 0, errors: [] as string[] }

  const { data: syncLogRow } = await supabase
    .from('sync_log')
    .insert({ tenant_id: TENANT_ID, store_id: STORE_ID, sync_type: syncType, status: 'running' })
    .select('id')
    .single()
  const syncLogId = syncLogRow?.id

  // ── Sync orders ───────────────────────────────────────────────────────────
  try {
    const orders = await fetchAllOrders(token, updatedAtMin)
    const mapped = orders.map(mapOrder)

    for (let i = 0; i < mapped.length; i += 500) {
      const batch = mapped.slice(i, i + 500)
      const { error } = await supabase.from('orders').upsert(batch, { onConflict: 'store_id,shopify_order_id' })
      if (error) results.errors.push(`Orders upsert batch ${i}: ${error.message}`)
      else results.orders += batch.length
    }
  } catch (err) {
    const msg = (err as Error).message
    if (msg.includes('401')) {
      await supabase.from('stores').update({ shopify_access_token: null }).eq('id', STORE_ID)
      results.errors.push('Orders: token revoked — visit /api/shopify/install to re-authorize')
    } else {
      results.errors.push(`Orders: ${msg}`)
    }
  }

  // ── Sync customers ────────────────────────────────────────────────────────
  try {
    const customers = await fetchAllCustomers(token)
    const mapped = customers.map(mapCustomer)

    for (let i = 0; i < mapped.length; i += 500) {
      const batch = mapped.slice(i, i + 500)
      const { error } = await supabase.from('customers').upsert(batch, { onConflict: 'store_id,shopify_customer_id' })
      if (error) results.errors.push(`Customers upsert batch ${i}: ${error.message}`)
      else results.customers += batch.length
    }
  } catch (err) {
    const msg = (err as Error).message
    if (msg.includes('401')) {
      await supabase.from('stores').update({ shopify_access_token: null }).eq('id', STORE_ID)
      results.errors.push('Customers: token revoked — visit /api/shopify/install to re-authorize')
    } else {
      results.errors.push(`Customers: ${msg}`)
    }
  }

  await supabase.from('stores').update({ last_synced_at: new Date().toISOString() }).eq('id', STORE_ID)

  if (syncLogId) {
    await supabase.from('sync_log').update({
      completed_at: new Date().toISOString(),
      orders_synced: results.orders,
      customers_synced: results.customers,
      status: results.errors.length > 0 ? 'partial' : 'success',
      error_message: results.errors.length > 0 ? results.errors.join('; ') : null,
    }).eq('id', syncLogId)
  }

  return results
}
