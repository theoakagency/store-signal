import { createSupabaseServerClient } from '@/lib/supabase'
import KlaviyoDashboard from './KlaviyoDashboard'

export const metadata = {
  title: 'Email Intelligence — Store Signal',
}

const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const STORE_ID = '00000000-0000-0000-0000-000000000002'

export default async function KlaviyoPage() {
  const supabase = await createSupabaseServerClient()

  const [
    { data: store },
    { data: campaigns },
    { data: flows },
    { data: metricsRows },
  ] = await Promise.all([
    supabase
      .from('stores')
      .select('klaviyo_api_key, klaviyo_account_id')
      .eq('id', STORE_ID)
      .single(),
    supabase
      .from('klaviyo_campaigns')
      .select('id, name, subject, channel, status, send_time, recipient_count, open_rate, click_rate, revenue_attributed, unsubscribe_count, created_at')
      .eq('tenant_id', TENANT_ID)
      .eq('status', 'Sent')
      .gt('recipient_count', 0)
      .order('revenue_attributed', { ascending: false })
      .limit(100),
    supabase
      .from('klaviyo_flows')
      .select('id, name, channel, status, trigger_type, recipient_count, open_rate, click_rate, conversion_rate, revenue_attributed, created_at')
      .eq('tenant_id', TENANT_ID)
      .order('revenue_attributed', { ascending: false }),
    supabase
      .from('klaviyo_metrics_cache')
      .select('metric_name, metric_value, metric_metadata')
      .eq('tenant_id', TENANT_ID),
  ])

  const connected = !!store?.klaviyo_api_key

  const metrics: Record<string, { value: number; metadata: Record<string, unknown> }> = {}
  for (const row of metricsRows ?? []) {
    metrics[row.metric_name] = {
      value: Number(row.metric_value),
      metadata: (row.metric_metadata as Record<string, unknown>) ?? {},
    }
  }

  return (
    <KlaviyoDashboard
      connected={connected}
      campaigns={campaigns ?? []}
      flows={flows ?? []}
      metrics={metrics}
    />
  )
}
