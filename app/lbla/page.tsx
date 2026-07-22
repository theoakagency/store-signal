import Link from 'next/link'

export const metadata = {
  title: 'Team Tools | LBLA',
}

const TOOLS = [
  {
    href: '/lbla/ideas',
    icon: (
      <svg className="h-8 w-8 text-teal" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M9 21h6M12 3a6 6 0 0 1 4 10.6V17H8v-3.4A6 6 0 0 1 12 3z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: 'Campaign Ideas',
    description: 'Data-driven ideas ranked by opportunity. Pick one and generate content instantly.',
    cta: 'Explore',
  },
  {
    href: '/lbla/content',
    icon: (
      <svg className="h-8 w-8 text-teal" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M15.232 5.232l3.536 3.536M9 13l-4 4 4-1 7-7-3-3-7 7 1-4z" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3 21h18" strokeLinecap="round" />
      </svg>
    ),
    title: 'Content Generator',
    description: 'Create email, SMS, and push content for LBLA campaigns.',
    cta: 'Open',
  },
  {
    href: '/lbla/sku-report',
    icon: (
      <svg className="h-8 w-8 text-teal" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M9 9v12M9 15h6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: 'SKU Report',
    description: 'Generate quantity sold by SKU directly from SKU Vault.',
    cta: 'Open',
  },
  {
    href: '/lbla/reports/shipping-margin',
    icon: (
      <svg className="h-8 w-8 text-teal" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M2 7a1 1 0 0 1 1-1h9v9H3a1 1 0 0 1-1-1z" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12 9h4l3 3v3h-7z" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="6.5" cy="17" r="1.5" />
        <circle cx="16.5" cy="17" r="1.5" />
      </svg>
    ),
    title: 'Shipping Margin',
    description: 'Shipping collected vs. carrier cost by tier and order value, from ShipStation.',
    cta: 'Open',
  },
  {
    href: '/lbla/reports/kll-royalty',
    icon: (
      <svg className="h-8 w-8 text-teal" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M6 3h9l3 3v15H6z" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9 12h6M9 16h6M9 8h3" strokeLinecap="round" />
      </svg>
    ),
    title: 'KLL Royalty Report',
    description: 'Korean Lash Lift items sold by month — gross sales, order count and SKU breakdown.',
    cta: 'Open',
  },
  {
    href: '/lbla/reports/kll-discount-summary',
    icon: (
      <svg className="h-8 w-8 text-teal" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M9 15l6-6" strokeLinecap="round" />
        <circle cx="9.5" cy="9.5" r="1.5" />
        <circle cx="14.5" cy="14.5" r="1.5" />
        <rect x="3" y="3" width="18" height="18" rx="3" />
      </svg>
    ),
    title: 'KLL Discount Summary',
    description: 'Discounts, free shipping and gift cost on Korean Lash Lift orders, by month.',
    cta: 'Open',
  },
]

export default function LblaHome() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      {/* Header */}
      <div className="mb-10 text-center">
<h1 className="font-display text-3xl font-semibold text-ink">LBLA Team Tools</h1>
        <p className="mt-2 text-sm text-ink-3">Internal tools for the LBLA team</p>
      </div>

      {/* Tool cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((tool) => (
          <Link
            key={tool.href}
            href={tool.href}
            className="group flex flex-col gap-4 rounded-2xl border border-cream-3 bg-white p-6 shadow-sm transition hover:border-teal/40 hover:shadow-md"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-teal-pale">
              {tool.icon}
            </div>
            <div className="flex-1">
              <h2 className="font-display text-xl font-semibold text-ink">{tool.title}</h2>
              <p className="mt-1 text-sm text-ink-3 leading-relaxed">{tool.description}</p>
            </div>
            <span className="flex items-center gap-1 text-sm font-semibold text-teal group-hover:gap-2 transition-all">
              {tool.cta}
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 8h10M9 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
