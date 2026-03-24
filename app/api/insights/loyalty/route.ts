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
      content: `You are a loyalty program analyst for a professional eyelash extension supply company.
Analyze these loyalty program metrics and answer these key business questions.

Metrics:
${JSON.stringify(metrics, null, 2)}

Answer concisely:
1. Do the points multiplier promotions actually drive incremental purchases? Reference the lift data.
2. What is the true cost of the loyalty program? (Consider points liability and redemption rate)
3. Which customers are enrolled but never engaging? What should we do about them?
4. What would happen if the program was simplified — fewer tiers, clearer rewards?
5. Is this program worth the investment for a B2B-adjacent professional buyer audience?

Reference specific numbers. Be direct and practical. Plain text paragraphs.`,
    }],
  })

  const insight = response.content[0].type === 'text' ? response.content[0].text : ''
  return Response.json({ insight })
}
