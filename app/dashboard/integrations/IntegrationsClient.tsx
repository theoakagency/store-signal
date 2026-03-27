'use client'

import { useState, useEffect, useCallback, Fragment } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

interface Props {
  shopifyConnected: boolean
  shopifyDomain: string | null
  lastSyncedAt: string | null
  klaviyoConnected: boolean
  klaviyoAccountId: string | null
  gscConnected: boolean
  gscPropertyUrl: string | null
  ga4Connected: boolean
  ga4PropertyId: string | null
  metaConnected: boolean
  metaAdAccountId: string | null
  metaTokenExpired: boolean
  googleAdsConnected: boolean
  googleAdsCustomerId: string | null
  rechargeConnected: boolean
  loyaltylionConnected: boolean
  semrushConnected: boolean
  semrushDomain: string | null
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function showToast(msg: string) {
  const el = document.createElement('div')
  el.textContent = msg
  el.style.cssText = `
    position:fixed;bottom:24px;right:24px;z-index:9999;
    background:#1C2B2A;color:#FAF8F4;
    padding:10px 16px;border-radius:10px;
    font-size:13px;font-family:Jost,sans-serif;
    box-shadow:0 4px 24px rgba(0,0,0,0.18);
  `
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 3000)
}

// ── Badges ────────────────────────────────────────────────────────────────────

function ConnectedBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-pale px-2.5 py-1 text-xs font-semibold text-teal-deep">
      <span className="h-1.5 w-1.5 rounded-full bg-teal" />
      Connected
    </span>
  )
}

function ComingSoonBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-cream-2 px-2.5 py-1 text-xs font-medium text-ink-3">
      Coming soon
    </span>
  )
}

// ── Card ──────────────────────────────────────────────────────────────────────

interface IntegrationCardProps {
  name: string
  description: string
  logo: React.ReactNode
  status: 'connected' | 'coming_soon' | 'not_connected'
  meta?: string
  action?: React.ReactNode
}

function IntegrationCard({ name, description, logo, status, meta, action }: IntegrationCardProps) {
  return (
    <div className="flex items-start gap-4 rounded-2xl border border-cream-3 bg-white px-5 py-5 shadow-sm">
      <div className="shrink-0 h-10 w-10 rounded-xl bg-cream-2 flex items-center justify-center">
        {logo}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="font-semibold text-sm text-ink">{name}</h3>
          {status === 'connected' && <ConnectedBadge />}
          {status === 'coming_soon' && <ComingSoonBadge />}
        </div>
        <p className="mt-1 text-xs text-ink-3 leading-relaxed">{description}</p>
        {meta && <p className="mt-1.5 font-data text-xs text-ink-3">{meta}</p>}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  )
}

// ── Meta Ads Connect Modal ────────────────────────────────────────────────────

function MetaModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [token, setToken] = useState('')
  const [accountId, setAccountId] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [testState, setTestState] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle')
  const [testMsg, setTestMsg] = useState('')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'done'>('idle')

  const inputCls = 'w-full rounded-lg border border-cream-3 bg-cream px-3 py-2 text-sm text-ink focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal transition'

  async function handleTest() {
    if (!token.trim()) return
    setTestState('testing')
    setTestMsg('')
    try {
      const res = await fetch('/api/meta/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accessToken: token }) })
      const data = await res.json() as { ok?: boolean; accounts?: { id: string; name: string }[]; error?: string }
      if (data.error) { setTestState('fail'); setTestMsg(data.error); return }
      setTestState('ok')
      const accts = data.accounts ?? []
      setTestMsg(`Token valid — ${accts.length} ad account${accts.length !== 1 ? 's' : ''} found: ${accts.map((a) => `${a.name} (${a.id})`).join(', ')}`)
      if (accts.length === 1 && !accountId) setAccountId(accts[0].id)
    } catch { setTestState('fail'); setTestMsg('Network error') }
  }

  async function handleSave() {
    if (!token.trim() || !accountId.trim()) return
    setSaveState('saving')
    try {
      const res = await fetch('/api/meta/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accessToken: token, adAccountId: accountId }) })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (data.error) { setSaveState('idle'); showToast(`Error: ${data.error}`); return }
      setSaveState('done')
      fetch('/api/meta/sync', { method: 'POST' }).catch(() => null)
      onSuccess()
    } catch { setSaveState('idle'); showToast('Network error') }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-charcoal/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-cream-2 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-[#1877F2] flex items-center justify-center">
              <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
            </div>
            <h2 className="font-display text-lg font-semibold text-ink">Connect Meta Ads</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-cream-2 transition text-ink-3">
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 0 1 1.414 0L10 8.586l4.293-4.293a1 1 0 1 1 1.414 1.414L11.414 10l4.293 4.293a1 1 0 0 1-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 0 1-1.414-1.414L8.586 10 4.293 5.707a1 1 0 0 1 0-1.414z" clipRule="evenodd"/></svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 text-xs text-blue-800 space-y-1">
            <p className="font-semibold">How to get a long-lived access token:</p>
            <p>1. Go to <strong>developers.facebook.com/tools/explorer</strong></p>
            <p>2. Select your App → generate a User Token</p>
            <p>3. Add permission: <code className="bg-blue-100 px-1 rounded">ads_read</code></p>
            <p>4. Click &quot;Generate Access Token&quot; then extend to 60 days via the Token Debugger</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-2 mb-1">Access Token *</label>
            <div className="relative">
              <input type={showToken ? 'text' : 'password'} value={token} onChange={(e) => setToken(e.target.value)} placeholder="EAAxxxxx..." className={inputCls + ' pr-10'} />
              <button type="button" onClick={() => setShowToken((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink">
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0z" clipRule="evenodd"/></svg>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-2 mb-1">Ad Account ID *</label>
            <input type="text" value={accountId} onChange={(e) => setAccountId(e.target.value)} placeholder="act_123456789" className={inputCls} />
            <p className="mt-1 text-xs text-ink-3">Found in Ads Manager URL: <code>act_XXXXXXXXXX</code></p>
          </div>

          {testMsg && (
            <div className={`rounded-lg px-3 py-2.5 text-xs ${testState === 'ok' ? 'bg-teal-pale text-teal-deep' : 'bg-red-50 text-red-700'}`}>
              {testState === 'ok' ? '✓ ' : '✗ '}{testMsg}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button onClick={handleTest} disabled={!token.trim() || testState === 'testing'} className="flex-1 rounded-lg border border-cream-3 px-4 py-2.5 text-sm font-medium text-ink-2 hover:bg-cream disabled:opacity-50 transition">
              {testState === 'testing' ? <span className="flex items-center justify-center gap-2"><span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-cream-3 border-t-teal" />Testing…</span> : 'Test Connection'}
            </button>
            <button onClick={handleSave} disabled={!token.trim() || !accountId.trim() || saveState === 'saving' || saveState === 'done'} className="flex-1 rounded-lg bg-[#1877F2] px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition">
              {saveState === 'saving' ? <span className="flex items-center justify-center gap-2"><span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />Saving…</span> : saveState === 'done' ? '✓ Connected' : 'Save & Sync'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Google Ads Connect Modal ───────────────────────────────────────────────────

function GoogleAdsModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [devToken, setDevToken] = useState('')
  const [showDevToken, setShowDevToken] = useState(false)
  const [showInstructions, setShowInstructions] = useState(false)
  const [connecting, setConnecting] = useState(false)

  const inputCls = 'w-full rounded-lg border border-cream-3 bg-cream px-3 py-2 text-sm text-ink focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal transition'

  function handleConnect() {
    if (!devToken.trim()) return
    setConnecting(true)
    // Customer ID is pre-configured — only dev token is required from the user
    const params = new URLSearchParams({ developer_token: devToken.trim() })
    window.location.href = `/api/google-ads/auth?${params}`
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-charcoal/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-cream-2 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-white border border-cream-2 flex items-center justify-center">
              <svg className="h-5 w-5" viewBox="0 0 48 48" fill="none">
                <path d="M24 4L4 44h9.5l2.5-7h16l2.5 7H44L24 4z" fill="#4285F4"/>
                <path d="M24 17l5 14H19l5-14z" fill="white"/>
              </svg>
            </div>
            <h2 className="font-display text-lg font-semibold text-ink">Connect Google Ads</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-cream-2 transition text-ink-3">
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 0 1 1.414 0L10 8.586l4.293-4.293a1 1 0 1 1 1.414 1.414L11.414 10l4.293 4.293a1 1 0 0 1-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 0 1-1.414-1.414L8.586 10 4.293 5.707a1 1 0 0 1 0-1.414z" clipRule="evenodd"/></svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-ink-2">
            Connect your Google Ads account using your existing Google login. A free{' '}
            <strong>Developer Token</strong> (Basic Access) is required by the Google Ads API.
          </p>

          {/* Developer Token instructions accordion */}
          <div className="rounded-xl border border-cream-2 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowInstructions((v) => !v)}
              className="flex w-full items-center justify-between bg-cream px-4 py-3 text-xs font-medium text-ink-2 hover:bg-cream-2 transition"
            >
              <span>How to get a free Developer Token</span>
              <svg className={`h-4 w-4 text-ink-3 transition-transform ${showInstructions ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 0 1 1.414 0L10 10.586l3.293-3.293a1 1 0 1 1 1.414 1.414l-4 4a1 1 0 0 1-1.414 0l-4-4a1 1 0 0 1 0-1.414z" clipRule="evenodd"/>
              </svg>
            </button>
            {showInstructions && (
              <div className="border-t border-cream-2 bg-white px-4 py-3 text-xs text-ink-3 space-y-2">
                <p>1. Sign in to your Google Ads account at <strong>ads.google.com</strong></p>
                <p>2. Click the <strong>Tools &amp; Settings</strong> wrench icon (top right)</p>
                <p>3. Under &quot;Setup&quot;, click <strong>API Center</strong></p>
                <p>4. Fill in the &quot;Your API Center&quot; form (takes ~2 minutes). Select <strong>Basic Access</strong> — it&apos;s free and sufficient.</p>
                <p>5. Your Developer Token will appear at the top of the API Center page.</p>
                <a
                  href="https://developers.google.com/google-ads/api/docs/first-call/dev-token"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-teal hover:text-teal-dark font-medium transition"
                >
                  Full guide on Google Developers →
                </a>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-2 mb-1">
              Developer Token <span className="text-ink-3 font-normal">(from Google Ads API Center)</span>
            </label>
            <div className="relative">
              <input
                type={showDevToken ? 'text' : 'password'}
                value={devToken}
                onChange={(e) => setDevToken(e.target.value)}
                placeholder="Paste your Developer Token here"
                className={inputCls + ' pr-10'}
              />
              <button type="button" onClick={() => setShowDevToken((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink">
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0z" clipRule="evenodd"/></svg>
              </button>
            </div>
            <p className="mt-1 text-[10px] text-ink-3">Your Google account will be authorized via OAuth on the next screen.</p>
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 rounded-lg border border-cream-3 px-4 py-2.5 text-sm font-medium text-ink-2 hover:bg-cream transition">Cancel</button>
            <button
              onClick={handleConnect}
              disabled={!devToken.trim() || connecting}
              className="flex-1 rounded-lg bg-[#4285F4] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#3367d6] disabled:opacity-50 transition"
            >
              {connecting ? 'Redirecting…' : 'Continue with Google →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── GA4 Connect Modal ─────────────────────────────────────────────────────────

function Ga4Modal({ onClose }: { onClose: () => void }) {
  const [propertyId, setPropertyId] = useState('')
  const [connecting, setConnecting] = useState(false)

  const inputCls = 'w-full rounded-lg border border-cream-3 bg-cream px-3 py-2 text-sm text-ink focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal transition'

  function handleConnect() {
    const id = propertyId.trim()
    if (!id) return
    setConnecting(true)
    window.location.href = `/api/analytics/auth?property_id=${encodeURIComponent(id)}`
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-charcoal/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-cream-2 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-[#E37400] flex items-center justify-center">
              <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12.545 10.239v3.821h5.445c-.712 2.315-2.647 3.972-5.445 3.972a6.033 6.033 0 1 1 0-12.064 5.976 5.976 0 0 1 4.111 1.606l2.879-2.878A9.969 9.969 0 0 0 12.545 2C7.021 2 2.543 6.477 2.543 12s4.478 10 10.002 10c8.396 0 10.249-7.85 9.426-11.748l-9.426-.013z"/>
              </svg>
            </div>
            <h2 className="font-display text-lg font-semibold text-ink">Connect Google Analytics 4</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-cream-2 transition text-ink-3">
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 0 1 1.414 0L10 8.586l4.293-4.293a1 1 0 1 1 1.414 1.414L11.414 10l4.293 4.293a1 1 0 0 1-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 0 1-1.414-1.414L8.586 10 4.293 5.707a1 1 0 0 1 0-1.414z" clipRule="evenodd"/></svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="rounded-xl bg-cream border border-cream-2 px-4 py-3 text-xs text-ink-3 space-y-1">
            <p className="font-medium text-ink-2">Where to find your Property ID:</p>
            <p>GA4 → <strong>Admin</strong> (gear icon) → <strong>Property Settings</strong> → copy the <strong>Property ID</strong> (a numeric ID like <code className="bg-cream-3 px-1 rounded">123456789</code>)</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-2 mb-1">GA4 Property ID</label>
            <input
              type="text"
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              placeholder="123456789"
              className={inputCls}
            />
            <p className="mt-1 text-[10px] text-ink-3">Numeric only — do not include &quot;properties/&quot;</p>
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 rounded-lg border border-cream-3 px-4 py-2.5 text-sm font-medium text-ink-2 hover:bg-cream transition">Cancel</button>
            <button
              onClick={handleConnect}
              disabled={!propertyId.trim() || connecting}
              className="flex-1 rounded-lg bg-[#E37400] px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50 transition"
            >
              {connecting ? 'Redirecting…' : 'Connect with Google →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── GSC Connect Modal ─────────────────────────────────────────────────────────

function GscModal({ onClose }: { onClose: () => void }) {
  const [property, setProperty] = useState('https://')
  const [syncing, setSyncing] = useState(false)

  function handleConnect() {
    if (!property.trim() || property === 'https://') return
    setSyncing(true)
    window.location.href = `/api/gsc/auth?property=${encodeURIComponent(property.trim())}`
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-charcoal/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-cream-2 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-white border border-cream-2 flex items-center justify-center">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="#4285F4"/>
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="url(#g1)"/>
                <circle cx="12" cy="12" r="4" fill="white"/>
                <defs>
                  <linearGradient id="g1" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#4285F4"/>
                    <stop offset="0.33" stopColor="#34A853"/>
                    <stop offset="0.66" stopColor="#FBBC05"/>
                    <stop offset="1" stopColor="#EA4335"/>
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <h2 className="font-display text-lg font-semibold text-ink">Connect Search Console</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-cream-2 transition text-ink-3">
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 0 1 1.414 0L10 8.586l4.293-4.293a1 1 0 1 1 1.414 1.414L11.414 10l4.293 4.293a1 1 0 0 1-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 0 1-1.414-1.414L8.586 10 4.293 5.707a1 1 0 0 1 0-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-ink-2 mb-1">GSC Property URL *</label>
            <input
              type="url"
              value={property}
              onChange={(e) => setProperty(e.target.value)}
              placeholder="https://yourstore.com/ or sc-domain:yourstore.com"
              className="w-full rounded-lg border border-cream-3 bg-cream px-3 py-2 text-sm text-ink focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal transition"
            />
            <p className="mt-1 text-xs text-ink-3">
              Must exactly match the property in Google Search Console. Include trailing slash for URL-prefix properties.
            </p>
          </div>
          <div className="rounded-xl bg-cream border border-cream-2 px-4 py-3 text-xs text-ink-3 space-y-1">
            <p className="font-medium text-ink-2">Before connecting:</p>
            <p>1. Open <strong>Google Cloud Console</strong> → OAuth 2.0 credentials</p>
            <p>2. Add <code className="bg-cream-2 px-1 rounded">https://store-signal.vercel.app/api/gsc/callback</code> as an Authorized Redirect URI</p>
            <p>3. Ensure the Google account you authorize has access to the GSC property above</p>
          </div>
        </div>
        <div className="flex gap-2 px-6 pb-5">
          <button onClick={onClose} className="flex-1 rounded-lg border border-cream-3 px-4 py-2.5 text-sm font-medium text-ink-2 hover:bg-cream transition">
            Cancel
          </button>
          <button
            onClick={handleConnect}
            disabled={syncing || !property.trim() || property === 'https://'}
            className="flex-1 rounded-lg bg-[#4285F4] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#3367d6] transition disabled:opacity-50"
          >
            {syncing ? 'Redirecting…' : 'Connect with Google'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Klaviyo Connect Modal ─────────────────────────────────────────────────────

interface KlaviyoModalProps {
  onClose: () => void
  onSuccess: () => void
}

function KlaviyoModal({ onClose, onSuccess }: KlaviyoModalProps) {
  const [apiKey, setApiKey] = useState('')
  const [accountId, setAccountId] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [testState, setTestState] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle')
  const [testMsg, setTestMsg] = useState('')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'done' | 'fail'>('idle')

  const inputCls =
    'w-full rounded-lg border border-cream-3 bg-cream px-3 py-2 text-sm text-ink focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal transition'

  async function handleTest() {
    if (!apiKey.trim()) return
    setTestState('testing')
    setTestMsg('')
    try {
      const res = await fetch('/api/klaviyo/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      })
      const data = await res.json()
      if (data.error) {
        setTestState('fail')
        setTestMsg(data.error)
      } else {
        setTestState('ok')
        setTestMsg(`Connected to ${data.org_name ?? data.account_id} (${data.currency})`)
        if (data.account_id && !accountId) setAccountId(data.account_id)
      }
    } catch {
      setTestState('fail')
      setTestMsg('Network error — check console')
    }
  }

  async function handleSave() {
    if (!apiKey.trim()) return
    setSaveState('saving')
    try {
      const res = await fetch('/api/klaviyo/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, accountId }),
      })
      const data = await res.json()
      if (data.error) {
        setSaveState('fail')
        showToast(`Error: ${data.error}`)
        return
      }
      setSaveState('done')
      // Trigger initial sync
      fetch('/api/klaviyo/sync', { method: 'POST' }).catch(() => null)
      onSuccess()
    } catch {
      setSaveState('fail')
      showToast('Network error — could not save')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-charcoal/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-cream-2 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-[#FF6200] flex items-center justify-center">
              <span className="text-xs font-bold text-white">K</span>
            </div>
            <h2 className="font-display text-lg font-semibold text-ink">Connect Klaviyo</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-cream-2 transition text-ink-3">
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 0 1 1.414 0L10 8.586l4.293-4.293a1 1 0 1 1 1.414 1.414L11.414 10l4.293 4.293a1 1 0 0 1-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 0 1-1.414-1.414L8.586 10 4.293 5.707a1 1 0 0 1 0-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* API Key */}
          <div>
            <label className="block text-xs font-medium text-ink-2 mb-1">
              Private API Key *
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="pk_•••••••••••••••••••"
                className={inputCls + ' pr-10'}
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink transition"
              >
                {showKey ? (
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M3.707 2.293a1 1 0 0 0-1.414 1.414l14 14a1 1 0 0 0 1.414-1.414l-1.473-1.473A10.014 10.014 0 0 0 19.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 0 0-4.512 1.074l-1.78-1.781zm4.261 4.26 1.514 1.515a2.003 2.003 0 0 1 2.45 2.45l1.514 1.514a4 4 0 0 0-5.478-5.478z" /><path d="M12.454 16.697 9.75 13.992a4 4 0 0 1-3.742-3.741L2.335 6.578A9.98 9.98 0 0 0 .458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" /></svg>
                ) : (
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" /><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0z" clipRule="evenodd" /></svg>
                )}
              </button>
            </div>
            <p className="mt-1.5 text-xs text-ink-3">
              Find this in Klaviyo → Settings → API Keys → Create Private API Key.
              Required scopes: <span className="font-data">read-only</span> on Campaigns, Flows, Lists, Metrics.
            </p>
          </div>

          {/* Account ID */}
          <div>
            <label className="block text-xs font-medium text-ink-2 mb-1">
              Account ID <span className="text-ink-3 font-normal">(optional — auto-detected)</span>
            </label>
            <input
              type="text"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              placeholder="e.g. ABC123"
              className={inputCls}
            />
            <p className="mt-1.5 text-xs text-ink-3">
              Find this in Klaviyo → Settings → Account → Account ID (6-character code in the URL).
            </p>
          </div>

          {/* Test result */}
          {testMsg && (
            <div className={`rounded-lg px-3 py-2.5 text-xs ${testState === 'ok' ? 'bg-teal-pale text-teal-deep' : 'bg-red-50 text-red-700'}`}>
              {testState === 'ok' ? '✓ ' : '✗ '}{testMsg}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleTest}
              disabled={!apiKey.trim() || testState === 'testing'}
              className="flex-1 rounded-lg border border-cream-3 px-4 py-2.5 text-sm font-medium text-ink-2 hover:bg-cream disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {testState === 'testing' ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-cream-3 border-t-teal" />
                  Testing…
                </span>
              ) : 'Test Connection'}
            </button>
            <button
              onClick={handleSave}
              disabled={!apiKey.trim() || saveState === 'saving' || saveState === 'done'}
              className="flex-1 rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-dark disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {saveState === 'saving' ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  Saving…
                </span>
              ) : saveState === 'done' ? '✓ Saved' : 'Save & Sync'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Recharge Connect Modal ────────────────────────────────────────────────────

function RechargeModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [apiToken, setApiToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [testState, setTestState] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle')
  const [testMsg, setTestMsg] = useState('')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'done'>('idle')

  const inputCls = 'w-full rounded-lg border border-cream-3 bg-cream px-3 py-2 text-sm text-ink focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal transition'

  async function handleTest() {
    if (!apiToken.trim()) return
    setTestState('testing'); setTestMsg('')
    try {
      const res = await fetch('/api/recharge/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiToken }) })
      const data = await res.json() as { ok?: boolean; message?: string }
      if (data.ok) { setTestState('ok'); setTestMsg(data.message ?? 'Connection successful') }
      else { setTestState('fail'); setTestMsg(data.message ?? 'Connection failed') }
    } catch { setTestState('fail'); setTestMsg('Network error') }
  }

  async function handleSave() {
    if (!apiToken.trim()) return
    setSaveState('saving')
    try {
      const connectRes = await fetch('/api/recharge/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiToken }) })
      const connectData = await connectRes.json() as { ok?: boolean; error?: string }
      if (connectData.error) { setSaveState('idle'); showToast(`Error: ${connectData.error}`); return }

      const syncRes = await fetch('/api/recharge/sync', { method: 'POST' })
      const syncData = await syncRes.json() as { error?: string; active_subscribers?: number }
      if (syncData.error) { setSaveState('idle'); showToast(`Sync error: ${syncData.error}`); return }

      setSaveState('done')
      onSuccess()
    } catch { setSaveState('idle'); showToast('Network error') }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-charcoal/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-cream-2 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-[#FF6C00] flex items-center justify-center">
              <span className="text-sm font-bold text-white">R</span>
            </div>
            <h2 className="font-display text-lg font-semibold text-ink">Connect Recharge</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-cream-2 transition text-ink-3">
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 0 1 1.414 0L10 8.586l4.293-4.293a1 1 0 1 1 1.414 1.414L11.414 10l4.293 4.293a1 1 0 0 1-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 0 1-1.414-1.414L8.586 10 4.293 5.707a1 1 0 0 1 0-1.414z" clipRule="evenodd"/></svg>
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="rounded-xl bg-orange-50 border border-orange-100 px-4 py-3 text-xs text-orange-800 space-y-1">
            <p className="font-semibold">How to get your API Token:</p>
            <p>1. Go to <strong>Recharge Admin → Apps → API Tokens</strong></p>
            <p>2. Click <strong>Create API Token</strong></p>
            <p>3. Select <strong>Read access</strong> for Subscriptions, Customers, Charges</p>
            <p>4. Copy and paste the token below</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-2 mb-1">API Token *</label>
            <div className="relative">
              <input type={showToken ? 'text' : 'password'} value={apiToken} onChange={(e) => setApiToken(e.target.value)} placeholder="sk_1x_•••••••••••••••••" className={inputCls + ' pr-10'} />
              <button type="button" onClick={() => setShowToken((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink">
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0z" clipRule="evenodd"/></svg>
              </button>
            </div>
          </div>
          {testMsg && (
            <div className={`rounded-lg px-3 py-2.5 text-xs ${testState === 'ok' ? 'bg-teal-pale text-teal-deep' : 'bg-red-50 text-red-700'}`}>
              {testState === 'ok' ? '✓ ' : '✗ '}{testMsg}
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button onClick={handleTest} disabled={!apiToken.trim() || testState === 'testing'} className="flex-1 rounded-lg border border-cream-3 px-4 py-2.5 text-sm font-medium text-ink-2 hover:bg-cream disabled:opacity-50 transition">
              {testState === 'testing' ? <span className="flex items-center justify-center gap-2"><span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-cream-3 border-t-teal" />Testing…</span> : 'Test Connection'}
            </button>
            <button onClick={handleSave} disabled={!apiToken.trim() || saveState === 'saving' || saveState === 'done'} className="flex-1 rounded-lg bg-[#FF6C00] px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50 transition">
              {saveState === 'saving' ? <span className="flex items-center justify-center gap-2"><span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />Connecting & syncing…</span> : saveState === 'done' ? '✓ Connected' : 'Save & Sync'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── LoyaltyLion Connect Modal ──────────────────────────────────────────────────

function LoyaltyLionModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [token, setToken] = useState('')
  const [secret, setSecret] = useState('')
  const [testState, setTestState] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle')
  const [testMsg, setTestMsg] = useState('')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'done'>('idle')

  const inputCls = 'w-full rounded-lg border border-cream-3 bg-cream px-3 py-2 text-sm text-ink focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal transition'

  async function handleTest() {
    if (!token.trim()) return
    setTestState('testing'); setTestMsg('')
    try {
      const res = await fetch('/api/loyaltylion/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, secret: secret || undefined }) })
      const data = await res.json() as { ok?: boolean; message?: string }
      if (data.ok) { setTestState('ok'); setTestMsg(data.message ?? 'Connection successful') }
      else { setTestState('fail'); setTestMsg(data.message ?? 'Connection failed') }
    } catch { setTestState('fail'); setTestMsg('Network error') }
  }

  async function handleSave() {
    if (!token.trim()) return
    setSaveState('saving')
    try {
      const res = await fetch('/api/loyaltylion/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, secret: secret || undefined }) })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (data.error) { setSaveState('idle'); showToast(`Error: ${data.error}`); return }
      setSaveState('done')
      fetch('/api/loyaltylion/sync', { method: 'POST' }).catch(() => null)
      onSuccess()
    } catch { setSaveState('idle'); showToast('Network error') }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-charcoal/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-cream-2 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-[#E31C79] flex items-center justify-center">
              <svg className="h-5 w-5 text-white" viewBox="0 0 20 20" fill="currentColor">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            </div>
            <h2 className="font-display text-lg font-semibold text-ink">Connect LoyaltyLion</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-cream-2 transition text-ink-3">
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 0 1 1.414 0L10 8.586l4.293-4.293a1 1 0 1 1 1.414 1.414L11.414 10l4.293 4.293a1 1 0 0 1-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 0 1-1.414-1.414L8.586 10 4.293 5.707a1 1 0 0 1 0-1.414z" clipRule="evenodd"/></svg>
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="rounded-xl bg-pink-50 border border-pink-100 px-4 py-3 text-xs text-pink-900 space-y-1">
            <p className="font-semibold">How to find your credentials:</p>
            <p>1. Go to <strong>LoyaltyLion Admin → Settings → API</strong></p>
            <p>2. Copy your <strong>API Token</strong> and <strong>API Secret</strong></p>
            <p className="text-pink-700">Both are required for full API access.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-2 mb-1">API Token *</label>
            <input type="text" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Token from LoyaltyLion → Settings → API" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-2 mb-1">API Secret *</label>
            <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="Secret from LoyaltyLion → Settings → API" className={inputCls} />
          </div>
          {testMsg && (
            <div className={`rounded-lg px-3 py-2.5 text-xs ${testState === 'ok' ? 'bg-teal-pale text-teal-deep' : 'bg-red-50 text-red-700'}`}>
              {testState === 'ok' ? '✓ ' : '✗ '}{testMsg}
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button onClick={handleTest} disabled={!token.trim() || testState === 'testing'} className="flex-1 rounded-lg border border-cream-3 px-4 py-2.5 text-sm font-medium text-ink-2 hover:bg-cream disabled:opacity-50 transition">
              {testState === 'testing' ? <span className="flex items-center justify-center gap-2"><span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-cream-3 border-t-teal" />Testing…</span> : 'Test Connection'}
            </button>
            <button onClick={handleSave} disabled={!token.trim() || saveState === 'saving' || saveState === 'done'} className="flex-1 rounded-lg bg-[#E31C79] px-4 py-2.5 text-sm font-semibold text-white hover:bg-pink-700 disabled:opacity-50 transition">
              {saveState === 'saving' ? <span className="flex items-center justify-center gap-2"><span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />Saving…</span> : saveState === 'done' ? '✓ Connected' : 'Save & Sync'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── SEMrush Connect Modal ─────────────────────────────────────────────────────

function SemrushModal({ onClose, onSuccess, shopifyDomain }: { onClose: () => void; onSuccess: () => void; shopifyDomain: string | null }) {
  const [apiKey, setApiKey] = useState('')
  const [domain, setDomain] = useState(shopifyDomain?.replace('.myshopify.com', '') ?? '')
  const [showKey, setShowKey] = useState(false)
  const [testState, setTestState] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle')
  const [testMsg, setTestMsg] = useState('')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'done'>('idle')

  const inputCls = 'w-full rounded-lg border border-cream-3 bg-cream px-3 py-2 text-sm text-ink focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal transition'

  async function handleTest() {
    if (!apiKey.trim() || !domain.trim()) return
    setTestState('testing'); setTestMsg('')
    try {
      const res = await fetch('/api/semrush/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey, domain }) })
      const data = await res.json() as { ok?: boolean; message?: string }
      if (data.ok) { setTestState('ok'); setTestMsg(data.message ?? 'Connection successful') }
      else { setTestState('fail'); setTestMsg(data.message ?? 'Connection failed') }
    } catch { setTestState('fail'); setTestMsg('Network error') }
  }

  async function handleSave() {
    if (!apiKey.trim() || !domain.trim()) return
    setSaveState('saving')
    try {
      const res = await fetch('/api/semrush/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey, domain }) })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (data.error) { setSaveState('idle'); showToast(`Error: ${data.error}`); return }
      setSaveState('done')
      fetch('/api/semrush/sync', { method: 'POST' }).catch(() => null)
      onSuccess()
    } catch { setSaveState('idle'); showToast('Network error') }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-charcoal/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-cream-2 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-[#FF642D] flex items-center justify-center">
              <span className="text-xs font-bold text-white">S</span>
            </div>
            <h2 className="font-display text-lg font-semibold text-ink">Connect SEMrush</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-cream-2 transition text-ink-3">
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 0 1 1.414 0L10 8.586l4.293-4.293a1 1 0 1 1 1.414 1.414L11.414 10l4.293 4.293a1 1 0 0 1-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 0 1-1.414-1.414L8.586 10 4.293 5.707a1 1 0 0 1 0-1.414z" clipRule="evenodd"/></svg>
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="rounded-xl bg-orange-50 border border-orange-100 px-4 py-3 text-xs text-orange-900 space-y-1">
            <p className="font-semibold">How to find your API key:</p>
            <p>Go to <strong>semrush.com/accounts/profile/api</strong> to find your API key.</p>
            <p>Each sync consumes ~50–150 API units. Sync when you need fresh data.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-2 mb-1">API Key *</label>
            <div className="relative">
              <input type={showKey ? 'text' : 'password'} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" className={inputCls + ' pr-10'} />
              <button type="button" onClick={() => setShowKey((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink">
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0z" clipRule="evenodd"/></svg>
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-2 mb-1">Domain to analyze *</label>
            <input type="text" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="yourdomain.com" className={inputCls} />
            <p className="mt-1 text-xs text-ink-3">Your root domain without www or https (e.g. lashboxla.com)</p>
          </div>
          {testMsg && (
            <div className={`rounded-lg px-3 py-2.5 text-xs ${testState === 'ok' ? 'bg-teal-pale text-teal-deep' : 'bg-red-50 text-red-700'}`}>
              {testState === 'ok' ? '✓ ' : '✗ '}{testMsg}
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button onClick={handleTest} disabled={!apiKey.trim() || !domain.trim() || testState === 'testing'} className="flex-1 rounded-lg border border-cream-3 px-4 py-2.5 text-sm font-medium text-ink-2 hover:bg-cream disabled:opacity-50 transition">
              {testState === 'testing' ? <span className="flex items-center justify-center gap-2"><span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-cream-3 border-t-teal" />Testing…</span> : 'Test Connection'}
            </button>
            <button onClick={handleSave} disabled={!apiKey.trim() || !domain.trim() || saveState === 'saving' || saveState === 'done'} className="flex-1 rounded-lg bg-[#FF642D] px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50 transition">
              {saveState === 'saving' ? <span className="flex items-center justify-center gap-2"><span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />Saving…</span> : saveState === 'done' ? '✓ Connected' : 'Save & Sync'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function IntegrationsClient({
  shopifyConnected,
  shopifyDomain,
  lastSyncedAt,
  klaviyoConnected,
  klaviyoAccountId,
  gscConnected,
  gscPropertyUrl,
  ga4Connected,
  ga4PropertyId,
  metaConnected,
  metaAdAccountId,
  metaTokenExpired,
  googleAdsConnected,
  googleAdsCustomerId,
  rechargeConnected,
  loyaltylionConnected,
  semrushConnected,
  semrushDomain,
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // ── Sync history state ───────────────────────────────────────────────────────
  interface CronRun {
    id: string
    cron_name: string
    started_at: string
    completed_at: string | null
    status: string
    records_synced: number
    errors: string[]
  }
  interface SyncStatus {
    syncEnabled: boolean
    recentRuns: CronRun[]
    integrations: Record<string, boolean>
  }
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null)
  const [manualSyncing, setManualSyncing] = useState<Record<string, boolean>>({})

  const fetchSyncStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/sync/status')
      if (res.ok) setSyncStatus(await res.json() as SyncStatus)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { fetchSyncStatus() }, [fetchSyncStatus])

  const MANUAL_SYNC_ROUTES: Record<string, string> = {
    'sync-shopify':   '/api/shopify/sync',
    'sync-klaviyo':   '/api/klaviyo/sync',
    'sync-ads':       '/api/meta/sync',
    'sync-analytics': '/api/analytics/sync',
    'sync-recharge':  '/api/recharge/sync',
    'sync-loyalty':   '/api/loyaltylion/sync',
    'sync-gsc':       '/api/gsc/sync',
    'sync-search':    '/api/semrush/sync',
  }

  const CRON_LABELS: Record<string, string> = {
    'sync-shopify':    'Shopify',
    'sync-klaviyo':    'Klaviyo',
    'sync-ads':        'Ads (Meta + Google)',
    'sync-analytics':  'Analytics (GA4)',
    'sync-recharge':   'Recharge',
    'sync-loyalty':    'LoyaltyLion',
    'sync-gsc':        'Search Console',
    'sync-search':     'SEMrush',
    'daily-rebuild':   'Profile rebuild',
    'daily-analysis':  'Product analysis',
  }

  async function triggerManualSync(cronName: string) {
    const route = MANUAL_SYNC_ROUTES[cronName]
    if (!route) return
    setManualSyncing((s) => ({ ...s, [cronName]: true }))
    try {
      await fetch(route, { method: 'POST' })
      await fetchSyncStatus()
    } finally {
      setManualSyncing((s) => ({ ...s, [cronName]: false }))
    }
  }

  function fmtTime(iso: string | null): string {
    if (!iso) return '—'
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
  }

  function timeAgoShort(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime()
    const m = Math.floor(ms / 60000)
    if (m < 1) return 'just now'
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ago`
    return `${Math.floor(h / 24)}d ago`
  }

  function cleanErrorMessage(err: string, cronName: string): string {
    // SEMrush API units exhausted
    if (/132|api.units.balance|UNITS.BALANCE/i.test(err)) {
      return 'SEMrush API units exhausted — top up units at semrush.com/billing'
    }
    // Meta token expired / HTML response
    if (/<!DOCTYPE|<html|non-json response|token.*expir|expir.*token/i.test(err)) {
      if (cronName === 'sync-ads' || cronName.includes('meta')) {
        return 'Meta Ads token may be expired — reconnect in Integrations'
      }
      const platform = CRON_LABELS[cronName] ?? cronName
      return `Unexpected response from ${platform} — check sync logs`
    }
    // LoyaltyLion 502 / server errors
    if ((cronName === 'sync-loyalty') && /502|bad.gateway|server.error/i.test(err)) {
      return 'LoyaltyLion server error — will retry automatically'
    }
    // Strip any remaining HTML tags (show only text content)
    if (/<[a-z]/i.test(err)) {
      const stripped = err.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300)
      const platform = CRON_LABELS[cronName] ?? cronName
      return stripped.length > 20 ? stripped : `Unexpected response from ${platform}`
    }
    return err
  }

  // Last run timestamp per cron (recentRuns is newest-first)
  const lastRunByCron = (syncStatus?.recentRuns ?? []).reduce<Record<string, string>>((acc, run) => {
    if (!acc[run.cron_name]) acc[run.cron_name] = run.started_at
    return acc
  }, {})

  const [expandedRunId, setExpandedRunId] = useState<string | null>(null)
  const [clearingLogs, setClearingLogs] = useState(false)

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const id = setInterval(fetchSyncStatus, 60_000)
    return () => clearInterval(id)
  }, [fetchSyncStatus])

  async function handleClearLogs() {
    setClearingLogs(true)
    try {
      const res = await fetch('/api/cron/clear-logs', { method: 'DELETE' })
      const data = await res.json() as { deleted?: number; error?: string }
      if (data.error) { showToast(`Error: ${data.error}`); return }
      showToast(`Cleared ${data.deleted ?? 0} old log entries`)
      await fetchSyncStatus()
    } catch { showToast('Network error') }
    finally { setClearingLogs(false) }
  }

  const [showKlaviyoModal, setShowKlaviyoModal] = useState(false)
  const [showGscModal, setShowGscModal] = useState(false)
  const [showGa4Modal, setShowGa4Modal] = useState(false)
  const [showMetaModal, setShowMetaModal] = useState(false)
  const [showGoogleAdsModal, setShowGoogleAdsModal] = useState(false)
  const [showRechargeModal, setShowRechargeModal] = useState(false)
  const [showLoyaltyLionModal, setShowLoyaltyLionModal] = useState(false)
  const [showSemrushModal, setShowSemrushModal] = useState(false)
  const [disconnectingGsc, setDisconnectingGsc] = useState(false)

  // Handle OAuth callback toasts
  useEffect(() => {
    if (searchParams.get('google_ads_connected')) {
      showToast('Google Ads connected! Running first sync…')
      fetch('/api/google-ads/sync', { method: 'POST' }).catch(() => null)
      router.replace('/dashboard/integrations')
    }
    const gadsError = searchParams.get('google_ads_error')
    if (gadsError) {
      showToast(`Google Ads error: ${decodeURIComponent(gadsError)}`)
      router.replace('/dashboard/integrations')
    }
    if (searchParams.get('gsc_connected')) {
      showToast('Google Search Console connected! Running first sync…')
      fetch('/api/gsc/sync', { method: 'POST' }).catch(() => null)
      router.replace('/dashboard/integrations')
    }
    const gscError = searchParams.get('gsc_error')
    if (gscError) {
      showToast(`GSC error: ${decodeURIComponent(gscError)}`)
      router.replace('/dashboard/integrations')
    }
    if (searchParams.get('ga4_connected')) {
      showToast('Google Analytics 4 connected! Running first sync…')
      fetch('/api/analytics/sync', { method: 'POST' }).catch(() => null)
      router.replace('/dashboard/integrations')
    }
    const ga4Error = searchParams.get('ga4_error')
    if (ga4Error) {
      showToast(`GA4 error: ${decodeURIComponent(ga4Error)}`)
      router.replace('/dashboard/integrations')
    }
  }, [searchParams, router])

  async function handleGscDisconnect() {
    setDisconnectingGsc(true)
    await fetch('/api/gsc/disconnect', { method: 'DELETE' })
    router.refresh()
    setDisconnectingGsc(false)
  }

  const lastSync = lastSyncedAt
    ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        .format(new Date(lastSyncedAt))
    : null

  function handleKlaviyoSuccess() {
    setShowKlaviyoModal(false)
    showToast('Klaviyo connected — initial sync started')
    router.refresh()
  }

  function handleMetaSuccess() {
    setShowMetaModal(false)
    showToast('Meta Ads connected — initial sync started')
    router.refresh()
  }

  return (
    <>
      {showKlaviyoModal && (
        <KlaviyoModal onClose={() => setShowKlaviyoModal(false)} onSuccess={handleKlaviyoSuccess} />
      )}
      {showGscModal && <GscModal onClose={() => setShowGscModal(false)} />}
      {showGa4Modal && <Ga4Modal onClose={() => setShowGa4Modal(false)} />}
      {showMetaModal && <MetaModal onClose={() => setShowMetaModal(false)} onSuccess={handleMetaSuccess} />}
      {showGoogleAdsModal && <GoogleAdsModal onClose={() => setShowGoogleAdsModal(false)} onSuccess={() => { setShowGoogleAdsModal(false); router.refresh() }} />}
      {showRechargeModal && <RechargeModal onClose={() => setShowRechargeModal(false)} onSuccess={() => { setShowRechargeModal(false); showToast('Recharge connected — syncing now…'); router.refresh() }} />}
      {showLoyaltyLionModal && <LoyaltyLionModal onClose={() => setShowLoyaltyLionModal(false)} onSuccess={() => { setShowLoyaltyLionModal(false); showToast('LoyaltyLion connected — syncing now…'); router.refresh() }} />}
      {showSemrushModal && <SemrushModal onClose={() => setShowSemrushModal(false)} onSuccess={() => { setShowSemrushModal(false); showToast('SEMrush connected — initial sync started'); router.refresh() }} shopifyDomain={shopifyDomain} />}

      <div className="space-y-8">
        {/* E-Commerce */}
        <section>
          <h2 className="font-display text-base font-semibold text-ink mb-3">E-Commerce</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <IntegrationCard
              name="Shopify"
              description="Sync orders, customers, and products from your Shopify store. Supports incremental and full historical imports."
              logo={
                <svg viewBox="0 0 109 124" className="h-6 w-6" fill="#96BF48">
                  <path d="M74.7 14.8s-.3-.1-.8-.1c-3.8-1-7.2-1.4-10.3-1.4C56 6.1 51.6 1 45.5 1c-1.4 0-2.8.3-4 .9C38.4-.4 34.9 0 31.7 2.4 19.5 10.5 14 32.4 12.2 43.7c-5.5 1.7-9.4 2.9-9.9 3.1C-.1 47.8 0 48 0 49.4L.2 108c0 1.1.7 2 1.7 2.3l72.4 13.6c.2 0 .3.1.5.1s.3 0 .5-.1l30.6-5.7c1.2-.2 2.1-1.3 2.1-2.5V14.1c0-1.2-.8-2.2-2.1-2.4zM80 19.5l-6.9 2.1c-1.5-9.7-4.4-17.7-9.1-22.2C72.8 2.7 79 10.7 80 19.5zm-34.5-14c-1.3.8-2.6 2.1-3.8 3.9C39 13.7 37 18 35.4 24.4l-13.7 4.2c3-12.4 10.5-24.2 23.8-23zM56 106.3L18.5 112V54.8l37.6-6v57.5zm9.4-88.9c2.4 3.3 4.3 7.9 5.4 13.6l-5.4 1.6V17.4zm-16.8 3.7c2.7-8.8 7.1-14.1 11.4-15.8 4.7 4.5 8.2 12.8 9.8 23.5l-15.8 4.8c.3-4.9.9-9.1 1.7-12.5zm-1.9.5c-.8 3.5-1.3 7.6-1.5 12.2l-16.3 5c2-7 5.1-12.5 9-16.3l8.8-2.7-.1 1.8zM55.5 32c-.2 0-.5.1-.7.1l-35.9 10.9-.8.2c.1-.7.1-1.4.2-2.1l37.2-11.3v2.2zm0 6.6v12.4l-37 5.9v-12l37-6.3zm0 59.2L18.5 97V65.8l37 5.9v26.1zm10.5 2.7V44.1l17.7-5.4v63.4l-17.7-7.6zm22.5-68.3l-4.9 1.5V21l4.9.6v10.6z" />
                </svg>
              }
              status={shopifyConnected ? 'connected' : 'not_connected'}
              meta={shopifyConnected ? `${shopifyDomain}${lastSync ? ` · Last sync: ${lastSync}` : ''}` : 'Not connected'}
              action={
                shopifyConnected ? (
                  <a href="/api/shopify/install" className="text-xs text-teal hover:text-teal-dark font-medium transition">
                    Re-authorize
                  </a>
                ) : (
                  <a href="/api/shopify/install" className="inline-flex items-center rounded-lg bg-teal px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-dark transition">
                    Connect Shopify
                  </a>
                )
              }
            />
            <IntegrationCard
              name="WooCommerce"
              description="Connect your WooCommerce store to sync orders and customer data for unified analytics."
              logo={<svg viewBox="0 0 100 100" className="h-6 w-6"><circle cx="50" cy="50" r="50" fill="#7f54b3" /><path d="M16 36.4a5.6 5.6 0 0 1 4.9-3.3h59.6a5.4 5.4 0 0 1 4.9 3.3 5.9 5.9 0 0 1-.2 5.3L72.6 74a5.6 5.6 0 0 1-4.9 3H33.3a5.5 5.5 0 0 1-4.9-3L16.2 41.7a5.9 5.9 0 0 1-.2-5.3zm26.8 27.7 5.9-16.3 7.3 14.4a2.4 2.4 0 0 0 4.3-.3l8-22.8a2 2 0 0 0-3.8-1.3l-5.8 16.7-7.1-14.1a2.4 2.4 0 0 0-4.4.2l-8 22.8a2 2 0 0 0 3.6 1.7z" fill="white" /></svg>}
              status="coming_soon"
            />
          </div>
        </section>

        {/* Email & Marketing */}
        <section>
          <h2 className="font-display text-base font-semibold text-ink mb-3">Email & Marketing</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {/* Klaviyo — live */}
            <IntegrationCard
              name="Klaviyo"
              description="Sync campaign performance, flow revenue, and email metrics. Unlocks Email Intelligence in the sidebar."
              logo={
                <div className="h-6 w-6 rounded bg-[#FF6200] flex items-center justify-center">
                  <span className="text-xs font-bold text-white">K</span>
                </div>
              }
              status={klaviyoConnected ? 'connected' : 'not_connected'}
              meta={klaviyoConnected ? `Account ${klaviyoAccountId ?? 'connected'}` : undefined}
              action={
                klaviyoConnected ? (
                  <div className="flex items-center gap-3">
                    <a href="/dashboard/klaviyo" className="text-xs text-teal hover:text-teal-dark font-medium transition">
                      View dashboard →
                    </a>
                    <button
                      onClick={() => setShowKlaviyoModal(true)}
                      className="text-xs text-ink-3 hover:text-ink transition"
                    >
                      Update key
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowKlaviyoModal(true)}
                    className="inline-flex items-center rounded-lg bg-[#FF6200] px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 transition"
                  >
                    Connect Klaviyo
                  </button>
                )
              }
            />
            {[
              { name: 'Mailchimp', desc: 'Push customer lists and revenue data to Mailchimp audiences.' },
              { name: 'Postscript', desc: 'Connect SMS campaigns to order and customer data.' },
            ].map((i) => (
              <IntegrationCard
                key={i.name}
                name={i.name}
                description={i.desc}
                logo={<div className="text-xs font-bold text-ink-3">{i.name[0]}</div>}
                status="coming_soon"
                action={
                  <button onClick={() => showToast(`${i.name} integration coming soon`)} className="text-xs text-teal hover:text-teal-dark font-medium transition">
                    Join waitlist
                  </button>
                }
              />
            ))}
          </div>
        </section>

        {/* Analytics & Search */}
        <section>
          <h2 className="font-display text-base font-semibold text-ink mb-3">Analytics & Search</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {/* Google Search Console — live */}
            <IntegrationCard
              name="Google Search Console"
              description="Sync keyword rankings, click trends, and page performance. Unlocks Search Intelligence in the sidebar."
              logo={
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="#4285F4"/>
                  <circle cx="12" cy="12" r="4" fill="white"/>
                  <path d="M21.17 10.5H12v3h5.25C16.69 16.19 14.58 17.5 12 17.5a5.5 5.5 0 0 1 0-11 5.44 5.44 0 0 1 3.54 1.31l2.12-2.12A8.5 8.5 0 1 0 20.5 12c0-.51-.05-1.01-.14-1.5h.81z" fill="#34A853"/>
                </svg>
              }
              status={gscConnected ? 'connected' : 'not_connected'}
              meta={gscConnected ? gscPropertyUrl ?? 'Property connected' : undefined}
              action={
                gscConnected ? (
                  <div className="flex items-center gap-3">
                    <a href="/dashboard/search" className="text-xs text-teal hover:text-teal-dark font-medium transition">
                      View dashboard →
                    </a>
                    <button
                      onClick={handleGscDisconnect}
                      disabled={disconnectingGsc}
                      className="text-xs text-ink-3 hover:text-red-500 transition"
                    >
                      {disconnectingGsc ? 'Disconnecting…' : 'Disconnect'}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowGscModal(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#4285F4] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#3367d6] transition"
                  >
                    Connect with Google
                  </button>
                )
              }
            />
            <IntegrationCard
              name="Google Analytics 4"
              description="Track website traffic by channel, landing page performance, monthly trends, and ecommerce conversions. Note: this is a separate Google authorization from Google Ads — both use Google accounts but require different permissions."
              logo={
                <div className="h-5 w-5 rounded bg-[#E37400] flex items-center justify-center">
                  <svg className="h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12.545 10.239v3.821h5.445c-.712 2.315-2.647 3.972-5.445 3.972a6.033 6.033 0 1 1 0-12.064 5.976 5.976 0 0 1 4.111 1.606l2.879-2.878A9.969 9.969 0 0 0 12.545 2C7.021 2 2.543 6.477 2.543 12s4.478 10 10.002 10c8.396 0 10.249-7.85 9.426-11.748l-9.426-.013z"/>
                  </svg>
                </div>
              }
              status={ga4Connected ? 'connected' : 'not_connected'}
              meta={ga4Connected ? `Property ID: ${ga4PropertyId ?? 'connected'}` : undefined}
              action={
                ga4Connected ? (
                  <div className="flex items-center gap-3">
                    <a href="/dashboard/analytics" className="text-xs text-teal hover:text-teal-dark font-medium transition">View dashboard →</a>
                    <button onClick={() => setShowGa4Modal(true)} className="text-xs text-ink-3 hover:text-ink transition">Re-connect</button>
                  </div>
                ) : (
                  <button onClick={() => setShowGa4Modal(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#E37400] px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-700 transition">
                    Connect GA4
                  </button>
                )
              }
            />
            <IntegrationCard
              name="Triple Whale"
              description="Import ROAS and attributed revenue from paid channels."
              logo={<div className="text-xs font-bold text-ink-3">T</div>}
              status="coming_soon"
              action={
                <button onClick={() => showToast('Triple Whale integration coming soon')} className="text-xs text-teal hover:text-teal-dark font-medium transition">
                  Join waitlist
                </button>
              }
            />
            <IntegrationCard
              name="SEMrush"
              description="Track organic keyword rankings, competitor analysis, keyword gap opportunities, lost rankings, and backlink authority. Unlocks SEO Intelligence in the sidebar."
              logo={
                <div className="h-6 w-6 rounded-lg bg-[#FF642D] flex items-center justify-center">
                  <span className="text-xs font-bold text-white">S</span>
                </div>
              }
              status={semrushConnected ? 'connected' : 'not_connected'}
              meta={semrushConnected ? `Tracking: ${semrushDomain ?? 'domain connected'}` : undefined}
              action={
                semrushConnected ? (
                  <div className="flex items-center gap-3">
                    <a href="/dashboard/semrush" className="text-xs text-teal hover:text-teal-dark font-medium transition">View dashboard →</a>
                    <button onClick={() => setShowSemrushModal(true)} className="text-xs text-ink-3 hover:text-ink transition">Update key</button>
                  </div>
                ) : (
                  <button onClick={() => setShowSemrushModal(true)} className="inline-flex items-center rounded-lg bg-[#FF642D] px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-700 transition">
                    Connect SEMrush
                  </button>
                )
              }
            />
          </div>
        </section>

        {/* Advertising */}
        <section>
          <h2 className="font-display text-base font-semibold text-ink mb-3">Advertising</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <IntegrationCard
              name="Meta Ads"
              description="Track Facebook and Instagram ad performance — spend, ROAS, purchases, and campaign scoring. Unlocks Meta Ads in the Advertising section."
              logo={
                <div className="h-6 w-6 rounded bg-[#1877F2] flex items-center justify-center">
                  <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                </div>
              }
              status={metaConnected && !metaTokenExpired ? 'connected' : 'not_connected'}
              meta={
                metaTokenExpired
                  ? undefined
                  : metaConnected ? `Account: ${metaAdAccountId ?? 'connected'}` : undefined
              }
              action={
                metaTokenExpired ? (
                  <div className="space-y-2">
                    <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                      <svg className="h-4 w-4 shrink-0 text-red-500 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM8.28 7.22a.75.75 0 0 0-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 1 0 1.06 1.06L10 11.06l1.72 1.72a.75.75 0 1 0 1.06-1.06L11.06 10l1.72-1.72a.75.75 0 0 0-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd"/>
                      </svg>
                      <p className="text-xs text-red-700 font-medium">Token expired — reconnect required to resume syncing</p>
                    </div>
                    <button onClick={() => setShowMetaModal(true)} className="inline-flex items-center rounded-lg bg-[#1877F2] px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition">
                      Reconnect Meta Ads
                    </button>
                  </div>
                ) : metaConnected ? (
                  <div className="flex items-center gap-3">
                    <a href="/dashboard/meta" className="text-xs text-teal hover:text-teal-dark font-medium transition">View dashboard →</a>
                    <button onClick={() => setShowMetaModal(true)} className="text-xs text-ink-3 hover:text-ink transition">Update credentials</button>
                  </div>
                ) : (
                  <button onClick={() => setShowMetaModal(true)} className="inline-flex items-center rounded-lg bg-[#1877F2] px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition">
                    Connect Meta Ads
                  </button>
                )
              }
            />
            <IntegrationCard
              name="Google Ads"
              description="Sync Google Ads paid search and Shopping campaign performance — spend, ROAS, and conversions. Uses a separate Google authorization from GA4 (different API scopes). Unlocks Google Ads in the Advertising section."
              logo={
                <svg className="h-6 w-6" viewBox="0 0 48 48" fill="none">
                  <path d="M24 4L4 44h9.5l2.5-7h16l2.5 7H44L24 4z" fill="#4285F4"/>
                  <path d="M24 17l5 14H19l5-14z" fill="white"/>
                </svg>
              }
              status={googleAdsConnected ? 'connected' : 'not_connected'}
              meta={googleAdsConnected ? `Customer ID: ${googleAdsCustomerId ?? 'connected'}` : undefined}
              action={
                googleAdsConnected ? (
                  <div className="flex items-center gap-3">
                    <a href="/dashboard/google-ads" className="text-xs text-teal hover:text-teal-dark font-medium transition">View dashboard →</a>
                    <button onClick={() => setShowGoogleAdsModal(true)} className="text-xs text-ink-3 hover:text-ink transition">Re-connect</button>
                  </div>
                ) : (
                  <button onClick={() => setShowGoogleAdsModal(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#4285F4] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#3367d6] transition">
                    Connect Google Ads
                  </button>
                )
              }
            />
          </div>
        </section>

        {/* Revenue Streams */}
        <section>
          <h2 className="font-display text-base font-semibold text-ink mb-3">Revenue Streams</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <IntegrationCard
              name="Recharge Subscriptions"
              description="Track subscription MRR, ARR, churn rate, interval breakdown, and subscriber LTV vs one-time buyer comparison."
              logo={
                <div className="h-6 w-6 rounded-lg bg-[#FF6C00] flex items-center justify-center">
                  <span className="text-xs font-bold text-white">R</span>
                </div>
              }
              status={rechargeConnected ? 'connected' : 'not_connected'}
              action={
                rechargeConnected ? (
                  <div className="flex items-center gap-3">
                    <a href="/dashboard/subscriptions" className="text-xs text-teal hover:text-teal-dark font-medium transition">View dashboard →</a>
                    <button onClick={() => setShowRechargeModal(true)} className="text-xs text-ink-3 hover:text-ink transition">Update token</button>
                  </div>
                ) : (
                  <button onClick={() => setShowRechargeModal(true)} className="inline-flex items-center rounded-lg bg-[#FF6C00] px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-700 transition">
                    Connect Recharge
                  </button>
                )
              }
            />
            <IntegrationCard
              name="LoyaltyLion"
              description="Analyze loyalty program health, points flow, promotion lift, and whether points multiplier campaigns actually drive incremental purchases."
              logo={
                <div className="h-6 w-6 rounded-lg bg-[#E31C79] flex items-center justify-center">
                  <svg className="h-4 w-4 text-white" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                </div>
              }
              status={loyaltylionConnected ? 'connected' : 'not_connected'}
              action={
                loyaltylionConnected ? (
                  <div className="flex items-center gap-3">
                    <a href="/dashboard/loyalty" className="text-xs text-teal hover:text-teal-dark font-medium transition">View dashboard →</a>
                    <button onClick={() => setShowLoyaltyLionModal(true)} className="text-xs text-ink-3 hover:text-ink transition">Update credentials</button>
                  </div>
                ) : (
                  <button onClick={() => setShowLoyaltyLionModal(true)} className="inline-flex items-center rounded-lg bg-[#E31C79] px-3 py-1.5 text-xs font-semibold text-white hover:bg-pink-700 transition">
                    Connect LoyaltyLion
                  </button>
                )
              }
            />
          </div>
        </section>

        {/* Team */}
        <section>
          <h2 className="font-display text-base font-semibold text-ink mb-3">Team & Collaboration</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[
              { name: 'Slack', desc: 'Get daily revenue digests and sync alerts in your Slack channels.' },
              { name: 'Notion', desc: 'Export promotion scores and customer segments to Notion databases.' },
            ].map((i) => (
              <IntegrationCard
                key={i.name}
                name={i.name}
                description={i.desc}
                logo={<div className="text-xs font-bold text-ink-3">{i.name[0]}</div>}
                status="coming_soon"
                action={
                  <button onClick={() => showToast(`${i.name} integration coming soon`)} className="text-xs text-teal hover:text-teal-dark font-medium transition">
                    Join waitlist
                  </button>
                }
              />
            ))}
          </div>
        </section>

        {/* Sync History */}
        <section>
          <div className="flex items-center justify-between mb-1">
            <div>
              <h2 className="font-display text-base font-semibold text-ink">Sync History</h2>
              <p className="text-[11px] text-ink-3 mt-0.5">Last 50 runs · auto-refreshes every 60 seconds</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleClearLogs}
                disabled={clearingLogs}
                className="text-[11px] font-medium text-ink-3 hover:text-red-500 transition disabled:opacity-50"
              >
                {clearingLogs ? 'Clearing…' : 'Clear old logs'}
              </button>
              <button onClick={fetchSyncStatus} className="text-[11px] font-medium text-teal hover:text-teal-dark transition">
                Refresh
              </button>
            </div>
          </div>

          {/* SYNC_ENABLED=false banner */}
          {syncStatus && !syncStatus.syncEnabled && (
            <div className="mt-3 mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
              <svg className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" clipRule="evenodd"/>
              </svg>
              <div>
                <p className="text-xs font-semibold text-amber-800">Automated syncing is paused</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  <code className="bg-amber-100 px-1 rounded">SYNC_ENABLED=false</code> is set in your environment variables. Remove it or set it to <code className="bg-amber-100 px-1 rounded">true</code> to resume.
                </p>
              </div>
            </div>
          )}

          {/* Manual sync buttons — compact, outlined, with last-synced label */}
          <div className="mt-3 mb-4 flex flex-wrap gap-x-2 gap-y-3">
            {Object.entries(MANUAL_SYNC_ROUTES).map(([cronName]) => {
              const INT_KEY_MAP: Record<string, string> = {
                'sync-shopify':   'shopify',
                'sync-klaviyo':   'klaviyo',
                'sync-ads':       'meta',
                'sync-analytics': 'ga4',
                'sync-recharge':  'recharge',
                'sync-loyalty':   'loyaltylion',
                'sync-gsc':       'gsc',
                'sync-search':    'semrush',
              }
              const intKey = INT_KEY_MAP[cronName] ?? cronName
              const connected = syncStatus?.integrations[intKey] ?? false
              if (!connected) return null
              const lastAt = lastRunByCron[cronName]
              return (
                <div key={cronName} className="flex flex-col items-start gap-0.5">
                  <button
                    onClick={() => triggerManualSync(cronName)}
                    disabled={manualSyncing[cronName]}
                    className="inline-flex items-center gap-1 rounded-md border border-cream-3 bg-white px-2.5 py-1 text-[11px] font-medium text-ink-2 hover:bg-cream-2 hover:border-ink-3 disabled:opacity-50 transition"
                  >
                    {manualSyncing[cronName] ? (
                      <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-2 border-cream-3 border-t-teal" />
                    ) : (
                      <svg className="h-2.5 w-2.5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 0 0 0-1.5H3.989a.75.75 0 0 0-.75.75v4.242a.75.75 0 0 0 1.5 0v-2.43l.31.31a7 7 0 0 0 11.712-3.138.75.75 0 0 0-1.449-.39zm1.23-3.723a.75.75 0 0 0 .219-.53V2.929a.75.75 0 0 0-1.5 0V5.36l-.31-.31A7 7 0 0 0 3.239 8.188a.75.75 0 1 0 1.448.389A5.5 5.5 0 0 1 13.89 6.11l.311.31h-2.432a.75.75 0 0 0 0 1.5h4.243a.75.75 0 0 0 .53-.219z" clipRule="evenodd" />
                      </svg>
                    )}
                    {CRON_LABELS[cronName]}
                  </button>
                  {lastAt && (
                    <span className="pl-1 text-[10px] text-ink-3">{timeAgoShort(lastAt)}</span>
                  )}
                </div>
              )
            })}
          </div>

          {/* Recent runs table — fixed 400px height, sticky header, expandable failed rows */}
          <div className="rounded-2xl border border-cream-3 bg-white shadow-sm overflow-hidden">
            {!syncStatus ? (
              <div className="flex items-center justify-center py-10 text-xs text-ink-3">Loading sync history…</div>
            ) : syncStatus.recentRuns.length === 0 ? (
              <div className="flex items-center justify-center py-10 text-xs text-ink-3">No cron runs yet — crons will start after deployment to Vercel.</div>
            ) : (
              <div style={{ height: 400, overflowY: 'auto' }}>
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-10 bg-white">
                    <tr className="border-b border-cream-2">
                      <th className="w-0.5 p-0" />
                      <th className="px-4 py-2.5 text-left font-semibold text-ink-2">Job</th>
                      <th className="px-4 py-2.5 text-left font-semibold text-ink-2">Started</th>
                      <th className="px-4 py-2.5 text-left font-semibold text-ink-2">Duration</th>
                      <th className="px-4 py-2.5 text-left font-semibold text-ink-2">Records</th>
                      <th className="px-4 py-2.5 text-left font-semibold text-ink-2">Status</th>
                      <th className="w-8 px-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cream-2">
                    {syncStatus.recentRuns.map((run) => {
                      const isFailed = run.status === 'failed'
                      const isExpanded = expandedRunId === run.id
                      const durationMs = run.completed_at
                        ? new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()
                        : null
                      const durationStr = durationMs !== null
                        ? durationMs < 1000 ? '<1s' : durationMs < 60000 ? `${Math.round(durationMs / 1000)}s` : `${Math.round(durationMs / 60000)}m`
                        : '—'
                      return (
                        <Fragment key={run.id}>
                          <tr
                            onClick={isFailed ? () => setExpandedRunId(isExpanded ? null : run.id) : undefined}
                            className={`transition ${isFailed ? 'cursor-pointer bg-red-50/50 hover:bg-red-50/80' : 'hover:bg-cream-2/30'}`}
                          >
                            {/* Colored left indicator strip */}
                            <td className={`w-0.5 p-0 ${isFailed ? 'bg-red-400' : ''}`} />
                            <td className="px-4 py-2.5 font-medium text-ink">{CRON_LABELS[run.cron_name] ?? run.cron_name}</td>
                            <td className="px-4 py-2.5 font-data text-ink-2">{fmtTime(run.started_at)}</td>
                            <td className="px-4 py-2.5 font-data text-ink-3">{durationStr}</td>
                            <td className="px-4 py-2.5 font-data text-ink-2">{run.records_synced > 0 ? run.records_synced.toLocaleString() : '—'}</td>
                            <td className="px-4 py-2.5">
                              {run.status === 'completed' && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-teal-pale px-2 py-0.5 text-[10px] font-semibold text-teal-deep">
                                  ✓ Done
                                </span>
                              )}
                              {run.status === 'failed' && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                                  ✗ Failed
                                </span>
                              )}
                              {run.status === 'running' && (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
                                  Running
                                </span>
                              )}
                              {run.status === 'skipped' && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-cream-2 px-2 py-0.5 text-[10px] font-semibold text-ink-3">
                                  Skipped
                                </span>
                              )}
                            </td>
                            {/* Chevron for expandable failed rows */}
                            <td className="w-8 px-2 py-2.5 text-right">
                              {isFailed && (
                                <svg
                                  className={`inline-block h-3 w-3 text-red-400 transition-transform duration-150 ${isExpanded ? 'rotate-180' : ''}`}
                                  viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"
                                >
                                  <path d="M2 4l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </td>
                          </tr>
                          {/* Expandable error accordion */}
                          {isFailed && isExpanded && run.errors.length > 0 && (
                            <tr>
                              <td colSpan={7} className="bg-cream px-0 py-0">
                                <div className="border-l-2 border-red-400 ml-0.5 px-5 py-3 space-y-1.5">
                                  {run.errors.map((err, i) => (
                                    <p key={i} className="font-mono text-[11px] leading-relaxed text-red-700 break-words whitespace-pre-wrap">
                                      {cleanErrorMessage(err, run.cron_name)}
                                    </p>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        {/* ── Data Notes ─────────────────────────────────────────────────────── */}
        <DataNotes />
      </div>
    </>
  )
}

// ── Data Notes collapsible ─────────────────────────────────────────────────────

function DataNotes() {
  const [open, setOpen] = useState(false)

  const notes: { title: string; items: string[] }[] = [
    {
      title: 'Shopify',
      items: [
        'Orders and customers are synced incrementally every 2 hours. New orders may be up to 2 hours delayed.',
        'Order history is capped at 24 months. Revenue, AOV, repeat-purchase rates, and LTV figures only cover orders placed in the last 24 months — they are understated for customers with longer purchase histories.',
        'The "Total Customers" count reflects unique email addresses with at least one paid order.',
      ],
    },
    {
      title: 'Klaviyo',
      items: [
        'Campaign and flow metrics are synced every 6 hours and cover the last 12 months (Klaviyo API limit). Older campaigns are not included.',
        'Revenue attribution follows Klaviyo\'s default 5-day click / 1-day open attribution window.',
        'Unsubscribe cost is estimated as unsubscribes × average 12-month Shopify LTV — it may overstate the true cost if some unsubscribers would have churned anyway.',
      ],
    },
    {
      title: 'Meta Ads',
      items: [
        'Campaign data covers the last 90 days. Older campaigns are not shown.',
        'ROAS is calculated as purchase_value ÷ spend from Meta\'s own attribution. This differs from GA4-attributed revenue and should not be compared directly.',
        'When the Meta access token expires, syncs will fail silently. Reconnect via Integrations.',
      ],
    },
    {
      title: 'Google Ads',
      items: [
        'If Google Ads API developer token is pending approval, spend data will not be available and campaign revenue is sourced from GA4 instead.',
        'Google Ads and GA4 use separate OAuth scopes. Connecting one does not connect the other.',
        'Campaign data covers the last 90 days.',
      ],
    },
    {
      title: 'Google Analytics (GA4)',
      items: [
        'Sessions, conversions, and ecommerce metrics cover the last 90 days.',
        'Revenue reported by GA4 may differ from Shopify revenue due to attribution model differences (GA4 uses last-click by default).',
      ],
    },
    {
      title: 'Google Search Console',
      items: [
        'Keyword and page data covers the last 90 days (GSC API limit). Monthly click trend covers 12 months.',
        'GSC data is typically delayed 2–3 days. Very recent traffic will not appear.',
        'Only the top 50 keywords and top 100 pages by clicks are synced.',
      ],
    },
    {
      title: 'SEMrush',
      items: [
        'Organic keyword rankings are a current snapshot, not a time series. Position changes show movement vs. the previous snapshot.',
        'Keyword gap data shows terms where competitors rank but we do not — this is also a point-in-time snapshot.',
        'Each sync consumes SEMrush API units. If the account runs out of units, syncs are skipped automatically.',
      ],
    },
    {
      title: 'Recharge (Subscriptions)',
      items: [
        'Active subscriber count and MRR reflect current state at the time of last sync.',
        'Churn rate is calculated over a rolling 30-day window.',
        'Subscriber vs. non-subscriber LTV comparison uses Shopify order history (24-month cap) — understated for long-standing customers.',
      ],
    },
    {
      title: 'LoyaltyLion',
      items: [
        'The LoyaltyLion API returns approximately 20,000 recently-active members regardless of pagination settings. The actual enrolled count is 56,824+ — redemption rates and tier LTV figures are understated.',
        'Tier LTV is derived from Shopify order history (24-month cap), not from LoyaltyLion\'s own revenue tracking.',
        'Active redeemers and redemption rate cover the last 30 days.',
      ],
    },
    {
      title: 'Customer Intelligence',
      items: [
        'Customer profiles (segments, LTV tiers, engagement scores) are rebuilt nightly at 3am. Same-day order changes will not appear until the next rebuild.',
        'LTV segments (Diamond / Gold / Silver / Bronze) are based on 24-month Shopify revenue — understated for customers with longer histories.',
        'Segment counts (VIP / Active / At Risk / Lapsed / New) require at least one full profile build after migration 022 to be populated.',
      ],
    },
    {
      title: 'Product Intelligence',
      items: [
        'Product stats, affinity pairs, and purchase sequences are rebuilt daily at 5am and read all paid orders in Shopify history (up to 24 months).',
        'Affinity pairs require at least 5 co-purchases to appear. Purchase sequences require at least 3 occurrences.',
        'The "first_purchase_leads_to_second" metric currently duplicates repeat_purchase_rate — a more precise version is planned.',
      ],
    },
  ]

  return (
    <section className="mt-8 rounded-2xl border border-cream-3 bg-white shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-6 py-4 text-left hover:bg-cream/50 transition"
      >
        <span className="font-display text-sm font-semibold text-ink">Data Notes &amp; Known Limitations</span>
        <svg
          className={`h-4 w-4 text-ink-3 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 16 16"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="border-t border-cream-3 px-6 py-5 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {notes.map((section) => (
            <div key={section.title}>
              <p className="font-display text-xs font-semibold text-ink mb-2">{section.title}</p>
              <ul className="space-y-1.5">
                {section.items.map((item, i) => (
                  <li key={i} className="flex gap-2 text-[11px] text-ink-3 leading-relaxed">
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-ink-3" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
