/**
 * Store Signal AI Agent — Tool definitions and executors
 *
 * Each tool has:
 *  - schema: Anthropic tool_use definition (name, description, input_schema)
 *  - execute: async function called when Claude invokes the tool
 */

import { SupabaseClient } from '@supabase/supabase-js'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ToolInput = Record<string, unknown>

export interface ToolResult {
  tool_use_id: string
  content: string
}

export interface AgentTool {
  schema: {
    name: string
    description: string
    input_schema: {
      type: 'object'
      properties: Record<string, unknown>
      required?: string[]
    }
  }
  execute: (input: ToolInput, supabase: SupabaseClient, tenantId: string) => Promise<unknown>
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STORE_ID = '00000000-0000-0000-0000-000000000002'

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

function monthsAgo(n: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - n)
  return d.toISOString()
}

function periodToDate(period: string): string {
  switch (period) {
    case 'last_7_days':    return daysAgo(7)
    case 'last_30_days':   return daysAgo(30)
    case 'last_90_days':   return daysAgo(90)
    case 'last_12_months': return monthsAgo(12)
    default:               return '2000-01-01T00:00:00Z'
  }
}

// ── Tool 1: get_revenue_summary ───────────────────────────────────────────────

const getRevenueSummary: AgentTool = {
  schema: {
    name: 'get_revenue_summary',
    description: 'Get revenue metrics for a time period including total revenue, order count, average order value, and trend vs prior period.',
    input_schema: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          enum: ['last_7_days', 'last_30_days', 'last_90_days', 'last_12_months', 'all_time'],
          description: 'The time period to analyze',
        },
      },
      required: ['period'],
    },
  },
  async execute(input, supabase, tenantId) {
    const period = (input.period as string) ?? 'last_30_days'
    const since = periodToDate(period)

    const { data: current } = await supabase
      .from('orders')
      .select('total_price, created_at')
      .eq('tenant_id', tenantId)
      .eq('financial_status', 'paid')
      .gte('created_at', period === 'all_time' ? '2000-01-01' : since)

    const totalRevenue = (current ?? []).reduce((s, o) => s + Number(o.total_price), 0)
    const orderCount = (current ?? []).length
    const avgOrderValue = orderCount > 0 ? totalRevenue / orderCount : 0

    // Prior period comparison (same length window shifted back)
    let trend: 'up' | 'down' | 'flat' = 'flat'
    let priorRevenue = 0
    if (period !== 'all_time') {
      const windowMs = Date.now() - new Date(since).getTime()
      const priorEnd = new Date(since)
      const priorStart = new Date(priorEnd.getTime() - windowMs)

      const { data: prior } = await supabase
        .from('orders')
        .select('total_price')
        .eq('tenant_id', tenantId)
        .eq('financial_status', 'paid')
        .gte('created_at', priorStart.toISOString())
        .lt('created_at', priorEnd.toISOString())

      priorRevenue = (prior ?? []).reduce((s, o) => s + Number(o.total_price), 0)
      const pct = priorRevenue > 0 ? (totalRevenue - priorRevenue) / priorRevenue : 0
      trend = pct > 0.02 ? 'up' : pct < -0.02 ? 'down' : 'flat'
    }

    return {
      period,
      total_revenue: Math.round(totalRevenue * 100) / 100,
      order_count: orderCount,
      avg_order_value: Math.round(avgOrderValue * 100) / 100,
      prior_period_revenue: Math.round(priorRevenue * 100) / 100,
      comparison_to_prior_period: priorRevenue > 0
        ? `${((( totalRevenue - priorRevenue) / priorRevenue) * 100).toFixed(1)}%`
        : 'No prior period data',
      trend,
    }
  },
}

// ── Tool 2: get_top_customers ─────────────────────────────────────────────────

const getTopCustomers: AgentTool = {
  schema: {
    name: 'get_top_customers',
    description: 'Get top customers ranked by lifetime value, order count, or recent activity.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Number of customers to return (default 10)' },
        sort_by: {
          type: 'string',
          enum: ['lifetime_value', 'recent_activity', 'order_count'],
          description: 'How to rank customers',
        },
      },
    },
  },
  async execute(input, supabase, tenantId) {
    const limit = (input.limit as number) ?? 10
    const sortBy = (input.sort_by as string) ?? 'lifetime_value'

    let query = supabase
      .from('customers')
      .select('email, first_name, last_name, total_spent, orders_count, updated_at, tags')
      .eq('tenant_id', tenantId)

    if (sortBy === 'lifetime_value') {
      query = query.order('total_spent', { ascending: false })
    } else if (sortBy === 'order_count') {
      query = query.order('orders_count', { ascending: false })
    } else {
      query = query.order('updated_at', { ascending: false })
    }

    const { data } = await query.limit(limit)

    return {
      customers: (data ?? []).map((c) => ({
        email: c.email,
        name: [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unknown',
        total_spent: Number(c.total_spent),
        order_count: c.orders_count,
        last_activity: c.updated_at,
        tags: c.tags ?? [],
      })),
      count: (data ?? []).length,
      sort_by: sortBy,
    }
  },
}

// ── Tool 3: get_customer_segments ─────────────────────────────────────────────

const getCustomerSegments: AgentTool = {
  schema: {
    name: 'get_customer_segments',
    description: 'Get customer segment breakdown: VIP, Active, At Risk, Lapsed, and New customers with counts and average lifetime value.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  async execute(_input, supabase, tenantId) {
    const { data: customers } = await supabase
      .from('customers')
      .select('total_spent, orders_count, updated_at')
      .eq('tenant_id', tenantId)

    const now = Date.now()
    const MS_90 = 90 * 24 * 60 * 60 * 1000
    const MS_180 = 180 * 24 * 60 * 60 * 1000
    const MS_30 = 30 * 24 * 60 * 60 * 1000

    const segments: Record<string, { count: number; total: number }> = {
      VIP: { count: 0, total: 0 },
      Active: { count: 0, total: 0 },
      'At Risk': { count: 0, total: 0 },
      Lapsed: { count: 0, total: 0 },
      New: { count: 0, total: 0 },
    }

    for (const c of customers ?? []) {
      const spent = Number(c.total_spent)
      const daysSince = (now - new Date(c.updated_at).getTime())
      const isNew = c.orders_count === 1 && daysSince < MS_30

      let seg: string
      if (isNew) {
        seg = 'New'
      } else if (spent >= 1000 && c.orders_count >= 5) {
        seg = 'VIP'
      } else if (daysSince < MS_90) {
        seg = 'Active'
      } else if (daysSince < MS_180) {
        seg = 'At Risk'
      } else {
        seg = 'Lapsed'
      }

      segments[seg].count++
      segments[seg].total += spent
    }

    return Object.entries(segments).map(([name, { count, total }]) => ({
      segment: name,
      count,
      avg_ltv: count > 0 ? Math.round((total / count) * 100) / 100 : 0,
      total_revenue: Math.round(total * 100) / 100,
    }))
  },
}

// ── Tool 4: get_lapsed_customers ──────────────────────────────────────────────

const getLapsedCustomers: AgentTool = {
  schema: {
    name: 'get_lapsed_customers',
    description: 'Get customers who have not ordered recently, sorted by lifetime value to prioritize win-back efforts.',
    input_schema: {
      type: 'object',
      properties: {
        days_inactive: { type: 'number', description: 'Days since last order (default 90)' },
        limit: { type: 'number', description: 'Number of customers to return (default 20)' },
      },
    },
  },
  async execute(input, supabase, tenantId) {
    const daysInactive = (input.days_inactive as number) ?? 90
    const limit = (input.limit as number) ?? 20
    const cutoff = daysAgo(daysInactive)

    const { data } = await supabase
      .from('customers')
      .select('email, first_name, last_name, total_spent, orders_count, updated_at')
      .eq('tenant_id', tenantId)
      .lt('updated_at', cutoff)
      .gt('orders_count', 0)
      .order('total_spent', { ascending: false })
      .limit(limit)

    return {
      days_inactive: daysInactive,
      lapsed_customers: (data ?? []).map((c) => ({
        email: c.email,
        name: [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unknown',
        lifetime_value: Number(c.total_spent),
        order_count: c.orders_count,
        last_activity: c.updated_at,
        days_since_last_order: Math.floor((Date.now() - new Date(c.updated_at).getTime()) / (1000 * 60 * 60 * 24)),
      })),
      count: (data ?? []).length,
    }
  },
}

// ── Tool 5: get_order_trends ──────────────────────────────────────────────────

const getOrderTrends: AgentTool = {
  schema: {
    name: 'get_order_trends',
    description: 'Get monthly order volume and revenue trends over time.',
    input_schema: {
      type: 'object',
      properties: {
        months_back: { type: 'number', description: 'How many months of history (default 12)' },
      },
    },
  },
  async execute(input, supabase, tenantId) {
    const monthsBack = (input.months_back as number) ?? 12
    const since = monthsAgo(monthsBack)

    const { data } = await supabase
      .from('orders')
      .select('total_price, created_at')
      .eq('tenant_id', tenantId)
      .eq('financial_status', 'paid')
      .gte('created_at', since)
      .order('created_at', { ascending: true })

    // Bucket by month
    const monthly: Record<string, { revenue: number; count: number }> = {}
    for (const o of data ?? []) {
      const month = o.created_at.slice(0, 7) // YYYY-MM
      if (!monthly[month]) monthly[month] = { revenue: 0, count: 0 }
      monthly[month].revenue += Number(o.total_price)
      monthly[month].count++
    }

    return Object.entries(monthly)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, { revenue, count }]) => ({
        month,
        order_count: count,
        revenue: Math.round(revenue * 100) / 100,
        avg_order_value: count > 0 ? Math.round((revenue / count) * 100) / 100 : 0,
      }))
  },
}

// ── Tool 6: get_product_performance ──────────────────────────────────────────

const getProductPerformance: AgentTool = {
  schema: {
    name: 'get_product_performance',
    description: 'Get best performing products by revenue, quantity sold, or order appearances. Data sourced from order line items.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Number of products to return (default 10)' },
        sort_by: {
          type: 'string',
          enum: ['revenue', 'quantity', 'orders'],
          description: 'How to rank products',
        },
        period: {
          type: 'string',
          enum: ['last_30_days', 'last_90_days', 'last_12_months', 'all_time'],
        },
      },
    },
  },
  async execute(input, supabase, tenantId) {
    const limit = (input.limit as number) ?? 10
    const sortBy = (input.sort_by as string) ?? 'revenue'
    const period = (input.period as string) ?? 'last_90_days'
    const since = periodToDate(period)

    const { data } = await supabase
      .from('orders')
      .select('line_items, created_at')
      .eq('tenant_id', tenantId)
      .eq('financial_status', 'paid')
      .gte('created_at', period === 'all_time' ? '2000-01-01' : since)

    const products: Record<string, { title: string; revenue: number; quantity: number; orders: number }> = {}
    for (const order of data ?? []) {
      const items = (order.line_items as { title: string; price: string; quantity: number; product_id?: number | null }[]) ?? []
      for (const item of items) {
        const key = item.title
        if (!products[key]) products[key] = { title: key, revenue: 0, quantity: 0, orders: 0 }
        products[key].revenue += parseFloat(item.price) * item.quantity
        products[key].quantity += item.quantity
        products[key].orders++
      }
    }

    const sorted = Object.values(products)
      .sort((a, b) => b[sortBy as keyof typeof a] as number - (a[sortBy as keyof typeof a] as number))
      .slice(0, limit)
      .map((p) => ({ ...p, revenue: Math.round(p.revenue * 100) / 100 }))

    return { period, sort_by: sortBy, products: sorted }
  },
}

// ── Tool 7: get_email_performance ─────────────────────────────────────────────

const getEmailPerformance: AgentTool = {
  schema: {
    name: 'get_email_performance',
    description: 'Get Klaviyo email campaign and flow performance metrics.',
    input_schema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['campaigns', 'flows', 'both'],
          description: 'Which email type to fetch',
        },
        limit: { type: 'number', description: 'Number of results (default 10)' },
      },
    },
  },
  async execute(input, supabase, tenantId) {
    const type = (input.type as string) ?? 'both'
    const limit = (input.limit as number) ?? 10
    const result: Record<string, unknown> = {}

    if (type === 'campaigns' || type === 'both') {
      const { data: campaigns } = await supabase
        .from('klaviyo_campaigns')
        .select('name, status, revenue_attributed, recipient_count, open_rate, click_rate, send_time, channel')
        .eq('tenant_id', tenantId)
        .order('revenue_attributed', { ascending: false })
        .limit(limit)

      result.campaigns = (campaigns ?? []).map((c) => ({
        name: c.name,
        status: c.status,
        channel: c.channel ?? 'email',
        revenue: Number(c.revenue_attributed),
        recipients: c.recipient_count,
        open_rate: c.open_rate != null ? (Number(c.open_rate) * 100).toFixed(1) + '%' : 'N/A',
        click_rate: c.click_rate != null ? (Number(c.click_rate) * 100).toFixed(1) + '%' : 'N/A',
        sent_at: c.send_time,
      }))
    }

    if (type === 'flows' || type === 'both') {
      const { data: flows } = await supabase
        .from('klaviyo_flows')
        .select('name, status, revenue_attributed, recipient_count, open_rate, click_rate')
        .eq('tenant_id', tenantId)
        .order('revenue_attributed', { ascending: false })
        .limit(limit)

      result.flows = (flows ?? []).map((f) => ({
        name: f.name,
        status: f.status,
        revenue: Number(f.revenue_attributed),
        recipients: f.recipient_count,
        open_rate: f.open_rate != null ? (Number(f.open_rate) * 100).toFixed(1) + '%' : 'N/A',
        click_rate: f.click_rate != null ? (Number(f.click_rate) * 100).toFixed(1) + '%' : 'N/A',
      }))
    }

    return result
  },
}

// ── Tool 8: get_search_performance ────────────────────────────────────────────

const getSearchPerformance: AgentTool = {
  schema: {
    name: 'get_search_performance',
    description: 'Get Google Search Console performance data: clicks, impressions, top keywords, and quick-win opportunities (positions 4–10).',
    input_schema: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          enum: ['last_30_days', 'last_90_days'],
        },
        metric: {
          type: 'string',
          enum: ['clicks', 'impressions', 'keywords', 'opportunities'],
        },
      },
    },
  },
  async execute(input, supabase, tenantId) {
    const period = (input.period as string) ?? 'last_30_days'
    const metric = (input.metric as string) ?? 'clicks'

    const { data: keywords } = await supabase
      .from('gsc_keywords')
      .select('keyword, clicks, impressions, position, url')
      .eq('tenant_id', tenantId)
      .order('clicks', { ascending: false })
      .limit(50)

    const all = keywords ?? []
    const totalClicks = all.reduce((s, k) => s + k.clicks, 0)
    const totalImpressions = all.reduce((s, k) => s + k.impressions, 0)
    const opportunities = all.filter((k) => k.position >= 4 && k.position <= 10)
    const topKeywords = all.slice(0, 10)

    const { data: insightsRow } = await supabase
      .from('gsc_insights_cache')
      .select('insights')
      .eq('tenant_id', tenantId)
      .maybeSingle()

    return {
      period,
      total_clicks: totalClicks,
      total_impressions: totalImpressions,
      avg_ctr: totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) + '%' : 'N/A',
      top_keywords: topKeywords.map((k) => ({
        keyword: k.keyword,
        clicks: k.clicks,
        impressions: k.impressions,
        position: Number(k.position).toFixed(1),
      })),
      quick_win_opportunities: opportunities.slice(0, 10).map((k) => ({
        keyword: k.keyword,
        position: Number(k.position).toFixed(1),
        impressions: k.impressions,
        potential: 'Move from position ' + Number(k.position).toFixed(0) + ' to top 3 for significant traffic gain',
      })),
      ai_insights: insightsRow?.insights ?? null,
    }
  },
}

// ── Tool 9: get_ad_performance ────────────────────────────────────────────────

const getAdPerformance: AgentTool = {
  schema: {
    name: 'get_ad_performance',
    description: 'Get Meta Ads and/or Google Ads campaign performance including spend, ROAS, top campaigns, and flagged underperformers.',
    input_schema: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          enum: ['meta', 'google', 'both'],
          description: 'Which ad platform(s) to query',
        },
      },
      required: ['platform'],
    },
  },
  async execute(input, supabase, tenantId) {
    const platform = (input.platform as string) ?? 'both'
    const result: Record<string, unknown> = {}

    if (platform === 'meta' || platform === 'both') {
      const { data: campaigns } = await supabase
        .from('meta_campaigns')
        .select('name, spend, roas, status, purchases, purchase_value')
        .eq('tenant_id', tenantId)
        .order('spend', { ascending: false })

      const all = campaigns ?? []
      const totalSpend = all.reduce((s, c) => s + Number(c.spend), 0)
      const totalRevenue = all.reduce((s, c) => s + Number(c.purchase_value), 0)
      const blendedRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0
      const pausedHighRoas = all.filter((c) => c.status?.toLowerCase() === 'paused' && Number(c.roas) >= 3)
      const underperforming = all.filter((c) => Number(c.spend) > 0 && Number(c.roas) < 1)

      result.meta = {
        total_spend: Math.round(totalSpend * 100) / 100,
        total_revenue: Math.round(totalRevenue * 100) / 100,
        blended_roas: Math.round(blendedRoas * 100) / 100,
        total_purchases: all.reduce((s, c) => s + (c.purchases ?? 0), 0),
        top_campaigns: all.slice(0, 5).map((c) => ({
          name: c.name,
          spend: Number(c.spend),
          roas: Number(c.roas),
          status: c.status,
          purchases: c.purchases,
        })),
        paused_high_roas: pausedHighRoas.map((c) => ({
          name: c.name,
          roas: Number(c.roas),
          note: 'Paused but high ROAS — consider reactivating',
        })),
        underperforming: underperforming.map((c) => ({
          name: c.name,
          spend: Number(c.spend),
          roas: Number(c.roas),
          note: 'ROAS below 1× — losing money',
        })),
      }
    }

    if (platform === 'google' || platform === 'both') {
      const { data: campaigns } = await supabase
        .from('google_campaigns')
        .select('name, spend, roas, status, conversions, conversion_value, data_source')
        .eq('tenant_id', tenantId)
        .order('conversion_value', { ascending: false })

      const all = campaigns ?? []
      const isGa4 = all.every((c) => c.data_source === 'ga4')
      const totalRevenue = all.reduce((s, c) => s + Number(c.conversion_value ?? 0), 0)
      const totalConversions = all.reduce((s, c) => s + Number(c.conversions ?? 0), 0)

      result.google = {
        data_source: isGa4 ? 'ga4_fallback' : 'google_ads_api',
        note: isGa4 ? 'Spend data unavailable (Google Ads API pending approval) — revenue from GA4' : null,
        total_revenue: Math.round(totalRevenue * 100) / 100,
        total_conversions: Math.round(totalConversions * 10) / 10,
        top_campaigns: all.slice(0, 5).map((c) => ({
          name: c.name,
          conversion_value: Number(c.conversion_value ?? 0),
          conversions: Number(c.conversions ?? 0),
          status: c.status,
        })),
      }
    }

    return result
  },
}

// ── Tool 10: get_promotion_history ────────────────────────────────────────────

const getPromotionHistory: AgentTool = {
  schema: {
    name: 'get_promotion_history',
    description: 'Get historical promotion performance and AI effectiveness scores.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Number of promotions (default 10)' },
        min_score: { type: 'number', description: 'Minimum AI score filter (0–100)' },
        max_score: { type: 'number', description: 'Maximum AI score filter (0–100)' },
      },
    },
  },
  async execute(input, supabase, tenantId) {
    const limit = (input.limit as number) ?? 10
    const minScore = input.min_score as number | undefined
    const maxScore = input.max_score as number | undefined

    let query = supabase
      .from('promotions')
      .select('name, description, discount_type, discount_value, score, orders_count, revenue, started_at, ended_at, created_at')
      .eq('tenant_id', tenantId)
      .order('score', { ascending: false })

    if (minScore !== undefined) query = query.gte('score', minScore)
    if (maxScore !== undefined) query = query.lte('score', maxScore)

    const { data } = await query.limit(limit)

    return {
      promotions: (data ?? []).map((p) => ({
        name: p.name,
        type: p.discount_type,
        value: p.discount_value,
        ai_score: p.score,
        orders: p.orders_count,
        revenue: Number(p.revenue),
        period: p.started_at && p.ended_at
          ? `${p.started_at?.slice(0, 10)} to ${p.ended_at?.slice(0, 10)}`
          : 'Ongoing',
        scored_at: p.created_at,
      })),
      count: (data ?? []).length,
    }
  },
}

// ── Tool 11: get_sales_channels ───────────────────────────────────────────────

const getSalesChannels: AgentTool = {
  schema: {
    name: 'get_sales_channels',
    description: 'Get revenue breakdown by sales channel (organic search, paid social, email, direct, etc.).',
    input_schema: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          enum: ['last_30_days', 'last_90_days', 'last_12_months'],
        },
      },
    },
  },
  async execute(input, supabase, tenantId) {
    const period = (input.period as string) ?? 'last_90_days'
    const since = periodToDate(period)

    const { data } = await supabase
      .from('orders')
      .select('total_price, utm_source, utm_medium, source_name, landing_site')
      .eq('tenant_id', tenantId)
      .eq('financial_status', 'paid')
      .gte('created_at', since)

    const channels: Record<string, number> = {
      organic_search: 0,
      paid_search: 0,
      paid_social: 0,
      email: 0,
      direct: 0,
      other: 0,
    }

    for (const o of data ?? []) {
      const revenue = Number(o.total_price)
      const src = (o.utm_source ?? '').toLowerCase()
      const med = (o.utm_medium ?? '').toLowerCase()
      const source = (o.source_name ?? '').toLowerCase()

      if (med === 'email' || src === 'klaviyo' || src === 'email') {
        channels.email += revenue
      } else if (med === 'cpc' || med === 'paid' || src === 'google_ads' || src === 'facebook_ads') {
        if (src.includes('facebook') || src.includes('meta') || src.includes('instagram')) {
          channels.paid_social += revenue
        } else {
          channels.paid_search += revenue
        }
      } else if (med === 'organic' || src === 'google' || src === 'bing') {
        channels.organic_search += revenue
      } else if (source === 'web' || !src) {
        channels.direct += revenue
      } else {
        channels.other += revenue
      }
    }

    const total = Object.values(channels).reduce((s, v) => s + v, 0)

    return {
      period,
      total_revenue: Math.round(total * 100) / 100,
      channels: Object.entries(channels)
        .map(([channel, revenue]) => ({
          channel,
          revenue: Math.round(revenue * 100) / 100,
          share: total > 0 ? ((revenue / total) * 100).toFixed(1) + '%' : '0%',
        }))
        .sort((a, b) => b.revenue - a.revenue),
    }
  },
}

// ── Tool 12: get_business_health_score ────────────────────────────────────────

const getBusinessHealthScore: AgentTool = {
  schema: {
    name: 'get_business_health_score',
    description: 'Get an overall business health summary across all connected platforms with key metrics and signals.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  async execute(_input, supabase, tenantId) {
    // Fetch all key metrics in parallel
    const [
      { data: recentOrders },
      { data: customers },
      { data: metaCampaigns },
      { data: googleCampaigns },
      { data: klaviyoCampaigns },
      { data: store },
    ] = await Promise.all([
      supabase.from('orders').select('total_price, created_at').eq('tenant_id', tenantId).eq('financial_status', 'paid').gte('created_at', daysAgo(30)),
      supabase.from('customers').select('total_spent, orders_count, updated_at').eq('tenant_id', tenantId),
      supabase.from('meta_campaigns').select('spend, roas, status').eq('tenant_id', tenantId),
      supabase.from('google_campaigns').select('conversion_value, conversions').eq('tenant_id', tenantId),
      supabase.from('klaviyo_campaigns').select('revenue_attributed, recipient_count').eq('tenant_id', tenantId),
      supabase.from('stores').select('last_synced_at, klaviyo_api_key, gsc_refresh_token, meta_access_token, google_ads_refresh_token, ga4_refresh_token').eq('id', STORE_ID).single(),
    ])

    const revenue30d = (recentOrders ?? []).reduce((s, o) => s + Number(o.total_price), 0)
    const orderCount30d = (recentOrders ?? []).length

    const allCustomers = customers ?? []
    const now = Date.now()
    const lapsedCount = allCustomers.filter((c) => now - new Date(c.updated_at).getTime() > 90 * 24 * 60 * 60 * 1000).length
    const vipCount = allCustomers.filter((c) => Number(c.total_spent) >= 1000 && c.orders_count >= 5).length

    const metaSpend = (metaCampaigns ?? []).reduce((s, c) => s + Number(c.spend), 0)
    const metaRoas = metaSpend > 0
      ? (metaCampaigns ?? []).reduce((s, c) => s + Number(c.spend) * Number(c.roas), 0) / metaSpend
      : 0

    const googleRevenue = (googleCampaigns ?? []).reduce((s, c) => s + Number(c.conversion_value ?? 0), 0)
    const emailRevenue = (klaviyoCampaigns ?? []).reduce((s, c) => s + Number(c.revenue_attributed), 0)

    const s = store as {
      last_synced_at: string | null
      klaviyo_api_key: string | null
      gsc_refresh_token: string | null
      meta_access_token: string | null
      google_ads_refresh_token: string | null
      ga4_refresh_token: string | null
    } | null

    return {
      summary: {
        revenue_last_30d: Math.round(revenue30d * 100) / 100,
        orders_last_30d: orderCount30d,
        avg_order_value: orderCount30d > 0 ? Math.round((revenue30d / orderCount30d) * 100) / 100 : 0,
        total_customers: allCustomers.length,
        lapsed_customers: lapsedCount,
        vip_customers: vipCount,
        lapsed_rate: allCustomers.length > 0
          ? ((lapsedCount / allCustomers.length) * 100).toFixed(1) + '%'
          : 'N/A',
      },
      advertising: {
        meta_spend: Math.round(metaSpend * 100) / 100,
        meta_roas: Math.round(metaRoas * 100) / 100,
        google_revenue: Math.round(googleRevenue * 100) / 100,
      },
      email: {
        klaviyo_revenue: Math.round(emailRevenue * 100) / 100,
      },
      connected_platforms: {
        shopify: true,
        klaviyo: !!s?.klaviyo_api_key,
        google_search_console: !!s?.gsc_refresh_token,
        meta_ads: !!s?.meta_access_token,
        google_ads: !!s?.google_ads_refresh_token,
        google_analytics: !!s?.ga4_refresh_token,
      },
      last_synced_at: s?.last_synced_at ?? null,
    }
  },
}

// ── Exported tools list ───────────────────────────────────────────────────────

export const agentTools: AgentTool[] = [
  getRevenueSummary,
  getTopCustomers,
  getCustomerSegments,
  getLapsedCustomers,
  getOrderTrends,
  getProductPerformance,
  getEmailPerformance,
  getSearchPerformance,
  getAdPerformance,
  getPromotionHistory,
  getSalesChannels,
  getBusinessHealthScore,
]

export const toolSchemas = agentTools.map((t) => t.schema)

export async function executeTool(
  name: string,
  input: ToolInput,
  supabase: SupabaseClient,
  tenantId: string
): Promise<unknown> {
  const tool = agentTools.find((t) => t.schema.name === name)
  if (!tool) throw new Error(`Unknown tool: ${name}`)
  return tool.execute(input, supabase, tenantId)
}

/**
 * Map tool name → human-readable status message shown in chat while tool runs
 */
export function toolStatusMessage(toolName: string): string {
  const messages: Record<string, string> = {
    get_revenue_summary:       'Checking your revenue data…',
    get_top_customers:         'Looking up your top customers…',
    get_customer_segments:     'Analyzing customer segments…',
    get_lapsed_customers:      'Finding lapsed customers…',
    get_order_trends:          'Pulling order trends…',
    get_product_performance:   'Analyzing product performance…',
    get_email_performance:     'Checking email campaigns…',
    get_search_performance:    'Reviewing search performance…',
    get_ad_performance:        'Analyzing ad campaigns…',
    get_promotion_history:     'Looking up promotion history…',
    get_sales_channels:        'Breaking down sales channels…',
    get_business_health_score: 'Running business health check…',
  }
  return messages[toolName] ?? 'Fetching data…'
}
