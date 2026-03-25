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
  subtotal_price: string
  total_tax: string
  total_discounts: string
  currency: string
  customer?: { id: number }
  line_items: ShopifyLineItem[]
  tags: string
  processed_at: string | null
  created_at: string
  updated_at: string
  source_name: string | null
  referring_site: string | null
  landing_site: string | null
  note_attributes: Array<{ name: string; value: string }> | null
}

export interface ShopifyLineItem {
  id: number
  title: string
  quantity: number
  price: string
  sku: string | null
  variant_id: number | null
  product_id: number | null
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

async function fetchAllOrders(token: string, createdAtMin?: string): Promise<ShopifyOrder[]> {
  const orders: ShopifyOrder[] = []
  const baseParams = new URLSearchParams({ limit: '250', status: 'any' })
  if (createdAtMin) baseParams.set('created_at_min', createdAtMin)

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

function mapOrder(order: ShopifyOrder) {
  return {
    tenant_id: TENANT_ID,
    store_id: STORE_ID,
    shopify_order_id: order.id,
    order_number: order.name,
    email: order.email ?? null,
    financial_status: order.financial_status ?? null,
    fulfillment_status: order.fulfillment_status ?? null,
    total_price: parseFloat(order.total_price),
    subtotal_price: parseFloat(order.subtotal_price),
    total_tax: parseFloat(order.total_tax),
    total_discounts: parseFloat(order.total_discounts),
    currency: order.currency,
    customer_id: order.customer?.id ?? null,
    line_items_count: order.line_items.length,
    line_items: order.line_items.map((li) => ({
      id: li.id,
      title: li.title,
      quantity: li.quantity,
      price: li.price,
      sku: li.sku,
      variant_id: li.variant_id,
      product_id: li.product_id,
    })),
    tags: order.tags ? order.tags.split(', ').filter(Boolean) : [],
    processed_at: order.processed_at ?? null,
    updated_at: order.updated_at,
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
  createdAtMin?: string
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
    const orders = await fetchAllOrders(token, createdAtMin)
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
