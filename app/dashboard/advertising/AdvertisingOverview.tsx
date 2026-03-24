'use client'

import { useState } from 'react'
import Link from 'next/link'

interface BaseCampaign {
  id: string
  name: string
  spend: number
  roas: number
  status: string
}

interface MetaCampaign extends BaseCampaign {
  purchases: number
  purchase_value: number
}

interface GoogleCampaign extends BaseCampaign {
  conversions: number
  conversion_value: number
  data_source?: string | null
}

interface Props {
  metaConnected: boolean
  googleConnected: boolean
  metaCampaigns: MetaCampaign[]
  googleCampaigns: GoogleCampaign[]
  metaMetrics: Record<string, number>
  googleMetrics: Record<string, number>
}

function fmt(n: number, currency = true) {
  if (currency) return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n)
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-cream-3 bg-white px-5 py-5 shadow-sm">
      <p className="font-data text-xs uppercase tracking-wider text-ink-3">{label}</p>
      <p className="mt-2 font-display text-3xl font-semibold text-ink">{value}</p>
      {sub && <p className="mt-1 text-xs text-ink-3">{sub}</p>}
    </div>
  )
}

function PlatformCard({
  name,
  logo,
  connected,
  href,
  spend,
  roas,
  costPerAction,
  actions,
  actionLabel,
  belowOneCount,
  isGa4,
}: {
  name: string
  logo: React.ReactNode
  connected: boolean
  href: string
  spend: number
  roas: number
  costPerAction: number
  actions: number
  actionLabel: string
  belowOneCount: number
  isGa4?: boolean
}) {
  if (!connected) {
    return (
      <div className="rounded-2xl border border-dashed border-cream-3 bg-cream px-6 py-8 text-center">
        <div className="mb-3 flex justify-center">{logo}</div>
        <p className="text-sm font-medium text-ink-2">{name} not connected</p>
        <Link href="/dashboard/integrations" className="mt-3 inline-flex text-xs text-teal hover:text-teal-dark font-medium transition">
          Connect in Integrations →
        </Link>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-cream-3 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          {logo}
          <h3 className="font-display text-sm font-semibold text-ink">{name}</h3>
        </div>
        <Link href={href} className="text-xs text-teal hover:text-teal-dark font-medium transition">
          Full report →
        </Link>
      </div>
      {isGa4 && (
        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
          Spend data pending Google Ads API approval — conversion revenue sourced from GA4
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-cream border border-cream-2 px-4 py-3">
          <p className="font-data text-[10px] uppercase tracking-wider text-ink-3">Spend (90d)</p>
          <p className="mt-1 font-data text-base font-semibold text-ink">{isGa4 ? '—' : fmt(spend)}</p>
        </div>
        <div className="rounded-xl bg-cream border border-cream-2 px-4 py-3">
          <p className="font-data text-[10px] uppercase tracking-wider text-ink-3">ROAS (90d)</p>
          <p className={`mt-1 font-data text-base font-semibold ${isGa4 ? 'text-ink-3' : roas >= 2 ? 'text-teal-deep' : roas >= 1 ? 'text-yellow-700' : 'text-red-500'}`}>
            {isGa4 ? '—' : `${fmt(roas, false)}×`}
          </p>
        </div>
        <div className="rounded-xl bg-cream border border-cream-2 px-4 py-3">
          <p className="font-data text-[10px] uppercase tracking-wider text-ink-3">Cost / {actionLabel}</p>
          <p className="mt-1 font-data text-base font-semibold text-ink">{isGa4 ? '—' : costPerAction > 0 ? fmt(costPerAction) : '—'}</p>
        </div>
        <div className="rounded-xl bg-cream border border-cream-2 px-4 py-3">
          <p className="font-data text-[10px] uppercase tracking-wider text-ink-3">{actionLabel}s (90d)</p>
          <p className="mt-1 font-data text-base font-semibold text-ink">{actions.toFixed(0)}</p>
        </div>
      </div>
      {belowOneCount > 0 && (
        <div className="mt-3 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-700">
          ⚠ {belowOneCount} campaign{belowOneCount !== 1 ? 's' : ''} below 1× ROAS — review in full report
        </div>
      )}
    </div>
  )
}

export default function AdvertisingOverview({
  metaConnected,
  googleConnected,
  metaCampaigns,
  googleCampaigns,
  metaMetrics,
  googleMetrics,
}: Props) {
  const [aiInsight, setAiInsight] = useState<string | null>(null)
  const [loadingAi, setLoadingAi] = useState(false)

  // Compute Meta metrics from 90d campaign data directly (avoids 30d cache showing $0)
  const metaSpend90 = metaCampaigns.reduce((s, c) => s + c.spend, 0)
  const metaPurchaseValue90 = metaCampaigns.reduce((s, c) => s + c.purchase_value, 0)
  const metaRoas90 = metaSpend90 > 0 ? metaPurchaseValue90 / metaSpend90 : 0
  const metaPurchases90 = metaCampaigns.reduce((s, c) => s + c.purchases, 0)
  const metaCpp90 = metaPurchases90 > 0 ? metaSpend90 / metaPurchases90 : 0
  const metaBelowOne = metaCampaigns.filter((c) => c.spend > 0 && c.roas < 1).length

  // Detect GA4 fallback (spend is $0 when data sourced from GA4)
  const googleIsGa4 = googleCampaigns.some((c) => c.data_source === 'ga4')

  // Compute Google metrics from 90d campaign data directly
  const googleSpend90 = googleCampaigns.reduce((s, c) => s + c.spend, 0)
  const googleConversions90 = googleCampaigns.reduce((s, c) => s + c.conversions, 0)
  // Use conversion_value directly (works for both real Google Ads and GA4 fallback)
  const googlePurchaseValue90 = googleCampaigns.reduce((s, c) => s + (c.conversion_value ?? 0), 0)
  const googleRoas90 = googleSpend90 > 0 ? googlePurchaseValue90 / googleSpend90 : 0
  const googleCpp90 = googleConversions90 > 0 ? googleSpend90 / googleConversions90 : 0
  const googleBelowOne = googleCampaigns.filter((c) => c.spend > 0 && c.roas < 1).length

  // For blended ROAS, use Meta spend as denominator when Google is GA4 (no spend data)
  const totalSpend = metaSpend90 + googleSpend90
  const totalBelowOne = metaBelowOne + googleBelowOne
  const blendedRoasDenominator = googleIsGa4 ? metaSpend90 : totalSpend
  const blendedRoas = blendedRoasDenominator > 0
    ? (metaPurchaseValue90 + googlePurchaseValue90) / blendedRoasDenominator
    : 0

  const anyConnected = metaConnected || googleConnected

  async function generateInsight() {
    setLoadingAi(true)
    try {
      const res = await fetch('/api/insights/advertising', { method: 'POST' })
      const data = await res.json() as { insight?: string; error?: string }
      setAiInsight(data.insight ?? data.error ?? 'Unable to generate insight')
    } catch {
      setAiInsight('Network error — try again')
    } finally {
      setLoadingAi(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Advertising Overview</h1>
        <p className="text-sm text-ink-3 mt-0.5">Combined Meta + Google Ads performance</p>
      </div>

      {!anyConnected ? (
        <div className="rounded-2xl border border-dashed border-cream-3 bg-cream px-8 py-12 text-center">
          <p className="text-sm font-medium text-ink-2">No ad platforms connected yet</p>
          <p className="mt-1 text-xs text-ink-3">Connect Meta Ads or Google Ads to see unified advertising performance.</p>
          <Link href="/dashboard/integrations" className="mt-4 inline-flex items-center rounded-lg bg-charcoal px-4 py-2.5 text-sm font-semibold text-cream hover:bg-charcoal/90 transition">
            Go to Integrations →
          </Link>
        </div>
      ) : (
        <>
          {/* Combined KPIs */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <MetricCard label="Total Spend (90d)" value={googleIsGa4 ? fmt(metaSpend90) : fmt(totalSpend)} sub={googleIsGa4 ? 'Meta only — Google spend pending' : 'Meta + Google combined'} />
            <MetricCard label="Blended ROAS" value={`${fmt(blendedRoas, false)}×`} sub={googleIsGa4 ? 'Meta spend + GA4 Google revenue' : 'weighted by spend'} />
            <MetricCard label="Campaigns Flagged" value={totalBelowOne.toString()} sub="ROAS below 1× — losing money" />
            <MetricCard label="Platforms Active" value={[metaConnected, googleConnected].filter(Boolean).length.toString()} sub="connected ad platforms" />
          </div>

          {/* Platform comparison */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <PlatformCard
              name="Meta Ads"
              logo={
                <div className="h-6 w-6 rounded bg-[#1877F2] flex items-center justify-center">
                  <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                </div>
              }
              connected={metaConnected}
              href="/dashboard/meta"
              spend={metaSpend90}
              roas={metaRoas90}
              costPerAction={metaCpp90}
              actions={metaPurchases90}
              actionLabel="Purchase"
              belowOneCount={metaBelowOne}
            />
            <PlatformCard
              name="Google Ads"
              logo={
                <div className="h-6 w-6 rounded bg-[#4285F4] flex items-center justify-center">
                  <svg className="h-4 w-4 text-white" viewBox="0 0 48 48" fill="none">
                    <path d="M24 4L4 44h9.5l2.5-7h16l2.5 7H44L24 4z" fill="white"/>
                    <path d="M24 17l5 14H19l5-14z" fill="#4285F4"/>
                  </svg>
                </div>
              }
              connected={googleConnected}
              href="/dashboard/google-ads"
              spend={googleSpend90}
              roas={googleRoas90}
              costPerAction={googleCpp90}
              actions={googleConversions90}
              actionLabel="Conversion"
              belowOneCount={googleBelowOne}
              isGa4={googleIsGa4}
            />
          </div>

          {/* Which platform is winning */}
          {metaConnected && googleConnected && metaSpend90 > 0 && googleSpend90 > 0 && (
            <section className="rounded-2xl border border-cream-3 bg-white p-6 shadow-sm">
              <h2 className="font-display text-base font-semibold text-ink">Platform ROI Comparison</h2>
              <div className="mt-4 space-y-3">
                {[
                  { label: 'Meta Ads ROAS', value: metaRoas90, max: Math.max(metaRoas90, googleRoas90, 0.1), color: '#1877F2' },
                  { label: 'Google Ads ROAS', value: googleRoas90, max: Math.max(metaRoas90, googleRoas90, 0.1), color: '#4285F4' },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-3">
                    <div className="w-32 shrink-0 text-xs text-ink-2">{item.label}</div>
                    <div className="flex-1 h-5 bg-cream-2 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${(item.value / item.max) * 100}%`, backgroundColor: item.color }} />
                    </div>
                    <div className="w-12 text-right font-data text-sm font-semibold text-ink shrink-0">{fmt(item.value, false)}×</div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-ink-3">
                {metaRoas90 > googleRoas90
                  ? `Meta Ads is delivering ${((metaRoas90 / Math.max(googleRoas90, 0.01) - 1) * 100).toFixed(0)}% better ROAS than Google Ads — consider shifting budget toward Meta.`
                  : googleRoas90 > metaRoas90
                  ? `Google Ads is delivering ${((googleRoas90 / Math.max(metaRoas90, 0.01) - 1) * 100).toFixed(0)}% better ROAS than Meta Ads — consider shifting budget toward Google.`
                  : 'Both platforms are delivering similar ROAS.'}
              </p>
            </section>
          )}

          {/* AI Summary */}
          <section className="rounded-2xl border border-cream-3 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-base font-semibold text-ink">AI Budget Recommendation</h2>
                <p className="text-xs text-ink-3 mt-0.5">Claude analyzes combined ad performance and suggests budget allocation</p>
              </div>
              <button
                onClick={generateInsight}
                disabled={loadingAi}
                className="inline-flex items-center gap-1.5 rounded-lg border border-cream-3 px-3 py-1.5 text-xs font-medium text-ink-2 hover:bg-cream disabled:opacity-50 transition"
              >
                {loadingAi ? (
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-cream-3 border-t-teal" />
                ) : (
                  <svg className="h-3 w-3" viewBox="0 0 12 12" fill="currentColor"><path d="M6 1l1.2 3.8H11l-3 2.2 1.2 3.8L6 8.5l-3.2 2.3L4 7 1 4.8h3.8L6 1z"/></svg>
                )}
                {loadingAi ? 'Analyzing…' : 'Generate Insight'}
              </button>
            </div>

            {aiInsight ? (
              <div className="mt-4 rounded-xl bg-charcoal/5 border border-cream-2 px-5 py-4">
                <p className="text-sm text-ink leading-relaxed">{aiInsight}</p>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-cream-3 bg-cream px-5 py-6 text-center">
                <p className="text-sm text-ink-3">Click &quot;Generate Insight&quot; to get a budget allocation recommendation based on current performance.</p>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
