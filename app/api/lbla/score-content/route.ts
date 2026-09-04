import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createSupabaseServiceClient } from '@/lib/supabase'

// Requires a signed-in user; /lbla + /api/lbla are gated behind Supabase login in proxy.ts (LBLA team tool)
// Secondary Claude call that CORRECTS style-rule violations rather than reporting
// them. Non-blocking from the caller's perspective; generation does not wait for
// this result. Only unambiguous fixes are applied — anything needing a genuine
// rewrite is returned as a flag for a human to judge.

export const maxDuration = 30

const STORE_ID = '00000000-0000-0000-0000-000000000002'

/** An edit the pass made on its own. */
interface AppliedFix {
  rule: string
  before: string
  after: string
}

/** A violation left in place because fixing it would change the meaning. */
interface FlaggedIssue {
  rule: string
  text: string
  suggestion: string
}

interface VersionReview {
  version: Record<string, string>
  fixes: AppliedFix[]
  flags: FlaggedIssue[]
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

  // Field shape per channel, so the model returns the same keys it was given.
  const FIELD_SHAPE: Record<string, string> = {
    email: '{ "subject": "...", "preheader": "...", "body": "..." }',
    sms:   '{ "message": "..." }',
    push:  '{ "title": "...", "message": "..." }',
  }

  const systemPrompt = `You are a copy editor for LashBox LA. You are given marketing copy that must comply with the brand rules below. Your job is to CORRECT violations, not to grade the copy.

BRAND RULES:
${BRAND_RULES.map((r) => `- ${r}`).join('\n')}

HOW TO DECIDE WHAT TO CHANGE:

Apply a fix yourself ONLY when the correction is unambiguous and does not change what the sentence means. These are the mechanical cases:
- Punctuation: removing an Oxford comma, replacing an em dash or en dash with a comma, period, or rephrased clause
- Swapping a banned word or phrase for a plain equivalent that carries the same meaning
- Removing a surplus exclamation point
- Casing, spelling, or vocabulary substitutions named directly by a rule

Do NOT rewrite to fix anything else. If a violation is about tone, framing, structure, or claim, and correcting it would require you to change what the sentence actually says, LEAVE THE TEXT EXACTLY AS IT IS and report it as a flag instead. When in doubt, flag rather than edit. It is much worse to alter the writer's meaning than to leave a soft violation in place.

Preserve everything you are not fixing, character for character. Do not improve, tighten, reorder, or restyle copy that does not break a rule.

RESPONSE FORMAT: Return ONLY valid JSON, no markdown, no code fences, no preamble.
{
  "results": [
    {
      "version": ${FIELD_SHAPE[channel] ?? FIELD_SHAPE.email},
      "fixes": [{ "rule": "which rule", "before": "exact original text, max 60 chars", "after": "the replacement, max 60 chars" }],
      "flags": [{ "rule": "which rule", "text": "the offending text, max 60 chars", "suggestion": "what a human should consider" }]
    }
  ]
}

"version" must contain the corrected copy with every applied fix already in place, using exactly the field names shown. One entry per input version, in the same order. A version with nothing to change returns its original text with empty fixes and flags arrays.`

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
  const userPrompt = `Correct these ${versions.length} ${channel} version(s):\n\n${versionText}`

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  try {
    const message = await anthropic.messages.create({
      // Sonnet rather than Haiku: this pass now rewrites user-facing copy, so
      // fidelity to the original text matters more than the cost saving.
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : '{}'
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const parsed = JSON.parse(cleaned) as { results?: VersionReview[] }

    if (!Array.isArray(parsed.results)) {
      return Response.json({ error: 'Invalid response shape from editing model' }, { status: 500 })
    }

    // Never let a malformed or truncated entry drop a version: fall back to the
    // original copy whenever the corrected text is missing.
    const results: VersionReview[] = versions.map((original, i) => {
      const r = parsed.results?.[i]
      const corrected = r?.version && Object.keys(r.version).length > 0
        ? r.version
        : (original as Record<string, string>)
      return {
        version: corrected,
        fixes: Array.isArray(r?.fixes) ? r.fixes : [],
        flags: Array.isArray(r?.flags) ? r.flags : [],
      }
    })

    return Response.json({ results })
  } catch (err) {
    return Response.json({ error: `Editing pass failed: ${(err as Error).message}` }, { status: 500 })
  }
}
