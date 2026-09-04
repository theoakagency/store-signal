import { requireLblaTool } from '@/lib/lblaAuth'

// Defense in depth: proxy.ts already gates this path, but the layout re-checks
// server-side so the tool is never rendered without an explicit grant.
export default async function ShippingMarginLayout({ children }: { children: React.ReactNode }) {
  await requireLblaTool('shipping-margin')
  return <>{children}</>
}
