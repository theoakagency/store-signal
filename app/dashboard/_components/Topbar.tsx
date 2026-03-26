'use client'

import { usePathname } from 'next/navigation'
import { useState, useEffect, useRef, useCallback } from 'react'
import SyncButton from '../SyncButton'

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Executive Summary',
  '/dashboard/shopify': 'Shopify',
  '/dashboard/customers': 'Customer Intelligence',
  '/dashboard/products': 'Product Intelligence',
  '/dashboard/promotions': 'Promotion Scorer',
  '/dashboard/chat': 'AI Chat',
  '/dashboard/klaviyo': 'Email Intelligence',
  '/dashboard/search': 'Search Intelligence',
  '/dashboard/integrations': 'Integrations',
  '/dashboard/analytics': 'Analytics / GA4',
  '/dashboard/analytics-overview': 'Analytics Overview',
  '/dashboard/advertising': 'Advertising Overview',
  '/dashboard/meta': 'Meta Ads',
  '/dashboard/google-ads': 'Google Ads',
  '/dashboard/subscriptions': 'Subscription Program',
  '/dashboard/loyalty': 'Loyalty Program',
  '/dashboard/semrush': 'SEO Intelligence',
}

interface CronStatus {
  label: string
  lastRunAt: string | null
  lastStatus: string | null
  recordsSynced: number
  nextRunAt: string | null
  errors: string[]
}

interface SyncStatusData {
  syncEnabled: boolean
  lastSyncedAt: string | null
  integrations: Record<string, boolean>
  crons: Record<string, CronStatus>
}

interface TopbarProps {
  userEmail: string
  lastSyncedAt: string | null
  onMenuClick: () => void
}

function relativeTime(iso: string | null): string {
  if (!iso) return 'Never'
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return 'Just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function statusDot(cron: CronStatus, integrationConnected: boolean): 'green' | 'amber' | 'grey' {
  if (!integrationConnected) return 'grey'
  if (!cron.lastRunAt) return 'amber'
  if (cron.lastStatus === 'failed') return 'amber'
  const hoursSince = (Date.now() - new Date(cron.lastRunAt).getTime()) / 36e5
  // Overdue threshold: 3x the nominal interval (nextRunAt - lastRunAt)
  if (cron.nextRunAt && cron.lastRunAt) {
    const intervalHours = (new Date(cron.nextRunAt).getTime() - new Date(cron.lastRunAt).getTime()) / 36e5
    if (hoursSince > intervalHours * 1.5) return 'amber'
  }
  return 'green'
}

const DOT_CLS = { green: 'bg-teal', amber: 'bg-amber-400', grey: 'bg-ink-3/40' }

// Map cron names to integration keys
const CRON_INTEGRATION: Record<string, string> = {
  'sync-shopify': 'shopify',
  'sync-klaviyo': 'klaviyo',
  'sync-ads': 'meta',
  'sync-analytics': 'ga4',
  'sync-search': 'semrush',
  'daily-rebuild': 'shopify',
}

const CRON_SYNC_ROUTE: Record<string, string> = {
  'sync-shopify':   '/api/shopify/sync',
  'sync-klaviyo':   '/api/klaviyo/sync',
  'sync-ads':       '/api/meta/sync',
  'sync-analytics': '/api/analytics/sync',
  'sync-search':    '/api/semrush/sync',
}

export default function Topbar({ userEmail, lastSyncedAt, onMenuClick }: TopbarProps) {
  const pathname = usePathname()
  const title = PAGE_TITLES[pathname] ?? 'Dashboard'

  const [syncedLabel, setSyncedLabel] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [syncStatus, setSyncStatus] = useState<SyncStatusData | null>(null)
  const [syncing, setSyncing] = useState<Record<string, boolean>>({})
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function updateLabel() {
      if (!lastSyncedAt) { setSyncedLabel('Never synced'); return }
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

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/sync/status')
      if (res.ok) setSyncStatus(await res.json() as SyncStatusData)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    if (dropdownOpen && !syncStatus) fetchStatus()
  }, [dropdownOpen, syncStatus, fetchStatus])

  // Close on outside click
  useEffect(() => {
    if (!dropdownOpen) return
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [dropdownOpen])

  async function triggerSync(cronName: string) {
    const route = CRON_SYNC_ROUTE[cronName]
    if (!route) return
    setSyncing((s) => ({ ...s, [cronName]: true }))
    try {
      await fetch(route, { method: 'POST' })
      await fetchStatus()
    } finally {
      setSyncing((s) => ({ ...s, [cronName]: false }))
    }
  }

  const overallDot: 'green' | 'amber' | 'grey' = syncStatus
    ? Object.entries(syncStatus.crons).some(([name, c]) =>
        statusDot(c, syncStatus.integrations[CRON_INTEGRATION[name]] ?? false) === 'amber'
      ) ? 'amber' : 'green'
    : 'grey'

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

        {/* Sync status dropdown trigger */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setDropdownOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-ink-2 hover:bg-cream-2 transition border border-cream-3"
            title="Sync status"
          >
            <span className={`h-2 w-2 rounded-full ${DOT_CLS[overallDot]}`} />
            <span className="hidden sm:inline">Sync status</span>
            <svg className="h-3.5 w-3.5 text-ink-3" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06z" clipRule="evenodd" />
            </svg>
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 w-[340px] rounded-2xl border border-cream-3 bg-white shadow-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-cream-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-ink">Automated Sync Status</span>
                {syncStatus && !syncStatus.syncEnabled && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">PAUSED</span>
                )}
              </div>

              {!syncStatus ? (
                <div className="flex items-center justify-center py-8 text-xs text-ink-3">Loading…</div>
              ) : (
                <div className="divide-y divide-cream-2">
                  {Object.entries(syncStatus.crons).map(([name, cron]) => {
                    const integKey = CRON_INTEGRATION[name]
                    const connected = syncStatus.integrations[integKey] ?? false
                    const dot = statusDot(cron, connected)
                    const canSync = !!CRON_SYNC_ROUTE[name] && connected

                    return (
                      <div key={name} className="flex items-start gap-2.5 px-4 py-2.5">
                        <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${DOT_CLS[dot]}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-ink truncate">{cron.label}</span>
                            {canSync && (
                              <button
                                onClick={() => triggerSync(name)}
                                disabled={syncing[name]}
                                className="shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium text-teal-deep border border-teal-pale hover:bg-teal-pale disabled:opacity-50 transition"
                              >
                                {syncing[name] ? 'Syncing…' : 'Sync now'}
                              </button>
                            )}
                            {!connected && (
                              <span className="shrink-0 text-[10px] text-ink-3">Not connected</span>
                            )}
                          </div>
                          <div className="mt-0.5 text-[10px] text-ink-3 flex gap-3">
                            <span>Last: {relativeTime(cron.lastRunAt)}</span>
                            {cron.nextRunAt && (
                              <span>Next: {relativeTime(cron.nextRunAt).replace(' ago', '')} {new Date(cron.nextRunAt) > new Date() ? '' : '(overdue)'}</span>
                            )}
                          </div>
                          {cron.errors.length > 0 && (
                            <p className="mt-0.5 text-[10px] text-red-600 truncate">{cron.errors[0]}</p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              <div className="px-4 py-2.5 border-t border-cream-2 flex items-center justify-between">
                <span className="text-[10px] text-ink-3">Crons run automatically on Vercel</span>
                <button
                  onClick={fetchStatus}
                  className="text-[10px] font-medium text-teal-deep hover:underline"
                >
                  Refresh
                </button>
              </div>
            </div>
          )}
        </div>

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
