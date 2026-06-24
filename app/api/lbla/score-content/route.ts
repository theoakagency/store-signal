import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createSupabaseServiceClient } from '@/lib/supabase'

// Public endpoint — no user auth required (LBLA team tool)
// Secondary Claude call for brand-voice scoring. Non-blocking from the caller's
// perspective; generation does not wait for this result.

export const maxDuration = 30

const STORE_ID = '00000000-0000-0000-0000-000000000002'

interface VersionScore {
  score: number
  violations: { rule: string; text: string; suggestion: string }[]
  passed: boolean
}

interface ScoreResponse {
  scores: VersionScore[]
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    versions: unknown[]
    channel: 'email' | 'sms' | 'push'
  }

  const { versions, channel } = body
  if (!versions?.length || !channel) {
    return Response.json({ error: 'versions and channel are required' }, { status: 400 })
  }

  const service = createSupabaseServiceClient()
  const { data: styleRules } = await service
    .from('style_guide_rules')
    .select('category, rule')
    .eq('store_id', STORE_ID)
    .eq('active', true)
    .order('sort_order')

  const rules = styleRules ?? []
  const avoidRules   = rules.filter((r) => r.category === 'avoid').map((r) => r.rule)
  const enforceRules = rules.filter((r) => r.category === 'enforce').map((r) => r.rule)
  const vocabRules   = rules.filter((r) => r.category === 'vocabulary').map((r) => r.rule)

  const BRAND_RULES = [
    'Never use em dashes (--) or en dashes (-) as punctuation',
    'Never use more than one exclamation point across all versions combined',
    'Never use: "game-changer", "elevate", "unlock", "revolutionary", "cutting-edge", "state-of-the-art"',
    'Write in a peer-to-peer tone -- artist to artist, not brand to consumer',
    'Avoid generic beauty brand language',
    ...enforceRules,
    ...avoidRules.map((r) => `Avoid: ${r}`),
    ...vocabRules.map((r) => `Vocabulary: ${r}`),
  ]

  function formatVersion(v: unknown, idx: number): string {
    const r = v as Record<string, string>
    const lines = [`Version ${idx + 1}:`]
    if (channel === 'email') {
      if (r.subject)   lines.push(`  Subject: ${r.subject}`)
      if (r.preheader) lines.push(`  Preheader: ${r.preheader}`)
      if (r.body)      lines.push(`  Body: ${r.body}`)
    } else if (channel === 'sms') {
      if (r.message) lines.push(`  Message: ${r.message}`)
    } else {
      if (r.title)   lines.push(`  Title: ${r.title}`)
      if (r.message) lines.push(`  Message: ${r.message}`)
    }
    return lines.join('\n')
  }

  const versionText = versions.map((v, i) => formatVersion(v, i)).join('\n\n')

  const systemPrompt = `You are a brand-voice auditor for LashBox LA. Score each version of marketing copy against the brand rules below. Be honest and constructive.

BRAND RULES:
${BRAND_RULES.map((r) => `- ${r}`).join('\n')}

For each version, return:
- score: integer 0-100 (100 = perfect, subtract 5-15 per violation)
- passed: true if score >= 75
- violations: array of { rule (which rule was broken), text (the offending text, max 40 chars), suggestion (short fix) }

Return ONLY valid JSON matching this exact schema (no markdown, no preamble):
{
  "scores": [
    { "score": 90, "passed": true, "violations": [] },
    { "score": 72, "passed": false, "violations": [{ "rule": "No em dashes", "text": "artists -- build", "suggestion": "artists, build" }] }
  ]
}

One entry per version, in the same order as the input.`

  const userPrompt = `Score these ${versions.length} ${channel} version(s):\n\n${versionText}`

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : '{}'
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const parsed = JSON.parse(cleaned) as ScoreResponse

    if (!Array.isArray(parsed.scores)) {
      return Response.json({ error: 'Invalid response shape from scoring model' }, { status: 500 })
    }

    return Response.json({ scores: parsed.scores })
  } catch (err) {
    return Response.json({ error: `Scoring failed: ${(err as Error).message}` }, { status: 500 })
  }
}
