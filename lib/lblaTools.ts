// Canonical list of gateable LBLA tools — the single source of truth for
// middleware enforcement, per-page checks, the landing tiles, and the admin UI.
//
// A tool's `key` is what gets stored in user_tenants.lbla_tools.

export interface LblaTool {
  key: string
  label: string
  /** Page route prefix this tool owns. */
  prefix: string
  /**
   * API route prefixes serving this tool's data.
   *
   * IMPORTANT — this mapping FAILS CLOSED. proxy.ts denies any path under
   * /api/lbla/* or /api/skuvault/* that does not resolve to a tool here, so a
   * new API route is invisible to every non-admin until its prefix is added to
   * this list. That is deliberate: a route nobody has classified should not be
   * reachable by default. But it means "403 Forbidden" on a brand new endpoint
   * usually indicates a missing entry here rather than a real permissions
   * problem — the 403 body says which case it is.
   *
   * Prefixes match the path itself and anything nested beneath it, so a parent
   * prefix covers its sub-routes (e.g. '/api/lbla/reports/kll-wholesale' also
   * covers /upload, /manual and /decision).
   */
  apiPrefixes: string[]
  /**
   * Whether this tool can be handed out via user_tenants.lbla_tools.
   *
   * Defaults to true. 'admin' is the exception: /lbla/admin is opened by the
   * is_admin flag alone, so a grant would be inert. It stays in this list so the
   * route is still mapped and gated, but the admin screen does not offer it.
   */
  grantable?: boolean
}

export const LBLA_TOOLS: LblaTool[] = [
  {
    key: 'ideas',
    label: 'Campaign Ideas',
    prefix: '/lbla/ideas',
    apiPrefixes: ['/api/lbla/ideas'],
  },
  {
    key: 'content',
    label: 'Content Generator',
    prefix: '/lbla/content',
    apiPrefixes: [
      '/api/lbla/generate',
      '/api/lbla/score-content',
      '/api/lbla/suggest-topics',
      '/api/lbla/suggest-talking-points',
    ],
  },
  {
    key: 'sku-report',
    label: 'SKU Sales Report',
    prefix: '/lbla/sku-report',
    apiPrefixes: ['/api/skuvault'],
  },
  {
    key: 'shipping-margin',
    label: 'Shipping Margin',
    prefix: '/lbla/reports/shipping-margin',
    apiPrefixes: ['/api/lbla/reports/shipping-margin'],
  },
  {
    key: 'kll-royalty',
    label: 'KLL Royalty Report',
    prefix: '/lbla/reports/kll-royalty',
    apiPrefixes: ['/api/lbla/reports/kll-royalty'],
  },
  {
    key: 'kll-discount-summary',
    label: 'KLL Discount Summary',
    prefix: '/lbla/reports/kll-discount-summary',
    apiPrefixes: ['/api/lbla/reports/kll-discount-summary'],
  },
  {
    key: 'kll-wholesale',
    label: 'KLL Wholesale Report',
    prefix: '/lbla/reports/kll-wholesale',
    apiPrefixes: ['/api/lbla/reports/kll-wholesale'],
  },
  {
    key: 'discount-codes',
    label: 'Discount Codes',
    prefix: '/lbla/settings/discount-codes',
    apiPrefixes: ['/api/lbla/discount-codes'],
  },
  {
    key: 'admin',
    label: 'User Access',
    prefix: '/lbla/admin',
    apiPrefixes: ['/api/lbla/admin'],
    grantable: false,
  },
]

/** Every tool key, grantable or not — use for route mapping and lookups. */
export const LBLA_TOOL_KEYS = LBLA_TOOLS.map((t) => t.key)

/** The tools the admin screen offers as checkboxes and will store as grants. */
export const GRANTABLE_TOOLS = LBLA_TOOLS.filter((t) => t.grantable !== false)
export const GRANTABLE_TOOL_KEYS = GRANTABLE_TOOLS.map((t) => t.key)

export function toolLabel(key: string): string {
  return LBLA_TOOLS.find((t) => t.key === key)?.label ?? key
}

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

/**
 * Which tool owns this page path? Returns null for /lbla itself (the landing
 * page, always allowed) and for anything unrecognised.
 *
 * Prefixes are checked longest-first so nested routes cannot be shadowed by a
 * shorter sibling.
 */
export function toolForPagePath(pathname: string): LblaTool | null {
  const clean = pathname.replace(/\/+$/, '') || '/lbla'
  if (clean === '/lbla') return null
  return (
    [...LBLA_TOOLS]
      .sort((a, b) => b.prefix.length - a.prefix.length)
      .find((t) => matchesPrefix(clean, t.prefix)) ?? null
  )
}

/** Which tool owns this API path? Null when no mapping is defined. */
export function toolForApiPath(pathname: string): LblaTool | null {
  const clean = pathname.replace(/\/+$/, '') || pathname
  const candidates = LBLA_TOOLS.flatMap((t) => t.apiPrefixes.map((p) => ({ tool: t, prefix: p })))
  return (
    candidates
      .sort((a, b) => b.prefix.length - a.prefix.length)
      .find((c) => matchesPrefix(clean, c.prefix))?.tool ?? null
  )
}

/** Does this grant list cover the given tool? */
export function hasToolAccess(grants: string[] | null | undefined, key: string): boolean {
  return (grants ?? []).includes(key)
}
