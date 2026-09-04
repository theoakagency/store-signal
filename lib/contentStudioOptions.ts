// Shared Content Studio option lists — single source of truth for the values the
// form renders and the labels the generate route prints into the prompt.
//
// Content is described by two independent axes:
//   SUBJECT — what the content is about (drives which fields render)
//   GOAL    — what the content is for (drives tone)
// All subject/goal pairings are valid.

export interface SelectOption {
  value: string
  label: string
}

export const SUBJECT_OPTIONS: SelectOption[] = [
  { value: 'products', label: 'Products or Collection' },
  { value: 'page',     label: 'Page or Event' },
  { value: 'none',     label: 'Nothing specific' },
]

export const GOAL_OPTIONS: SelectOption[] = [
  { value: 'educate',  label: 'Educate' },
  { value: 'promote',  label: 'Promote an offer' },
  { value: 'announce', label: 'Announce or launch' },
  { value: 'brand',    label: 'Brand story' },
]

export const OFFER_TYPE_OPTIONS: SelectOption[] = [
  { value: 'percent-off',    label: 'Percent Off' },
  { value: 'dollar-off',     label: 'Dollar Off' },
  { value: 'free-shipping',  label: 'Free Shipping' },
  { value: 'bogo',           label: 'Buy One Get One' },
  { value: 'bundle',         label: 'Bundle Deal' },
  { value: 'flash-sale',     label: 'Flash Sale' },
  { value: 'loyalty-reward', label: 'Loyalty Reward' },
  { value: 'referral',       label: 'Referral Offer' },
]

// Tonal guidance printed into the system prompt, derived from goal alone.
export const GOAL_TONE: Record<string, string> = {
  educate:  'Teach first and sell softly, leading with what the reader walks away knowing.',
  promote:  'Create urgency without desperation, and lead with the offer.',
  announce: 'Stay energetic and forward-looking, focused on what is new and why it matters.',
  brand:    'Tell a story and speak to the community, with no hard sell.',
}

export function subjectLabel(value: string | null | undefined): string {
  return SUBJECT_OPTIONS.find((o) => o.value === value)?.label ?? 'Nothing specific'
}

export function goalLabel(value: string | null | undefined): string {
  return GOAL_OPTIONS.find((o) => o.value === value)?.label ?? 'Educate'
}

export function offerTypeLabel(value: string | null | undefined): string {
  return OFFER_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value ?? ''
}

export function goalTone(value: string | null | undefined): string {
  return GOAL_TONE[value ?? ''] ?? GOAL_TONE.educate
}
