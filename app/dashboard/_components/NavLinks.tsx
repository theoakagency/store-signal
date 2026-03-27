'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function NavLinks({
  onNavigate,
  klaviyoConnected,
  gscConnected,
  ga4Connected,
  metaConnected,
  googleAdsConnected,
  rechargeConnected,
  loyaltylionConnected,
  semrushConnected,
}: {
  onNavigate?: () => void
  klaviyoConnected?: boolean
  gscConnected?: boolean
  ga4Connected?: boolean
  metaConnected?: boolean
  googleAdsConnected?: boolean
  rechargeConnected?: boolean
  loyaltylionConnected?: boolean
  semrushConnected?: boolean
}) {
  const pathname = usePathname()
  const isActive = (href: string, exact = false) =>
    exact ? pathname === href : pathname.startsWith(href)

  return (
    <nav className="flex flex-col gap-0.5 px-3">

      {/* ── STORES ─────────────────────────────────────────────────────────── */}
      <SectionLabel>Stores</SectionLabel>

      <Link
        href="/dashboard/shopify"
        onClick={onNavigate}
        className={`nav-link ${isActive('/dashboard/shopify') ? 'active' : ''}`}
      >
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M10.5 1.5c-.1 0-.2.1-.3.2L9 5H5L3.5 2H2L1 13h14L13 2h-1.5L10.5 1.5z" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M5 5l.5 3h5l.5-3" strokeLinecap="round"/>
        </svg>
        Shopify
        <span className="ml-auto h-1.5 w-1.5 rounded-full bg-teal" />
      </Link>

      <div className="nav-link opacity-40 cursor-not-allowed select-none">
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="1" y="4" width="14" height="9" rx="1.5"/>
          <path d="M4 4V3a2 2 0 0 1 4 0v1M8 4v9" strokeLinecap="round"/>
        </svg>
        Wholesale
        <span className="ml-auto text-[9px] font-data uppercase tracking-wider text-cream/30">Soon</span>
      </div>

      {/* ── OVERVIEW ───────────────────────────────────────────────────────── */}
      <SectionLabel>Overview</SectionLabel>

      <Link
        href="/dashboard"
        onClick={onNavigate}
        className={`nav-link ${isActive('/dashboard', true) ? 'active' : ''}`}
      >
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="1" y="1" width="6" height="6" rx="1.5" />
          <rect x="9" y="1" width="6" height="6" rx="1.5" />
          <rect x="1" y="9" width="6" height="6" rx="1.5" />
          <rect x="9" y="9" width="6" height="6" rx="1.5" />
        </svg>
        Executive Summary
      </Link>

      <Link
        href="/dashboard/customers"
        onClick={onNavigate}
        className={`nav-link ${isActive('/dashboard/customers') ? 'active' : ''}`}
      >
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="6" cy="5" r="3" />
          <path d="M1 13c0-2.8 2.2-5 5-5" strokeLinecap="round" />
          <circle cx="12" cy="7" r="2.5" />
          <path d="M9.5 13c0-1.9 1.1-3.5 2.5-3.5S14.5 11.1 14.5 13" strokeLinecap="round" />
        </svg>
        Customers
      </Link>

      <Link
        href="/dashboard/products"
        onClick={onNavigate}
        className={`nav-link ${isActive('/dashboard/products') ? 'active' : ''}`}
      >
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="1" y="1" width="6" height="6" rx="1" />
          <rect x="9" y="1" width="6" height="6" rx="1" />
          <rect x="1" y="9" width="6" height="6" rx="1" />
          <path d="M9 12h6M12 9v6" strokeLinecap="round" />
        </svg>
        Products
      </Link>

      {/* ── INTELLIGENCE ───────────────────────────────────────────────────── */}
      <SectionLabel>Intelligence</SectionLabel>

      <Link
        href="/dashboard/chat"
        onClick={onNavigate}
        className={`nav-link ${isActive('/dashboard/chat') ? 'active' : ''}`}
      >
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M14 10c0 1.1-.9 2-2 2H4l-3 3V4c0-1.1.9-2 2-2h9c1.1 0 2 .9 2 2v6z" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M5 7h.01M8 7h.01M11 7h.01" strokeLinecap="round" />
        </svg>
        AI Chat
      </Link>

      <Link
        href="/dashboard/promotions"
        onClick={onNavigate}
        className={`nav-link ${isActive('/dashboard/promotions') ? 'active' : ''}`}
      >
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M8 1l1.6 3.3 3.6.5-2.6 2.5.6 3.6L8 9.3l-3.2 1.6.6-3.6L2.8 4.8l3.6-.5L8 1z" strokeLinejoin="round"/>
        </svg>
        Promotions
      </Link>

      {/* ── CHANNELS ───────────────────────────────────────────────────────── */}
      <SectionLabel>Channels</SectionLabel>

      <Link
        href="/dashboard/klaviyo"
        onClick={onNavigate}
        className={`nav-link ${isActive('/dashboard/klaviyo') ? 'active' : ''}`}
      >
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="1" y="3" width="14" height="10" rx="2" />
          <path d="M1 6h14" strokeLinecap="round" />
          <path d="M5 9.5h2M9 9.5h2" strokeLinecap="round" />
        </svg>
        Email / Klaviyo
        <span className={`ml-auto h-1.5 w-1.5 rounded-full ${klaviyoConnected ? 'bg-teal' : 'bg-cream/20'}`} />
      </Link>

      <Link
        href="/dashboard/search"
        onClick={onNavigate}
        className={`nav-link ${isActive('/dashboard/search') ? 'active' : ''}`}
      >
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="6.5" cy="6.5" r="4" />
          <path d="M10 10l3.5 3.5" strokeLinecap="round" />
        </svg>
        Search / GSC
        <span className={`ml-auto h-1.5 w-1.5 rounded-full ${gscConnected ? 'bg-teal' : 'bg-cream/20'}`} />
      </Link>

      <Link
        href="/dashboard/meta"
        onClick={onNavigate}
        className={`nav-link ${isActive('/dashboard/meta') ? 'active' : ''}`}
      >
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="2" y="3" width="5" height="10" rx="1.5" />
          <path d="M7 8h5M9 5l3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Meta Ads
        <span className={`ml-auto h-1.5 w-1.5 rounded-full ${metaConnected ? 'bg-teal' : 'bg-cream/20'}`} />
      </Link>

      <Link
        href="/dashboard/google-ads"
        onClick={onNavigate}
        className={`nav-link ${isActive('/dashboard/google-ads') ? 'active' : ''}`}
      >
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="8" cy="8" r="6" />
          <path d="M8 5v3l2 2" strokeLinecap="round" />
        </svg>
        Google Ads
        <span className={`ml-auto h-1.5 w-1.5 rounded-full ${googleAdsConnected ? 'bg-teal' : 'bg-cream/20'}`} />
      </Link>

      {/* ── ANALYTICS ──────────────────────────────────────────────────────── */}
      <SectionLabel>Analytics</SectionLabel>

      <Link
        href="/dashboard/analytics-overview"
        onClick={onNavigate}
        className={`nav-link ${isActive('/dashboard/analytics-overview') ? 'active' : ''}`}
      >
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="1" y="9" width="4" height="5" rx="0.5"/>
          <rect x="6" y="5" width="4" height="9" rx="0.5"/>
          <rect x="11" y="1" width="4" height="13" rx="0.5"/>
        </svg>
        Overview
      </Link>

      <Link
        href="/dashboard/semrush"
        onClick={onNavigate}
        className={`nav-link ${isActive('/dashboard/semrush') ? 'active' : ''}`}
      >
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="6.5" cy="6.5" r="4" />
          <path d="M10 10l3.5 3.5" strokeLinecap="round" />
          <path d="M4.5 6.5h4M6.5 4.5v4" strokeLinecap="round" />
        </svg>
        SEO Intelligence
        <span className={`ml-auto h-1.5 w-1.5 rounded-full ${semrushConnected ? 'bg-teal' : 'bg-cream/20'}`} />
      </Link>

      <Link
        href="/dashboard/analytics"
        onClick={onNavigate}
        className={`nav-link ${isActive('/dashboard/analytics') ? 'active' : ''}`}
      >
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M1 13V7l3.5-4 3 3 3-5 3 4v5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M1 13h14" strokeLinecap="round" />
        </svg>
        Analytics / GA4
        <span className={`ml-auto h-1.5 w-1.5 rounded-full ${ga4Connected ? 'bg-teal' : 'bg-cream/20'}`} />
      </Link>

      {/* ── REVENUE STREAMS ────────────────────────────────────────────────── */}
      <SectionLabel>Revenue Streams</SectionLabel>

      <Link
        href="/dashboard/subscriptions"
        onClick={onNavigate}
        className={`nav-link ${isActive('/dashboard/subscriptions') ? 'active' : ''}`}
      >
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M4 8a4 4 0 1 1 8 0 4 4 0 0 1-8 0zM8 5v3l2 1" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M2 13.5C3.3 12 5.5 11 8 11s4.7 1 6 2.5" strokeLinecap="round"/>
        </svg>
        Subscriptions
        <span className={`ml-auto h-1.5 w-1.5 rounded-full ${rechargeConnected ? 'bg-teal' : 'bg-cream/20'}`} />
      </Link>

      <Link
        href="/dashboard/loyalty"
        onClick={onNavigate}
        className={`nav-link ${isActive('/dashboard/loyalty') ? 'active' : ''}`}
      >
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M8 2l1.6 3.3 3.6.5-2.6 2.5.6 3.6L8 10.3l-3.2 1.6.6-3.6L2.8 5.8l3.6-.5L8 2z" strokeLinejoin="round"/>
        </svg>
        Loyalty Program
        <span className={`ml-auto h-1.5 w-1.5 rounded-full ${loyaltylionConnected ? 'bg-teal' : 'bg-cream/20'}`} />
      </Link>

      {/* ── SETTINGS ───────────────────────────────────────────────────────── */}
      <SectionLabel>Settings</SectionLabel>

      <Link
        href="/dashboard/integrations"
        onClick={onNavigate}
        className={`nav-link ${isActive('/dashboard/integrations') ? 'active' : ''}`}
      >
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="4" cy="8" r="2.5" />
          <circle cx="12" cy="4" r="2.5" />
          <circle cx="12" cy="12" r="2.5" />
          <path d="M6.5 8h1.5M9.5 4.8 6.5 7.2M9.5 11.2 6.5 8.8" strokeLinecap="round" />
        </svg>
        Integrations
      </Link>

      <Link
        href="/dashboard/data-audit"
        onClick={onNavigate}
        className={`nav-link ${isActive('/dashboard/data-audit') ? 'active' : ''}`}
      >
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M13 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1z" />
          <path d="M5 8l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Data Audit
      </Link>

    </nav>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-5 mb-1 px-3 first:mt-2">
      <p className="text-[10px] font-data uppercase tracking-widest text-cream/25">{children}</p>
    </div>
  )
}
