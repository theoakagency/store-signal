'use client'

import { useState, useRef } from 'react'

type DatePreset = 'prev-month' | 'month-to-date' | 'custom'

interface SkuResult {
  sku: string
  quantity: number
}

interface ChunkProgress {
  chunk: number
  total: number
  error?: string
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

function displayDate(iso: string): string {
  const [y, m, day] = iso.split('-')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[Number(m) - 1]} ${Number(day)}, ${y}`
}

function parseSkuFilter(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
}

function getPrevMonthRange(): { start: string; end: string } {
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const last  = new Date(now.getFullYear(), now.getMonth(), 0)
  return { start: formatDate(first), end: formatDate(last) }
}

function getMonthToDateRange(): { start: string; end: string } {
  const now   = new Date()
  const first = new Date(now.getFullYear(), now.getMonth(), 1)
  return { start: formatDate(first), end: formatDate(now) }
}

function downloadCsv(results: SkuResult[], dateRange: { start: string; end: string }) {
  const rows = [
    ['SKU', 'Quantity Sold'],
    ...results.map((r) => [r.sku, String(r.quantity)]),
  ]
  const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `sku-report-${dateRange.end}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Table skeleton ─────────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-cream-3 bg-white shadow-sm">
      <div className="border-b border-cream-2 px-5 py-3.5">
        <div className="h-4 w-32 rounded bg-cream-3 animate-pulse" />
      </div>
      <div className="divide-y divide-cream-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-3 animate-pulse">
            <div className="h-4 w-28 rounded bg-cream-3" />
            <div className="h-4 w-12 rounded bg-cream-2 ml-auto" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function SkuReportPage() {
  const prev = getPrevMonthRange()
  const [preset,      setPreset]      = useState<DatePreset>('prev-month')
  const [customStart, setCustomStart] = useState(prev.start)
  const [customEnd,   setCustomEnd]   = useState(prev.end)
  const [skuFilterRaw, setSkuFilterRaw] = useState('')

  const [isLoading,      setIsLoading]      = useState(false)
  const [progress,       setProgress]       = useState<ChunkProgress | null>(null)
  const [results,        setResults]        = useState<SkuResult[] | null>(null)
  const [totalUnits,     setTotalUnits]     = useState(0)
  const [activeFilter,   setActiveFilter]   = useState<string[]>([]) // filter used for current results
  const [chunkErrors,    setChunkErrors]    = useState<string[]>([])
  const [seenStatuses,   setSeenStatuses]   = useState<string[]>([])
  const [dateRange,      setDateRange]      = useState<{ start: string; end: string } | null>(null)
  const [fetchError,     setFetchError]     = useState<string | null>(null)

  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null)

  function getRange(): { start: string; end: string } {
    if (preset === 'prev-month')    return getPrevMonthRange()
    if (preset === 'month-to-date') return getMonthToDateRange()
    return { start: customStart, end: customEnd }
  }

  async function handleGenerate() {
    setFetchError(null)
    setResults(null)
    setProgress(null)
    setChunkErrors([])
    setSeenStatuses([])
    setTotalUnits(0)

    const range     = getRange()
    const skuFilter = parseSkuFilter(skuFilterRaw)

    if (!range.start || !range.end || range.start > range.end) {
      setFetchError('Invalid date range.')
      return
    }

    setIsLoading(true)
    setDateRange(range)
    setActiveFilter(skuFilter)

    try {
      const res = await fetch('/api/skuvault/sales', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          startDate: range.start,
          endDate:   range.end,
          skuFilter: skuFilter.length > 0 ? skuFilter : undefined,
        }),
      })

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => `HTTP ${res.status}`)
        setFetchError(text || 'Unable to connect to SKU Vault — check credentials.')
        setIsLoading(false)
        return
      }

      const reader  = res.body.getReader()
      readerRef.current = reader
      const decoder = new TextDecoder()
      let buffer    = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))
            if (event.type === 'chunk') {
              setProgress({ chunk: event.chunk, total: event.total, error: event.error })
            } else if (event.type === 'done') {
              setResults(event.results ?? [])
              setTotalUnits(event.totalUnits ?? 0)
              setChunkErrors(event.chunkErrors ?? [])
              setSeenStatuses(event.allStatusesSeen ?? [])
              setDateRange(event.dateRange ?? range)
            }
          } catch { /* skip malformed line */ }
        }
      }
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Network error.')
    } finally {
      setIsLoading(false)
      setProgress(null)
      readerRef.current = null
    }
  }

  function handleClearFilter() {
    setSkuFilterRaw('')
    setResults(null)
    setActiveFilter([])
    setTotalUnits(0)
    setSeenStatuses([])
    setChunkErrors([])
  }

  const range = getRange()

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">

      {/* Header */}
      <div className="mb-8">
        <h1 className="font-display text-2xl font-semibold text-ink">SKU Sales Report</h1>
        <p className="mt-1 text-sm text-ink-3">Quantity sold by SKU from SKU Vault</p>
      </div>

      {/* Date range + filter card */}
      <div className="rounded-2xl border border-cream-3 bg-white p-6 shadow-sm mb-6 space-y-5">

        {/* Preset buttons */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-2 mb-2">Date Range</p>
          <div className="flex flex-wrap gap-2">
            {([
              ['prev-month',    'Previous Month'],
              ['month-to-date', 'Month to Date'],
              ['custom',        'Custom Range'],
            ] as [DatePreset, string][]).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setPreset(key)}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${
                  preset === key
                    ? 'border-teal bg-teal text-white'
                    : 'border-cream-3 bg-white text-ink-2 hover:border-teal/40'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom date pickers */}
        {preset === 'custom' && (
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-ink-2 mb-1.5">Start Date</label>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="w-full rounded-xl border border-cream-3 bg-white px-4 py-3 text-sm text-ink focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20 transition"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-semibold text-ink-2 mb-1.5">End Date</label>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="w-full rounded-xl border border-cream-3 bg-white px-4 py-3 text-sm text-ink focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20 transition"
              />
            </div>
          </div>
        )}

        {/* Selected range display */}
        <p className="text-sm text-ink-2">
          <span className="font-medium">Reporting period:</span>{' '}
          {displayDate(range.start)} – {displayDate(range.end)}
        </p>

        {/* SKU filter */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-ink-2 mb-1.5">
            SKU Filter <span className="font-normal normal-case text-ink-3">(optional)</span>
          </label>
          <input
            type="text"
            value={skuFilterRaw}
            onChange={(e) => setSkuFilterRaw(e.target.value)}
            placeholder="Filter by SKU — separate multiple with commas, e.g. LCAC0357FMCB, ADSHPURP5"
            className="w-full rounded-xl border border-cream-3 bg-white px-4 py-3 text-sm text-ink placeholder:text-ink-3 focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20 transition font-data"
          />
        </div>

        {/* Generate button */}
        <button
          type="button"
          onClick={handleGenerate}
          disabled={isLoading}
          className="w-full rounded-xl bg-teal py-3.5 text-base font-semibold text-white transition hover:bg-teal-dark disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.99]"
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              {progress
                ? `Fetching data... ${progress.chunk} of ${progress.total} chunks complete`
                : 'Connecting to SKU Vault...'}
            </span>
          ) : (
            'Generate Report'
          )}
        </button>

        {/* Progress bar */}
        {isLoading && progress && (
          <div className="space-y-1.5">
            <div className="h-2 w-full rounded-full bg-cream-3 overflow-hidden">
              <div
                className="h-full rounded-full bg-teal transition-all duration-300"
                style={{ width: `${(progress.chunk / progress.total) * 100}%` }}
              />
            </div>
            <p className="text-xs text-ink-3 text-center">
              {progress.chunk} of {progress.total} chunks complete
            </p>
          </div>
        )}
      </div>

      {/* Error */}
      {fetchError && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {fetchError}
        </div>
      )}

      {/* Chunk warnings */}
      {chunkErrors.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 space-y-1">
          <p className="font-semibold">Warning: some chunks failed — results may be incomplete</p>
          {chunkErrors.map((e, i) => (
            <p key={i} className="text-xs">{e}</p>
          ))}
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && !results && (
        <TableSkeleton />
      )}

      {/* No results */}
      {!isLoading && results !== null && results.length === 0 && (
        <div className="rounded-2xl border border-cream-3 bg-white p-10 text-center shadow-sm space-y-3">
          <p className="text-sm text-ink-3">No sales found for this date range.</p>
          {seenStatuses.length > 0 && (
            <p className="text-xs text-ink-3">
              Statuses seen in response: <span className="font-data">{seenStatuses.join(', ')}</span>
            </p>
          )}
        </div>
      )}

      {/* Results table */}
      {results !== null && results.length > 0 && (
        <div className="space-y-3">

          {/* Meta row: count + filter indicator + export */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              {activeFilter.length > 0 ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-ink">
                    Showing results for {activeFilter.length} SKU{activeFilter.length !== 1 ? 's' : ''}
                  </p>
                  <button
                    type="button"
                    onClick={handleClearFilter}
                    className="text-xs font-medium text-teal-deep hover:text-teal transition"
                  >
                    Clear filter
                  </button>
                </div>
              ) : (
                <p className="text-sm font-medium text-ink">
                  {results.length.toLocaleString()} unique SKUs
                </p>
              )}
              {dateRange && (
                <p className="text-xs text-ink-3">
                  {displayDate(dateRange.start)} – {displayDate(dateRange.end)}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => dateRange && downloadCsv(results, dateRange)}
              className="flex items-center gap-2 rounded-xl border border-cream-3 bg-white px-4 py-2 text-sm font-medium text-ink-2 transition hover:border-teal/40 hover:text-teal"
            >
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M8 3v7M5 7l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M2 12v1a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-1" strokeLinecap="round" />
              </svg>
              Export CSV
            </button>
          </div>

          <div className="overflow-hidden rounded-2xl border border-cream-3 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-cream-2 bg-cream">
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-3">SKU</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-ink-3">Qty Sold</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cream-2">
                  {results.map((row, i) => (
                    <tr key={row.sku} className={i % 2 === 0 ? 'bg-white' : 'bg-cream/40'}>
                      <td className="px-5 py-3 font-data text-xs text-ink">{row.sku}</td>
                      <td className="px-5 py-3 text-right font-data text-xs text-ink">{row.quantity.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-cream-3 bg-cream">
                    <td className="px-5 py-3 text-xs font-semibold text-ink">Total units sold</td>
                    <td className="px-5 py-3 text-right font-data text-sm font-semibold text-ink">{totalUnits.toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {seenStatuses.length > 0 && (
            <p className="text-xs text-ink-3 text-center">
              Statuses in response: <span className="font-data">{seenStatuses.join(', ')}</span>
            </p>
          )}
        </div>
      )}
    </div>
  )
}
