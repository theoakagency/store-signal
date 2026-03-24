import { createSupabaseServiceClient } from '@/lib/supabase'

export const metadata = { title: 'Product Intelligence — Store Signal' }

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

export default async function ProductsPage() {
  const service = createSupabaseServiceClient()

  const [
    { data: productStats },
    { data: affinities },
    { data: sequences },
  ] = await Promise.all([
    service
      .from('product_stats')
      .select('product_title, variant_title, total_revenue, total_orders, unique_customers, repeat_purchase_rate, avg_days_to_repurchase, subscription_conversion_rate, is_subscribable, revenue_30d, revenue_90d, revenue_12m, avg_order_value_with_product, calculated_at')
      .eq('tenant_id', TENANT_ID)
      .order('total_revenue', { ascending: false })
      .limit(100),
    service
      .from('product_affinities')
      .select('product_a, product_b, co_purchase_count, co_purchase_rate, confidence, lift')
      .eq('tenant_id', TENANT_ID)
      .order('lift', { ascending: false })
      .limit(50),
    service
      .from('purchase_sequences')
      .select('first_product, second_product, sequence_count, avg_days_between, ltv_of_customers_in_sequence')
      .eq('tenant_id', TENANT_ID)
      .order('ltv_of_customers_in_sequence', { ascending: false })
      .limit(50),
  ])

  // Dynamic import to avoid making page.tsx a client component
  const { default: ProductDashboard } = await import('./ProductDashboard')

  return (
    <ProductDashboard
      productStats={productStats ?? []}
      affinities={affinities ?? []}
      sequences={sequences ?? []}
    />
  )
}
