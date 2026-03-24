'use client'

import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import SyncButton from '../SyncButton'

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Executive Summary',
  '/dashboard/customers': 'Customer Intelligence',
  '/dashboard/promotions': 'Promotion Scorer',
  '/dashboard/klaviyo': 'Email Intelligence',
  '/dashboard/search': 'Search Intelligence',
  '/dashboard/integrations': 'Integrations',
  '/dashboard/analytics': 'Analytics',
  '/dashboard/advertising': 'Advertising Overview',
  '/dashboard/meta': 'Meta Ads',
  '/dashboard/google-ads': 'Google Ads',
}

interface TopbarProps {
  userEmail: string
  lastSyncedAt: string | null
  onMenuClick: () => void
}

export default function Topbar({ userEmail, lastSyncedAt, onMenuClick }: TopbarProps) {
  const pathname = usePathname()
  const title = PAGE_TITLES[pathname] ?? 'Dashboard'

  const [syncedLabel, setSyncedLabel] = useState('')

  useEffect(() => {
    function updateLabel() {
      if (!lastSyncedAt) {
        setSyncedLabel('Never synced')
        return
      }
      const diff = Math.floor((Date.now() - new Date(lastSyncedAt).getTime()) / 1000)
      if (diff < 60) setSyncedLabel('Synced just now')
      else if (diff < 3600) setSyncedLabel(`Synced ${Math.floor(diff / 60)}m ago`)
      else if (diff < 86400) setSyncedLabel(`Synced ${Math.floor(diff / 3600)}h ago`)
      else setSyncedLabel(`Synced ${Math.floor(diff / 86400)}d ago`)
    }

    updateLabel()
    const id = setInterval(updateLabel, 60_000)
    return () => clearInterval(id)
  }, [lastSyncedAt])

  return (
    <header className="flex h-[58px] shrink-0 items-center justify-between border-b border-cream-3 bg-cream px-4 sm:px-6">
      {/* Left: mobile menu + page title */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          className="lg:hidden rounded-md p-1.5 text-ink-2 hover:bg-cream-2 transition"
          aria-label="Open menu"
        >
          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3 5h14a1 1 0 0 1 0 2H3a1 1 0 0 1 0-2zm0 4h14a1 1 0 0 1 0 2H3a1 1 0 0 1 0-2zm0 4h14a1 1 0 0 1 0 2H3a1 1 0 0 1 0-2z" clipRule="evenodd" />
          </svg>
        </button>
        <h1 className="font-display text-lg font-semibold text-ink">{title}</h1>
      </div>

      {/* Right: sync status + actions */}
      <div className="flex items-center gap-3">
        {syncedLabel && (
          <span className="hidden sm:block text-xs font-data text-ink-3">{syncedLabel}</span>
        )}
        <SyncButton />
        <span className="hidden sm:block text-xs text-ink-3">{userEmail}</span>
        <form action="/api/auth/signout" method="POST">
          <button
            type="submit"
            className="text-xs font-medium text-ink-3 hover:text-ink transition"
          >
            Sign out
          </button>
        </form>
      </div>
    </header>
  )
}
