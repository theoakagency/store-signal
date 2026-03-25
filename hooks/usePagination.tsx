'use client'

import { useState } from 'react'

export function usePagination<T>(data: T[], pageSize = 20) {
  const [page, setPage] = useState(0)
  const totalPages = Math.ceil(data.length / pageSize)
  const paged = data.slice(page * pageSize, (page + 1) * pageSize)

  function reset() { setPage(0) }

  return { paged, page, setPage, totalPages, reset }
}

export function Paginator({
  page,
  totalPages,
  setPage,
}: {
  page: number
  totalPages: number
  setPage: (p: number) => void
}) {
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-between border-t border-cream-2 px-5 py-3">
      <span className="text-xs text-ink-3">
        Page {page + 1} of {totalPages}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => setPage(0)}
          disabled={page === 0}
          className="rounded px-2 py-1 text-xs text-ink-3 hover:bg-cream disabled:opacity-30 transition"
          aria-label="First page"
        >
          «
        </button>
        <button
          onClick={() => setPage(page - 1)}
          disabled={page === 0}
          className="rounded px-2 py-1 text-xs text-ink-3 hover:bg-cream disabled:opacity-30 transition"
          aria-label="Previous page"
        >
          ‹
        </button>
        <button
          onClick={() => setPage(page + 1)}
          disabled={page >= totalPages - 1}
          className="rounded px-2 py-1 text-xs text-ink-3 hover:bg-cream disabled:opacity-30 transition"
          aria-label="Next page"
        >
          ›
        </button>
        <button
          onClick={() => setPage(totalPages - 1)}
          disabled={page >= totalPages - 1}
          className="rounded px-2 py-1 text-xs text-ink-3 hover:bg-cream disabled:opacity-30 transition"
          aria-label="Last page"
        >
          »
        </button>
      </div>
    </div>
  )
}

export function exportCSV(filename: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return
  const headers = Object.keys(rows[0])
  const csv = [
    headers.join(','),
    ...rows.map((row) =>
      headers.map((h) => {
        const val = row[h]
        const s = val == null ? '' : String(val)
        return s.includes(',') || s.includes('"') || s.includes('\n')
          ? `"${s.replace(/"/g, '""')}"`
          : s
      }).join(',')
    ),
  ].join('\n')

  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
