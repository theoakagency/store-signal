'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const links = [
  {
    href: '/dashboard',
    label: 'Executive Summary',
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
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M2 8h12M8 2l4 6-4 6M4 4l-2 4 2 4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: '/dashboard/integrations',
    label: 'Integrations',
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

export default function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()

  return (
    <nav className="flex flex-col gap-0.5 px-3">
      {links.map((link) => {
        const isActive =
          link.href === '/dashboard'
            ? pathname === '/dashboard'
            : pathname.startsWith(link.href)
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
    </nav>
  )
}
