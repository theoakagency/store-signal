/**
 * SEMrush API client
 * Docs: https://developer.semrush.com/api/v3/analytics/
 *
 * SEMrush returns semicolon-delimited CSV with \r\n line endings.
 * First row is column headers. All requests use ?key={apiKey} for auth.
 */

const BASE_URL = 'https://api.semrush.com'

// ── CSV parser ────────────────────────────────────────────────────────────────

/**
 * Parse SEMrush's semicolon-delimited CSV response into an array of objects.
 * Handles \r\n and \n line endings.
 */
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, '\n').trim().split('\n')
  if (lines.length < 2) return []
  const headers = lines[0].split(';')
  return lines.slice(1).map((line) => {
    const values = line.split(';')
    return Object.fromEntries(headers.map((h, i) => [h.trim(), (values[i] ?? '').trim()]))
  })
}

async function fetchSemrush(apiKey: string, params: Record<string, string>): Promise<Record<string, string>[]> {
  const query = new URLSearchParams({ key: apiKey, ...params })
  const res = await fetch(`${BASE_URL}/?${query}`)
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`SEMrush API error ${res.status}: ${body.slice(0, 200)}`)
  }
  const text = await res.text()
  // SEMrush returns "ERROR 50 :: NOTHING FOUND" style errors in the body
  if (text.startsWith('ERROR')) {
    const msg = text.trim()
    // ERROR 50 = nothing found — not a fatal error
    if (msg.includes('NOTHING FOUND') || msg.includes('50 ::')) return []
    throw new Error(`SEMrush error: ${msg}`)
  }
  return parseCsv(text)
}

async function fetchSemrushAnalytics(apiKey: string, params: Record<string, string>): Promise<Record<string, string>[]> {
  const query = new URLSearchParams({ key: apiKey, ...params })
  const res = await fetch(`${BASE_URL}/analytics/v1/?${query}`)
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`SEMrush Analytics API error ${res.status}: ${body.slice(0, 200)}`)
  }
  const text = await res.text()
  if (text.startsWith('ERROR')) {
    if (text.includes('NOTHING FOUND') || text.includes('50 ::')) return []
    throw new Error(`SEMrush error: ${text.trim()}`)
  }
  return parseCsv(text)
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SemrushDomainOverview {
  organicKeywords: number
  organicTraffic: number
  organicCost: number
  paidKeywords: number
  paidTraffic: number
  rank: number
}

export interface SemrushKeyword {
  keyword: string
  position: number
  previousPosition: number
  positionChange: number
  searchVolume: number
  cpc: number
  url: string
  trafficPercent: number
  competition: number
}

export interface SemrushCompetitor {
  domain: string
  commonKeywords: number
  organicKeywords: number
  organicTraffic: number
  organicCost: number
  competitionLevel: number
}

export interface SemrushKeywordGap {
  keyword: string
  competitorDomain: string
  competitorPosition: number
  ourPosition: number | null
  searchVolume: number
  opportunityScore: number
}

export interface SemrushBacklinks {
  totalBacklinks: number
  referringDomains: number
  referringUrls: number
  referringIps: number
}

export interface SemrushTrafficMonth {
  date: string
  organicKeywords: number
  organicTraffic: number
}

// ── Column name helper ────────────────────────────────────────────────────────
// SEMrush returns full human-readable column names regardless of the short codes
// used in export_columns. This helper tries each candidate name in order.

function col(row: Record<string, string>, ...names: string[]): string {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== '') return row[name]
  }
  return ''
}

// ── Public API functions ──────────────────────────────────────────────────────

export async function getDomainOverview(apiKey: string, domain: string): Promise<SemrushDomainOverview> {
  const rows = await fetchSemrush(apiKey, {
    type: 'domain_ranks',
    export_columns: 'Dn,Rk,Or,Ot,Oc,Ad,At,Ac',
    domain,
    database: 'us',
  })
  const row = rows[0] ?? {}
  return {
    organicKeywords: parseInt(col(row, 'Organic Keywords', 'Or') || '0', 10) || 0,
    organicTraffic: parseInt(col(row, 'Organic Traffic', 'Ot') || '0', 10) || 0,
    organicCost: parseFloat(col(row, 'Organic Cost', 'Oc') || '0') || 0,
    paidKeywords: parseInt(col(row, 'Adwords Keywords', 'Ad') || '0', 10) || 0,
    paidTraffic: parseInt(col(row, 'Adwords Traffic', 'At') || '0', 10) || 0,
    rank: parseInt(col(row, 'Rank', 'Rk') || '0', 10) || 0,
  }
}

export async function getOrganicKeywords(
  apiKey: string,
  domain: string,
  limit = 100
): Promise<SemrushKeyword[]> {
  const rows = await fetchSemrush(apiKey, {
    type: 'domain_organic',
    export_columns: 'Ph,Po,Pp,Pd,Nq,Cp,Ur,Tr,Co',
    domain,
    database: 'us',
    display_limit: String(limit),
    display_sort: 'tr_desc',
  })
  return rows.map((r) => ({
    keyword: col(r, 'Keyword', 'Ph'),
    position: parseInt(col(r, 'Position', 'Po') || '0', 10) || 0,
    previousPosition: parseInt(col(r, 'Previous Position', 'Pp') || '0', 10) || 0,
    positionChange: parseInt(col(r, 'Difference', 'Position Difference', 'Pd') || '0', 10) || 0,
    searchVolume: parseInt(col(r, 'Search Volume', 'Nq') || '0', 10) || 0,
    cpc: parseFloat(col(r, 'CPC', 'Cp') || '0') || 0,
    url: col(r, 'URL', 'Ur'),
    trafficPercent: parseFloat(col(r, 'Traffic (%)', 'Traffic', 'Tr') || '0') || 0,
    competition: parseFloat(col(r, 'Competition', 'Co') || '0') || 0,
  })).filter((k) => k.keyword)
}

export async function getKeywordPositionChanges(
  apiKey: string,
  domain: string
): Promise<SemrushKeyword[]> {
  // Get keywords sorted by biggest position drop (pd_asc = most negative change first)
  const rows = await fetchSemrush(apiKey, {
    type: 'domain_organic',
    export_columns: 'Ph,Po,Pp,Pd,Nq,Cp,Ur,Tr,Co',
    domain,
    database: 'us',
    display_limit: '50',
    display_sort: 'pd_asc',
    display_filter: '%2B%7CPd%7CLt%7C0', // Pd < 0 (position increased in number = lost ranking)
  })
  return rows.map((r) => ({
    keyword: col(r, 'Keyword', 'Ph'),
    position: parseInt(col(r, 'Position', 'Po') || '0', 10) || 0,
    previousPosition: parseInt(col(r, 'Previous Position', 'Pp') || '0', 10) || 0,
    positionChange: parseInt(col(r, 'Difference', 'Position Difference', 'Pd') || '0', 10) || 0,
    searchVolume: parseInt(col(r, 'Search Volume', 'Nq') || '0', 10) || 0,
    cpc: parseFloat(col(r, 'CPC', 'Cp') || '0') || 0,
    url: col(r, 'URL', 'Ur'),
    trafficPercent: parseFloat(col(r, 'Traffic (%)', 'Traffic', 'Tr') || '0') || 0,
    competition: parseFloat(col(r, 'Competition', 'Co') || '0') || 0,
  })).filter((k) => k.keyword)
}

export async function getCompetitors(apiKey: string, domain: string): Promise<SemrushCompetitor[]> {
  const rows = await fetchSemrush(apiKey, {
    type: 'domain_organic_organic',
    export_columns: 'Dn,Cr,Np,Or,Ot,Oc,Ad',
    domain,
    database: 'us',
    display_limit: '10',
  })
  return rows.map((r) => ({
    domain: col(r, 'Domain', 'Dn'),
    competitionLevel: parseFloat(col(r, 'Competition Level', 'Competitor Relevance', 'Cr') || '0') || 0,
    commonKeywords: parseInt(col(r, 'Common Keywords', 'Np') || '0', 10) || 0,
    organicKeywords: parseInt(col(r, 'Organic Keywords', 'Or') || '0', 10) || 0,
    organicTraffic: parseInt(col(r, 'Organic Traffic', 'Ot') || '0', 10) || 0,
    organicCost: parseFloat(col(r, 'Organic Cost', 'Oc') || '0') || 0,
  })).filter((c) => c.domain)
}

export async function getKeywordGap(
  apiKey: string,
  ourDomain: string,
  competitorDomain: string
): Promise<SemrushKeywordGap[]> {
  // Get competitor's top keywords in positions 1-10
  const competitorRows = await fetchSemrush(apiKey, {
    type: 'domain_organic',
    export_columns: 'Ph,Po,Nq',
    domain: competitorDomain,
    database: 'us',
    display_limit: '100',
    display_filter: '%2B%7CPo%7CLt%7C11', // Position <= 10
    display_sort: 'nq_desc',
  })

  if (competitorRows.length === 0) return []

  // Get our keywords for comparison (positions we rank in)
  const ourRows = await fetchSemrush(apiKey, {
    type: 'domain_organic',
    export_columns: 'Ph,Po',
    domain: ourDomain,
    database: 'us',
    display_limit: '500',
  })

  const ourPositions = new Map<string, number>()
  for (const r of ourRows) {
    const kw = col(r, 'Keyword', 'Ph')
    if (kw) ourPositions.set(kw.toLowerCase(), parseInt(col(r, 'Position', 'Po') || '100', 10) || 100)
  }

  const gaps: SemrushKeywordGap[] = []
  for (const r of competitorRows) {
    const keyword = col(r, 'Keyword', 'Ph')
    if (!keyword) continue
    const compPos = parseInt(col(r, 'Position', 'Po') || '0', 10) || 0
    const volume = parseInt(col(r, 'Search Volume', 'Nq') || '0', 10) || 0
    const ourPos = ourPositions.get(keyword.toLowerCase()) ?? null

    // Gap: competitor in 1-10, we're outside top 20 or not ranking
    if (compPos > 0 && compPos <= 10 && (ourPos === null || ourPos > 20)) {
      const opportunityScore = Math.min(100, Math.round(
        (volume / 1000) * 10 + (ourPos === null ? 40 : Math.max(0, 40 - ourPos))
      ))
      gaps.push({
        keyword,
        competitorDomain,
        competitorPosition: compPos,
        ourPosition: ourPos,
        searchVolume: volume,
        opportunityScore,
      })
    }
  }

  return gaps.sort((a, b) => b.searchVolume - a.searchVolume).slice(0, 50)
}

export async function getBacklinkOverview(apiKey: string, domain: string): Promise<SemrushBacklinks> {
  const rows = await fetchSemrushAnalytics(apiKey, {
    type: 'backlinks_overview',
    target: domain,
    target_type: 'root_domain',
    export_columns: 'total,domains_num,urls_num,ips_num',
  })
  const row = rows[0] ?? {}
  return {
    totalBacklinks: parseInt(col(row, 'Total', 'Backlinks', 'total') || '0', 10) || 0,
    referringDomains: parseInt(col(row, 'Domains', 'Referring Domains', 'domains_num') || '0', 10) || 0,
    referringUrls: parseInt(col(row, 'URLs', 'Referring URLs', 'urls_num') || '0', 10) || 0,
    referringIps: parseInt(col(row, 'IPs', 'Referring IPs', 'ips_num') || '0', 10) || 0,
  }
}

export async function getTrafficTrend(apiKey: string, domain: string): Promise<SemrushTrafficMonth[]> {
  const rows = await fetchSemrush(apiKey, {
    type: 'domain_ranks_history',
    export_columns: 'Dt,Or,Ot',
    domain,
    database: 'us',
    display_limit: '12',
  })
  return rows.map((r) => ({
    date: col(r, 'Date', 'Dt'),
    organicKeywords: parseInt(col(r, 'Organic Keywords', 'Or') || '0', 10) || 0,
    organicTraffic: parseInt(col(r, 'Organic Traffic', 'Ot') || '0', 10) || 0,
  })).filter((m) => m.date).reverse() // oldest → newest
}

export async function testConnection(
  apiKey: string,
  domain: string
): Promise<{ ok: boolean; message: string }> {
  try {
    const overview = await getDomainOverview(apiKey, domain)
    if (overview.organicKeywords >= 0) {
      return {
        ok: true,
        message: `Connected — ${domain} has ${overview.organicKeywords.toLocaleString()} organic keywords, ~${overview.organicTraffic.toLocaleString()} monthly traffic`,
      }
    }
    return { ok: false, message: 'No data returned for domain' }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}
