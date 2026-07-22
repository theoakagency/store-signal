'use client'

import { useState, type ReactNode } from 'react'

/**
 * Card with a clickable header that shows/hides its body.
 *
 * Extracted from the "How this number is calculated" panel that the KLL reports
 * each had their own copy of, so a section added later behaves and looks the same
 * rather than being a third hand-rolled variant.
 *
 * Children render their own padding: some bodies are prose (px-5 py-4) and some
 * are full-bleed tables that must reach the card edges.
 */
export default function CollapsibleCard({
  title,
  children,
  defaultOpen = false,
  titleClassName = 'text-xs font-semibold text-ink-2',
  className = '',
}: {
  title: string
  children: ReactNode
  defaultOpen?: boolean
  titleClassName?: string
  className?: string
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className={`rounded-2xl border border-cream-3 bg-white shadow-sm overflow-hidden ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left hover:bg-cream/50 transition"
      >
        <span className={titleClassName}>{title}</span>
        <svg
          className={`h-3.5 w-3.5 shrink-0 text-ink-3 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}
        >
          <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && <div className="border-t border-cream-2">{children}</div>}
    </div>
  )
}
