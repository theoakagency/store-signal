import Link from 'next/link'

export const metadata = {
  title: 'Team Tools | LBLA',
}

const TOOLS = [
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
]

export default function LblaHome() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      {/* Header */}
      <div className="mb-10 text-center">
<h1 className="font-display text-3xl font-semibold text-ink">LBLA Team Tools</h1>
        <p className="mt-2 text-sm text-ink-3">Internal tools for the LBLA team</p>
      </div>

      {/* Tool cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
