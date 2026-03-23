import { NextRequest } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase'

const SHOPIFY_STORE = process.env.SHOPIFY_RETAIL_STORE!

// Fixed IDs matching the seed data in the migration
const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const STORE_ID = '00000000-0000-0000-0000-000000000002'

// ── Shopify Admin REST API types ─────────────────────────────────────────────

interface ShopifyOrder {
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
  line_items: unknown[]
  tags: string
  processed_at: string | null
  created_at: string
  updated_at: string
}

interface ShopifyCustomer {
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

async function fetchAllOrders(token: string): Promise<ShopifyOrder[]> {
  const res = await shopifyFetch('orders.json?limit=250&status=any', token)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Shopify orders fetch failed (${res.status}): ${text}`)
  }
  const data = await res.json()
  return data.orders as ShopifyOrder[]
}

async function fetchAllCustomers(token: string): Promise<ShopifyCustomer[]> {
  const customers: ShopifyCustomer[] = []
  let url: string | null = `customers.json?limit=250`

  while (url) {
    const res = await shopifyFetch(url, token)
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Shopify customers fetch failed (${res.status}): ${text}`)
    }
    const data = await res.json()
    customers.push(...(data.customers as ShopifyCustomer[]))

    // Follow Shopify cursor pagination via Link header
    const linkHeader = res.headers.get('Link')
    const nextMatch = linkHeader?.match(/<[^>]+\/(\S+)>; rel="next"/)
    url = nextMatch ? nextMatch[1] : null
  }

  return customers
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
    tags: order.tags ? order.tags.split(', ').filter(Boolean) : [],
    processed_at: order.processed_at ?? null,
    updated_at: order.updated_at,
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

// ── Route Handler ─────────────────────────────────────────────────────────────

export async function POST(_req: NextRequest) {
  if (!SHOPIFY_STORE) {
    return Response.json(
      { error: 'Missing SHOPIFY_RETAIL_STORE environment variable' },
      { status: 500 }
    )
  }

  const supabase = createSupabaseServiceClient()
  const results = { orders: 0, customers: 0, errors: [] as string[] }

  // ── 1. Load cached OAuth token ──────────────────────────────────────────────
  // Token is written by /api/shopify/callback after the OAuth install flow.
  const { data: store } = await supabase
    .from('stores')
    .select('shopify_access_token')
    .eq('id', STORE_ID)
    .single()

  const token = store?.shopify_access_token
  if (!token) {
    return Response.json(
      {
        error: 'No Shopify access token — complete OAuth install first',
        install_url: '/api/shopify/install',
      },
      { status: 401 }
    )
  }

  // ── 2. Sync orders ──────────────────────────────────────────────────────────
  try {
    const orders = await fetchAllOrders(token)
    const mapped = orders.map(mapOrder)
    const { error } = await supabase
      .from('orders')
      .upsert(mapped, { onConflict: 'store_id,shopify_order_id' })

    if (error) {
      results.errors.push(`Orders upsert: ${error.message}`)
    } else {
      results.orders = mapped.length
    }
  } catch (err) {
    const msg = (err as Error).message
    // Revoked token — clear cache so next visit to /api/shopify/install re-authorizes
    if (msg.includes('401')) {
      await supabase
        .from('stores')
        .update({ shopify_access_token: null })
        .eq('id', STORE_ID)
      results.errors.push('Orders: token revoked — visit /api/shopify/install to re-authorize')
    } else {
      results.errors.push(`Orders: ${msg}`)
    }
  }

  // ── 3. Sync customers ───────────────────────────────────────────────────────
  try {
    const customers = await fetchAllCustomers(token)
    const mapped = customers.map(mapCustomer)
    const { error } = await supabase
      .from('customers')
      .upsert(mapped, { onConflict: 'store_id,shopify_customer_id' })

    if (error) {
      results.errors.push(`Customers upsert: ${error.message}`)
    } else {
      results.customers = mapped.length
    }
  } catch (err) {
    const msg = (err as Error).message
    if (msg.includes('401')) {
      await supabase
        .from('stores')
        .update({ shopify_access_token: null })
        .eq('id', STORE_ID)
      results.errors.push('Customers: token revoked — visit /api/shopify/install to re-authorize')
    } else {
      results.errors.push(`Customers: ${msg}`)
    }
  }

  // ── 4. Mark last synced ─────────────────────────────────────────────────────
  await supabase
    .from('stores')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('id', STORE_ID)

  const status = results.errors.length > 0 ? 207 : 200
  return Response.json(results, { status })
}

// Allow triggering manually via GET for convenience in development
export async function GET(req: NextRequest) {
  return POST(req)
}
