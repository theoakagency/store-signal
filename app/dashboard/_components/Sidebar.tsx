import NavLinks from './NavLinks'

export default function Sidebar({
  onNavigate,
  klaviyoConnected,
}: {
  onNavigate?: () => void
  klaviyoConnected?: boolean
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
        <NavLinks onNavigate={onNavigate} klaviyoConnected={klaviyoConnected} />
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-white/[0.06] px-5 py-3">
        <p className="text-[10px] font-data uppercase tracking-widest text-cream/30">
          Store Signal v1
        </p>
      </div>
    </div>
  )
}
