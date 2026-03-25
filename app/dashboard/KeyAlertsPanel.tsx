import Link from 'next/link'

export interface Alert {
  level: 'red' | 'amber' | 'green'
  title: string
  description: string
  href?: string
  linkLabel?: string
}

const LEVEL_STYLES: Record<Alert['level'], { bg: string; border: string; dot: string; text: string }> = {
  red:   { bg: 'bg-red-50',    border: 'border-red-100',    dot: 'bg-red-500',    text: 'text-red-800' },
  amber: { bg: 'bg-yellow-50', border: 'border-yellow-100', dot: 'bg-amber-400',  text: 'text-yellow-800' },
  green: { bg: 'bg-teal-pale', border: 'border-teal/20',    dot: 'bg-teal',       text: 'text-teal-deep' },
}

export default function KeyAlertsPanel({ alerts }: { alerts: Alert[] }) {
  if (alerts.length === 0) {
    return (
      <section className="rounded-2xl border border-cream-3 bg-white p-5 shadow-sm h-full">
        <h2 className="font-display text-sm font-semibold text-ink mb-4">Key Alerts</h2>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="h-8 w-8 rounded-full bg-teal-pale flex items-center justify-center mb-2">
            <svg className="h-4 w-4 text-teal-deep" viewBox="0 0 16 16" fill="currentColor">
              <path fillRule="evenodd" d="M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12zm3.03-8.47-3.5 4.5a.75.75 0 0 1-1.13.07L4.5 8.5A.75.75 0 0 1 5.56 7.44l1.41 1.41 2.97-3.82A.75.75 0 0 1 11.03 5.53z" clipRule="evenodd" />
            </svg>
          </div>
          <p className="text-xs font-medium text-ink-2">All systems healthy</p>
          <p className="text-[10px] text-ink-3 mt-0.5">No alerts at this time</p>
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-cream-3 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-sm font-semibold text-ink">Key Alerts</h2>
        <span className="font-data text-[10px] text-ink-3">{alerts.length} item{alerts.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="space-y-2.5">
        {alerts.map((alert, i) => {
          const s = LEVEL_STYLES[alert.level]
          return (
            <div key={i} className={`rounded-lg border ${s.bg} ${s.border} px-3 py-2.5`}>
              <div className="flex items-start gap-2">
                <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${s.dot}`} />
                <div className="min-w-0">
                  <p className={`text-xs font-semibold ${s.text}`}>{alert.title}</p>
                  <p className="text-[10px] text-ink-3 mt-0.5 leading-relaxed">{alert.description}</p>
                  {alert.href && (
                    <Link href={alert.href} className="mt-1 inline-block text-[10px] font-medium text-teal-deep hover:underline">
                      {alert.linkLabel ?? 'View →'}
                    </Link>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
