'use client'

import { useState } from 'react'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import ChatBubble from './ChatBubble'

interface DashboardShellProps {
  children: React.ReactNode
  userEmail: string
  lastSyncedAt: string | null
  klaviyoConnected: boolean
  gscConnected: boolean
  ga4Connected: boolean
  metaConnected: boolean
  googleAdsConnected: boolean
  rechargeConnected: boolean
  loyaltylionConnected: boolean
  semrushConnected: boolean
}

export default function DashboardShell({
  children,
  userEmail,
  lastSyncedAt,
  klaviyoConnected,
  gscConnected,
  ga4Connected,
  metaConnected,
  googleAdsConnected,
  rechargeConnected,
  loyaltylionConnected,
  semrushConnected,
}: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const navProps = { klaviyoConnected, gscConnected, ga4Connected, metaConnected, googleAdsConnected, rechargeConnected, loyaltylionConnected, semrushConnected }

  return (
    <div className="flex h-full">
      {/* ── Desktop sidebar ────────────────────────────────────── */}
      <aside className="hidden lg:flex lg:w-[230px] lg:shrink-0 bg-charcoal flex-col">
        <Sidebar {...navProps} />
      </aside>

      {/* ── Mobile sidebar overlay ─────────────────────────────── */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-charcoal/60 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          {/* Drawer */}
          <aside className="absolute inset-y-0 left-0 z-50 w-[230px] bg-charcoal animate-slide-in-right">
            <Sidebar onNavigate={() => setSidebarOpen(false)} {...navProps} />
          </aside>
        </div>
      )}

      {/* ── Main area ──────────────────────────────────────────── */}
      <div className="flex flex-1 min-w-0 flex-col">
        <Topbar
          userEmail={userEmail}
          lastSyncedAt={lastSyncedAt}
          onMenuClick={() => setSidebarOpen(true)}
        />
        <main className="flex-1 overflow-y-auto bg-cream">
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>
      <ChatBubble />
    </div>
  )
}
