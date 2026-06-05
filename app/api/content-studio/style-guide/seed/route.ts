import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase'

const STORE_ID = '00000000-0000-0000-0000-000000000002'

const DEFAULT_RULES: { category: 'avoid' | 'enforce' | 'vocabulary' | 'examples'; rule: string }[] = [
  // avoid
  { category: 'avoid', rule: "Never use em dashes (—) or en dashes (–). Rewrite the sentence or use a comma instead." },
  { category: 'avoid', rule: "Never use the word 'game-changer' or 'game changer'" },
  { category: 'avoid', rule: "Never use 'elevate', 'unlock', or 'empower' as verbs directed at the reader" },
  { category: 'avoid', rule: "Never open with 'I hope this finds you well' or any variant" },
  { category: 'avoid', rule: "Never use more than one exclamation point per version" },
  { category: 'avoid', rule: "Never use the Oxford comma" },
  { category: 'avoid', rule: "Never use 'revolutionary', 'cutting-edge', or 'state-of-the-art'" },

  // enforce
  { category: 'enforce', rule: "Write in second person — 'you' and 'your clients', not 'lash artists' in third person" },
  { category: 'enforce', rule: "Vary sentence length — mix short punchy sentences with longer ones. Avoid uniform rhythm." },
  { category: 'enforce', rule: "Numbers under 10 are written out (one, two, three). 10 and above use numerals." },
  { category: 'enforce', rule: "Speak to the business reality — reference client retention, restock timing, appointment books" },
  { category: 'enforce', rule: "Write like a peer who understands being behind the bed managing 6+ clients a day" },

  // vocabulary
  { category: 'vocabulary', rule: "Say 'lash artist' not 'technician' or 'stylist'" },
  { category: 'vocabulary', rule: "Say 'your clients' not 'customers' when referring to the artist's own clientele" },
  { category: 'vocabulary', rule: "Say 'retention' as a technical term for adhesive bond longevity — don't use it loosely" },
  { category: 'vocabulary', rule: "Use 'lash lift' not 'lash perm' — these are different services" },
]

export async function POST() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createSupabaseServiceClient()

  // Idempotency check — don't seed twice
  const { count } = await service
    .from('style_guide_rules')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', STORE_ID)

  if ((count ?? 0) > 0) {
    return Response.json({ success: true, seeded: false, message: 'Rules already exist' })
  }

  const rows = DEFAULT_RULES.map((r, i) => ({
    store_id:   STORE_ID,
    category:   r.category,
    rule:       r.rule,
    sort_order: i,
  }))

  const { error } = await service.from('style_guide_rules').insert(rows)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ success: true, seeded: true, count: rows.length })
}
