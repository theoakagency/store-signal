import { requireLblaTool } from '@/lib/lblaAuth'

// Defense in depth: proxy.ts already gates this path, but the layout re-checks
// server-side so the tool is never rendered without an explicit grant.
export default async function KllDiscountSummaryLayout({ children }: { children: React.ReactNode }) {
  await requireLblaTool('kll-discount-summary')
  return <>{children}</>
}
