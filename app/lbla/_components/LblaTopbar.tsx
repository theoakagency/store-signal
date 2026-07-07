'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'

const PAGE_TITLES: Record<string, string> = {
  '/lbla':                              'Team Tools',
  '/lbla/ideas':                        'Campaign Ideas',
  '/lbla/content':                      'Content Generator',
  '/lbla/sku-report':                   'SKU Sales Report',
  '/lbla/reports/kll-royalty':          'KLL Royalty Report',
  '/lbla/settings/discount-codes':      'Discount Codes',
}

export default function LblaTopbar() {
  const pathname = usePathname()
  const title = PAGE_TITLES[pathname] ?? ''

  return (
    <header className="flex h-[58px] shrink-0 items-center border-b border-cream-3 bg-white px-4 sm:px-6 relative">
      {/* Left: brand + back link */}
      <div className="flex items-center gap-3 min-w-0">
        <Link
          href="/lbla"
          className="font-display text-xl font-semibold tracking-tight text-teal-deep hover:text-teal transition whitespace-nowrap"
        >
          LBLA
        </Link>
        {pathname !== '/lbla' && (
          <Link
            href="/lbla"
            className="hidden sm:inline-flex items-center gap-1 text-xs text-ink-3 hover:text-ink-2 transition whitespace-nowrap"
          >
            <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M7.5 2L3 6l4.5 4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back
          </Link>
        )}
      </div>

      {/* Center: page title */}
      {title && title !== 'Team Tools' && (
        <span className="absolute left-1/2 -translate-x-1/2 text-sm font-semibold text-ink hidden sm:block">
          {title}
        </span>
      )}
    </header>
  )
}
