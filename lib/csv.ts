/**
 * Minimal RFC-4180 CSV reader.
 *
 * Written rather than pulled in as a dependency because the need is narrow, but
 * it does have to handle the awkward parts of a real Shopify order export:
 *   * quoted fields containing commas — product titles routinely have them
 *   * quoted fields containing NEWLINES — the Note Attributes column on
 *     wholesale orders holds a pretty-printed JSON blob, so a naive
 *     split('\n') would shred those rows
 *   * doubled quotes ("") as an escaped quote inside a quoted field
 *   * CRLF line endings, and a UTF-8 BOM on exports opened in Excel first
 */

/** Split raw CSV text into rows of raw string cells. */
export function parseCsv(text: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1) // strip BOM

  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++ } // escaped quote
        else inQuotes = false
      } else {
        cell += ch
      }
      continue
    }

    if (ch === '"') { inQuotes = true; continue }
    if (ch === ',') { row.push(cell); cell = ''; continue }
    if (ch === '\r') continue
    if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue }
    cell += ch
  }

  // Trailing row when the file does not end in a newline.
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row) }

  return rows
}

/**
 * Parse into objects keyed by header name.
 *
 * Rows shorter than the header are padded rather than skipped: Shopify omits
 * trailing empty cells on some continuation lines, and those rows still carry
 * line-item data that must not be dropped.
 */
export function parseCsvToObjects(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const raw = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ''))
  if (raw.length === 0) return { headers: [], rows: [] }

  const headers = raw[0].map((h) => h.trim())
  const rows = raw.slice(1).map((cells) => {
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => { obj[h] = (cells[i] ?? '').trim() })
    return obj
  })

  return { headers, rows }
}
