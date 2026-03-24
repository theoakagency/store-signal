'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const mainLinks = [
  {
    href: '/dashboard/chat',
    label: 'AI Chat',
    exact: false,
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M14 10c0 1.1-.9 2-2 2H4l-3 3V4c0-1.1.9-2 2-2h9c1.1 0 2 .9 2 2v6z" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5 7h.01M8 7h.01M11 7h.01" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: '/dashboard',
    label: 'Executive Summary',
    exact: true,
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="1" y="1" width="6" height="6" rx="1.5" />
        <rect x="9" y="1" width="6" height="6" rx="1.5" />
        <rect x="1" y="9" width="6" height="6" rx="1.5" />
        <rect x="9" y="9" width="6" height="6" rx="1.5" />
      </svg>
    ),
  },
  {
    href: '/dashboard/customers',
    label: 'Customers',
    exact: false,
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="6" cy="5" r="3" />
        <path d="M1 13c0-2.8 2.2-5 5-5" strokeLinecap="round" />
        <circle cx="12" cy="7" r="2.5" />
        <path d="M9.5 13c0-1.9 1.1-3.5 2.5-3.5S14.5 11.1 14.5 13" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: '/dashboard/promotions',
    label: 'Promotions',
    exact: false,
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M2 8h12M8 2l4 6-4 6M4 4l-2 4 2 4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: '/dashboard/integrations',
    label: 'Integrations',
    exact: false,
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="4" cy="8" r="2.5" />
        <circle cx="12" cy="4" r="2.5" />
        <circle cx="12" cy="12" r="2.5" />
        <path d="M6.5 8h1.5M9.5 4.8 6.5 7.2M9.5 11.2 6.5 8.8" strokeLinecap="round" />
      </svg>
    ),
  },
]

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

  return (
    <nav className="flex flex-col gap-0.5 px-3">
      {mainLinks.map((link) => {
        const isActive = link.exact ? pathname === link.href : pathname.startsWith(link.href)
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            className={`nav-link ${isActive ? 'active' : ''}`}
          >
            {link.icon}
            {link.label}
          </Link>
        )
      })}

      {/* Channels section */}
      <div className="mt-4 mb-1 px-3">
        <p className="text-[10px] font-data uppercase tracking-widest text-cream/25">Channels</p>
      </div>

      <Link
        href="/dashboard/klaviyo"
        onClick={onNavigate}
        className={`nav-link ${pathname.startsWith('/dashboard/klaviyo') ? 'active' : ''}`}
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
        className={`nav-link ${pathname.startsWith('/dashboard/search') ? 'active' : ''}`}
      >
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="6.5" cy="6.5" r="4" />
          <path d="M10 10l3.5 3.5" strokeLinecap="round" />
        </svg>
        Search / GSC
        <span className={`ml-auto h-1.5 w-1.5 rounded-full ${gscConnected ? 'bg-teal' : 'bg-cream/20'}`} />
      </Link>

      {/* Analytics section */}
      <div className="mt-4 mb-1 px-3">
        <p className="text-[10px] font-data uppercase tracking-widest text-cream/25">Analytics</p>
      </div>

      <Link
        href="/dashboard/semrush"
        onClick={onNavigate}
        className={`nav-link ${pathname.startsWith('/dashboard/semrush') ? 'active' : ''}`}
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
        className={`nav-link ${pathname.startsWith('/dashboard/analytics') ? 'active' : ''}`}
      >
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M1 13V7l3.5-4 3 3 3-5 3 4v5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M1 13h14" strokeLinecap="round" />
        </svg>
        Analytics / GA4
        <span className={`ml-auto h-1.5 w-1.5 rounded-full ${ga4Connected ? 'bg-teal' : 'bg-cream/20'}`} />
      </Link>

      {/* Advertising section */}
      <div className="mt-4 mb-1 px-3">
        <p className="text-[10px] font-data uppercase tracking-widest text-cream/25">Advertising</p>
      </div>

      <Link
        href="/dashboard/advertising"
        onClick={onNavigate}
        className={`nav-link ${pathname === '/dashboard/advertising' ? 'active' : ''}`}
      >
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M1 12L5 7l3 3 3-5 3 3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Overview
      </Link>

      <Link
        href="/dashboard/meta"
        onClick={onNavigate}
        className={`nav-link ${pathname.startsWith('/dashboard/meta') ? 'active' : ''}`}
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
        className={`nav-link ${pathname.startsWith('/dashboard/google-ads') ? 'active' : ''}`}
      >
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="8" cy="8" r="6" />
          <path d="M8 5v3l2 2" strokeLinecap="round" />
        </svg>
        Google Ads
        <span className={`ml-auto h-1.5 w-1.5 rounded-full ${googleAdsConnected ? 'bg-teal' : 'bg-cream/20'}`} />
      </Link>

      {/* Revenue Streams section */}
      <div className="mt-4 mb-1 px-3">
        <p className="text-[10px] font-data uppercase tracking-widest text-cream/25">Revenue Streams</p>
      </div>

      <Link
        href="/dashboard/subscriptions"
        onClick={onNavigate}
        className={`nav-link ${pathname.startsWith('/dashboard/subscriptions') ? 'active' : ''}`}
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
        className={`nav-link ${pathname.startsWith('/dashboard/loyalty') ? 'active' : ''}`}
      >
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M8 2l1.6 3.3 3.6.5-2.6 2.5.6 3.6L8 10.3l-3.2 1.6.6-3.6L2.8 5.8l3.6-.5L8 2z" strokeLinejoin="round"/>
        </svg>
        Loyalty Program
        <span className={`ml-auto h-1.5 w-1.5 rounded-full ${loyaltylionConnected ? 'bg-teal' : 'bg-cream/20'}`} />
      </Link>
    </nav>
  )
}
