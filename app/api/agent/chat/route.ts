/**
 * POST /api/agent/chat
 *
 * Agentic chat endpoint with SSE streaming.
 * Body: { message: string, conversation_id?: string }
 *
 * SSE event types:
 *  data: { type: 'tool_start', tool: string, status_message: string }
 *  data: { type: 'tool_end', tool: string }
 *  data: { type: 'text_delta', delta: string }
 *  data: { type: 'done', conversation_id: string, tools_used: string[] }
 *  data: { type: 'error', message: string }
 */

import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'
import { toolSchemas, executeTool, toolStatusMessage } from '@/lib/agentTools'

export const maxDuration = 120

const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const STORE_ID = '00000000-0000-0000-0000-000000000002'

function sse(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`
}

export async function POST(req: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { message, conversation_id } = (await req.json()) as {
    message: string
    conversation_id?: string
  }

  if (!message?.trim()) {
    return Response.json({ error: 'Message is required' }, { status: 400 })
  }

  const service = createSupabaseServiceClient()
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  // ── Conversation setup ──────────────────────────────────────────────────────
  let conversationId = conversation_id

  if (!conversationId) {
    const { data: conv } = await service
      .from('conversations')
      .insert({ tenant_id: TENANT_ID, title: message.slice(0, 60) })
      .select('id')
      .single()
    conversationId = conv?.id
  }

  if (!conversationId) {
    return Response.json({ error: 'Failed to create conversation' }, { status: 500 })
  }

  // ── Load history (last 10 messages) ────────────────────────────────────────
  const { data: history } = await service
    .from('messages')
    .select('role, content, tool_calls, tool_results')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(10)

  const priorMessages: Anthropic.MessageParam[] = []
  for (const msg of history ?? []) {
    if (msg.role === 'user') {
      priorMessages.push({ role: 'user', content: msg.content })
    } else if (msg.role === 'assistant') {
      // Reconstruct assistant message with any tool_use blocks
      if (msg.tool_calls && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
          const toolBlocks = msg.tool_calls as Anthropic.ToolUseBlock[]
        const contentBlocks: Anthropic.MessageParam['content'] = msg.content
          ? [{ type: 'text' as const, text: msg.content } as unknown as Anthropic.ContentBlock, ...toolBlocks]
          : toolBlocks
        priorMessages.push({ role: 'assistant', content: contentBlocks })
        // Add corresponding tool results
        if (msg.tool_results && Array.isArray(msg.tool_results)) {
          priorMessages.push({
            role: 'user',
            content: (msg.tool_results as Anthropic.ToolResultBlockParam[]),
          })
        }
      } else {
        priorMessages.push({ role: 'assistant', content: msg.content })
      }
    }
  }

  // ── Context cache ───────────────────────────────────────────────────────────
  const { data: ctxCache } = await service
    .from('agent_context_cache')
    .select('context, calculated_at')
    .eq('tenant_id', TENANT_ID)
    .maybeSingle()

  const contextSnippet = ctxCache?.context
    ? `\n\nCURRENT BUSINESS SNAPSHOT (built ${new Date(ctxCache.calculated_at).toLocaleDateString()}):\nIMPORTANT: Each section has a "time_window" field — always cite the window when you reference a figure. The _data_windows section at the top explains which platforms share comparable windows (Meta, Google Ads, GA4, and GSC are all 90-day and directly comparable; Klaviyo is 12-month; Shopify revenue is 30-day; subscriptions are current state).\n${JSON.stringify(ctxCache.context, null, 2)}`
    : ''

  // ── Store info ──────────────────────────────────────────────────────────────
  const { data: store } = await service
    .from('stores')
    .select('shopify_domain, name, klaviyo_api_key, gsc_refresh_token, meta_access_token, google_ads_refresh_token, ga4_refresh_token, recharge_api_token, loyaltylion_token')
    .eq('id', STORE_ID)
    .single()

  const s = store as {
    shopify_domain: string
    name: string
    klaviyo_api_key: string | null
    gsc_refresh_token: string | null
    meta_access_token: string | null
    google_ads_refresh_token: string | null
    ga4_refresh_token: string | null
    recharge_api_token: string | null
    loyaltylion_token: string | null
  } | null

  const connected: string[] = ['Shopify']
  if (s?.klaviyo_api_key) connected.push('Klaviyo')
  if (s?.gsc_refresh_token) connected.push('Google Search Console')
  if (s?.meta_access_token) connected.push('Meta Ads')
  if (s?.google_ads_refresh_token) connected.push('Google Ads')
  if (s?.ga4_refresh_token) connected.push('Google Analytics 4')
  if (s?.recharge_api_token) connected.push('Recharge (Subscriptions)')
  if (s?.loyaltylion_token) connected.push('LoyaltyLion')

  const systemPrompt = `You are the Store Signal AI — a business intelligence analyst for ${s?.name ?? 'this store'} (${s?.shopify_domain ?? 'their Shopify store'}).

You have access to real-time data from their connected platforms: ${connected.join(', ')}.

Your job is to answer business questions clearly and directly, using real data. When answering:
- Always use the available tools to get current data before answering — never guess or use generic advice
- Be specific: reference actual numbers, customer emails/names, campaign names, and dates from the data
- Be direct: give a clear answer first, then explain the reasoning
- Be actionable: every insight should come with a specific recommended next action
- Use plain language: the audience is a business owner, not a data analyst
- Format numbers as currency where appropriate ($1,234)
- When showing lists of customers or campaigns, format them clearly
- For subscription questions use get_subscription_data; for loyalty use get_loyalty_data; for SEO use get_seo_intelligence
- For product bundle/affinity questions use get_product_affinities; for individual customer profiles use get_customer_profile

DATA WINDOW RULES — follow strictly:
- Meta Ads, Google Ads, GA4, and Google Search Console all cover the last 90 days — these four are directly comparable
- Klaviyo email revenue covers the last 12 months (API limit) — do NOT add to or compare against 90-day ad spend without noting the window difference
- Shopify revenue in the snapshot covers the last 30 days — do NOT compare to 90-day ad figures without normalizing
- Customer LTV is based on 24-month Shopify history — flag as understated for long-standing customers
- Subscription data (MRR, active subscribers) is current state; churn rate is last 30 days
- LoyaltyLion data covers ~20k of 56k+ actual members — metrics derived from this subset understate the full program
- When a user asks to compare figures from different platforms, always cite which window each figure covers

About this business:
- Store: ${s?.shopify_domain ?? 'lashboxla.myshopify.com'}
- Industry: Professional eyelash extension supplies (B2B-adjacent)
- Customer type: Professional lash artists and estheticians — need-based, professional buyers
- Key insight: Customers restock based on inventory needs, not promotional incentives. Urgency-based promotions underperform; product-focused and professional-validation messaging outperforms.
- Subscription product: Adhesive (lash glue) is the #1 subscription product — customers deplete on a predictable cadence (every 3–6 weeks)
- Loyalty program: Multi-tier (Glow, Allure, Icon, Empire) with 56,000+ members; top tiers are B2B salon buyers
- Connected platforms: ${connected.join(', ')}

When you don't have data for something (e.g. a platform isn't connected), say so clearly and explain what connecting it would enable.${contextSnippet}`

  // ── SSE stream ──────────────────────────────────────────────────────────────
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(sse(data)))
      }

      try {
        const messages: Anthropic.MessageParam[] = [
          ...priorMessages,
          { role: 'user', content: message },
        ]

        const toolsUsed: string[] = []
        const allToolCalls: Anthropic.ToolUseBlock[] = []
        const allToolResults: Anthropic.ToolResultBlockParam[] = []
        let finalText = ''

        // ── Agentic loop ────────────────────────────────────────────────────
        let continueLoop = true
        while (continueLoop) {
          const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 4096,
            system: systemPrompt,
            tools: toolSchemas as Anthropic.Tool[],
            messages,
          })

          // Process response content blocks
          const toolUseBlocks: Anthropic.ToolUseBlock[] = []
          let assistantText = ''

          for (const block of response.content) {
            if (block.type === 'text') {
              assistantText += block.text
              // Stream text deltas word-by-word for a typing effect
              const words = block.text.split(' ')
              for (const word of words) {
                send({ type: 'text_delta', delta: word + ' ' })
              }
            } else if (block.type === 'tool_use') {
              toolUseBlocks.push(block)
            }
          }

          if (assistantText) {
            finalText += assistantText
          }

          if (response.stop_reason === 'tool_use' && toolUseBlocks.length > 0) {
            // Execute each tool
            const toolResultBlocks: Anthropic.ToolResultBlockParam[] = []

            for (const toolBlock of toolUseBlocks) {
              send({ type: 'tool_start', tool: toolBlock.name, status_message: toolStatusMessage(toolBlock.name) })

              try {
                const result = await executeTool(
                  toolBlock.name,
                  toolBlock.input as Record<string, unknown>,
                  service,
                  TENANT_ID
                )
                toolResultBlocks.push({
                  type: 'tool_result',
                  tool_use_id: toolBlock.id,
                  content: JSON.stringify(result),
                })
                if (!toolsUsed.includes(toolBlock.name)) toolsUsed.push(toolBlock.name)
                allToolCalls.push(toolBlock)
              } catch (err) {
                toolResultBlocks.push({
                  type: 'tool_result',
                  tool_use_id: toolBlock.id,
                  content: `Error: ${(err as Error).message}`,
                  is_error: true,
                })
              }

              send({ type: 'tool_end', tool: toolBlock.name })
            }

            allToolResults.push(...toolResultBlocks)

            // Add assistant turn + tool results to message history for next loop
            messages.push({ role: 'assistant', content: response.content })
            messages.push({ role: 'user', content: toolResultBlocks })
          } else {
            // Done — no more tool calls
            continueLoop = false
          }
        }

        // ── Persist messages ────────────────────────────────────────────────
        await service.from('messages').insert([
          {
            conversation_id: conversationId,
            tenant_id: TENANT_ID,
            role: 'user',
            content: message,
          },
          {
            conversation_id: conversationId,
            tenant_id: TENANT_ID,
            role: 'assistant',
            content: finalText,
            tool_calls: allToolCalls.length > 0 ? allToolCalls : null,
            tool_results: allToolResults.length > 0 ? allToolResults : null,
          },
        ])

        // ── Update conversation updated_at ──────────────────────────────────
        await service
          .from('conversations')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', conversationId)

        // ── Auto-generate title after first message ─────────────────────────
        if ((history ?? []).length === 0) {
          try {
            const titleResponse = await anthropic.messages.create({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 20,
              messages: [{
                role: 'user',
                content: `Generate a 4–6 word title for a chat that starts with: "${message.slice(0, 120)}". Reply with ONLY the title, no quotes.`,
              }],
            })
            const title = titleResponse.content[0].type === 'text'
              ? titleResponse.content[0].text.trim().slice(0, 60)
              : message.slice(0, 60)

            await service
              .from('conversations')
              .update({ title })
              .eq('id', conversationId)

            send({ type: 'title_update', title, conversation_id: conversationId })
          } catch {
            // Non-fatal — title stays as truncated first message
          }
        }

        // ── Follow-up suggestions ───────────────────────────────────────────
        try {
          const suggResponse = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 150,
            messages: [{
              role: 'user',
              content: `The user asked: "${message}"\nThe assistant answered about: ${toolsUsed.join(', ') || 'general business data'}\n\nGenerate 2 short follow-up questions the user might want to ask next. Each question should be under 10 words. Output as JSON array of strings only, e.g. ["Question 1?", "Question 2?"]`,
            }],
          })
          const raw = suggResponse.content[0].type === 'text' ? suggResponse.content[0].text.trim() : '[]'
          const match = raw.match(/\[[\s\S]*\]/)
          const suggestions = match ? JSON.parse(match[0]) as string[] : []
          send({ type: 'suggestions', suggestions: suggestions.slice(0, 3) })
        } catch {
          // Non-fatal
        }

        send({ type: 'done', conversation_id: conversationId, tools_used: toolsUsed })
      } catch (err) {
        send({ type: 'error', message: (err as Error).message })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
