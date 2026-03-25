'use client'

import { useState, useMemo } from 'react'

type SortDirection = 'asc' | 'desc'

function getValue(row: Record<string, unknown>, col: string): unknown {
  return col.split('.').reduce((obj, key) => (obj as Record<string, unknown>)?.[key], row as unknown)
}

function compare(a: unknown, b: unknown, dir: SortDirection): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1

  let cmp = 0
  if (typeof a === 'number' && typeof b === 'number') {
    cmp = a - b
  } else if (typeof a === 'string' && typeof b === 'string') {
    // ISO date strings sort correctly as strings; otherwise alphabetical
    cmp = a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
  } else {
    cmp = String(a).localeCompare(String(b))
  }

  return dir === 'asc' ? cmp : -cmp
}

export interface SortState {
  column: string
  direction: SortDirection
}

export function useSortableTable<T extends Record<string, unknown>>(
  data: T[],
  defaultColumn: string,
  defaultDirection: SortDirection = 'desc',
) {
  const [sort, setSort] = useState<SortState>({ column: defaultColumn, direction: defaultDirection })

  function handleSort(column: string) {
    setSort((prev) =>
      prev.column === column
        ? { column, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { column, direction: defaultDirection },
    )
  }

  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => compare(getValue(a, sort.column), getValue(b, sort.column), sort.direction))
  }, [data, sort])

  return { sortedData, sortColumn: sort.column, sortDirection: sort.direction, handleSort }
}

/** Renders ↑ / ↓ / ↕ for a column header */
export function SortIcon({ column, sortColumn, sortDirection }: { column: string; sortColumn: string; sortDirection: SortDirection }) {
  if (sortColumn !== column) return <span className="ml-1 text-ink-3 opacity-0 group-hover:opacity-60 transition-opacity">↕</span>
  return <span className="ml-1 text-teal-deep">{sortDirection === 'asc' ? '↑' : '↓'}</span>
}

/** Returns className for active/inactive sort header */
export function thCls(column: string, sortColumn: string, extra = '') {
  return `group cursor-pointer select-none hover:bg-cream-2 transition-colors ${sortColumn === column ? 'bg-cream-2/80' : ''} ${extra}`
}
