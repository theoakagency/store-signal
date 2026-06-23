import NavLinks from './NavLinks'
import Link from 'next/link'

export default function Sidebar({
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
  return (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className="flex h-[58px] shrink-0 items-center px-5 border-b border-white/[0.06]">
        <span className="font-display text-xl font-semibold tracking-tight text-cream">
          Store<span className="text-teal">Signal</span>
        </span>
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto py-4">
        <NavLinks onNavigate={onNavigate} klaviyoConnected={klaviyoConnected} gscConnected={gscConnected} ga4Connected={ga4Connected} metaConnected={metaConnected} googleAdsConnected={googleAdsConnected} rechargeConnected={rechargeConnected} loyaltylionConnected={loyaltylionConnected} semrushConnected={semrushConnected} />
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-white/[0.06] px-5 py-3 space-y-2">
        <Link
          href="/lbla"
          className="flex items-center gap-1.5 text-[11px] font-medium text-cream/40 hover:text-cream/70 transition"
        >
          Team Tools
          <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2.5 6h7M6.5 3l3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <p className="text-[10px] font-data uppercase tracking-widest text-cream/30">
          Store Signal v1
        </p>
      </div>
    </div>
  )
}
