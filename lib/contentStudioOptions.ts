// Shared Content Studio option lists — single source of truth for the values the
// form renders and the labels the generate route prints into the prompt.

export interface SelectOption {
  value: string
  label: string
}

export const CONTENT_TYPE_OPTIONS: SelectOption[] = [
  { value: 'product',      label: 'Product' },
  { value: 'collection',   label: 'Collection' },
  { value: 'landing-page', label: 'Landing Page' },
  { value: 'event',        label: 'Event' },
  { value: 'educational',  label: 'Educational' },
  { value: 'brand',        label: 'Brand' },
  { value: 'promotion',    label: 'Promotion' },
  { value: 'other',        label: 'Other' },
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

/** Content types that render a free-text topic/angle input in the form. */
export const CONTENT_TYPES_WITH_TOPIC_INPUT = new Set([
  'product',
  'collection',
  'educational',
  'brand',
  'other',
])

export function contentTypeLabel(value: string | null | undefined): string {
  return CONTENT_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? 'Product'
}

export function offerTypeLabel(value: string | null | undefined): string {
  return OFFER_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value ?? ''
}
