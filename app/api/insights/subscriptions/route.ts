import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createSupabaseServerClient } from '@/lib/supabase'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { metrics } = await req.json() as { metrics: Record<string, unknown> }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    messages: [{
      role: 'user',
      content: `You are a subscription business analyst for a professional eyelash extension supply company.
Analyze these subscription metrics and provide actionable insights.

Metrics:
${JSON.stringify(metrics, null, 2)}

Answer these questions concisely:
1. How healthy is the subscription program? What does the churn rate indicate?
2. Which interval (3w/4w/6w) retains customers best, and what does that tell us?
3. What is the MRR growth opportunity from converting adhesive one-time buyers to subscribers?
4. What does the subscriber vs non-subscriber LTV gap mean for marketing priority?
5. What is the single most important action to take this month?

Be specific — reference actual numbers. Format as plain text paragraphs, not bullet points.`,
    }],
  })

  const insight = response.content[0].type === 'text' ? response.content[0].text : ''
  return Response.json({ insight })
}
