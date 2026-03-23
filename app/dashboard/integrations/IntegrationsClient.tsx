'use client'

import { useState } from 'react'

interface Props {
  shopifyConnected: boolean
  shopifyDomain: string | null
  lastSyncedAt: string | null
}

function toast(msg: string) {
  // Simple DOM toast — no library needed
  const el = document.createElement('div')
  el.textContent = msg
  el.style.cssText = `
    position:fixed;bottom:24px;right:24px;z-index:9999;
    background:#1C2B2A;color:#FAF8F4;
    padding:10px 16px;border-radius:10px;
    font-size:13px;font-family:Jost,sans-serif;
    box-shadow:0 4px 24px rgba(0,0,0,0.18);
    animation:slideUp .25s ease;
  `
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 3000)
}

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

export default function IntegrationsClient({ shopifyConnected, shopifyDomain, lastSyncedAt }: Props) {
  const [showInstall, setShowInstall] = useState(false)

  const lastSync = lastSyncedAt
    ? new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(lastSyncedAt))
    : null

  return (
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
            meta={
              shopifyConnected
                ? `${shopifyDomain}${lastSync ? ` · Last sync: ${lastSync}` : ''}`
                : 'Not connected'
            }
            action={
              shopifyConnected ? (
                <a
                  href="/api/shopify/install"
                  className="text-xs text-teal hover:text-teal-dark font-medium transition"
                >
                  Re-authorize
                </a>
              ) : (
                <a
                  href="/api/shopify/install"
                  className="inline-flex items-center rounded-lg bg-teal px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-dark transition"
                >
                  Connect Shopify
                </a>
              )
            }
          />

          <IntegrationCard
            name="WooCommerce"
            description="Connect your WooCommerce store to sync orders and customer data for unified analytics."
            logo={
              <svg viewBox="0 0 100 100" className="h-6 w-6" fill="#7f54b3">
                <circle cx="50" cy="50" r="50" fill="#7f54b3" />
                <path d="M16 36.4a5.6 5.6 0 0 1 4.9-3.3h59.6a5.4 5.4 0 0 1 4.9 3.3 5.9 5.9 0 0 1-.2 5.3L72.6 74a5.6 5.6 0 0 1-4.9 3H33.3a5.5 5.5 0 0 1-4.9-3L16.2 41.7a5.9 5.9 0 0 1-.2-5.3zm26.8 27.7 5.9-16.3 7.3 14.4a2.4 2.4 0 0 0 4.3-.3l8-22.8a2 2 0 0 0-3.8-1.3l-5.8 16.7-7.1-14.1a2.4 2.4 0 0 0-4.4.2l-8 22.8a2 2 0 0 0 3.6 1.7z" fill="white" />
              </svg>
            }
            status="coming_soon"
          />
        </div>
      </section>

      {/* Email & Marketing */}
      <section>
        <h2 className="font-display text-base font-semibold text-ink mb-3">Email & Marketing</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { name: 'Klaviyo', desc: 'Sync customer segments and trigger flows based on purchase behavior.' },
            { name: 'Mailchimp', desc: 'Push customer lists and revenue data to Mailchimp audiences.' },
            { name: 'Postscript', desc: 'Connect SMS campaigns to order and customer data.' },
          ].map((i) => (
            <IntegrationCard
              key={i.name}
              name={i.name}
              description={i.desc}
              logo={
                <div className="text-xs font-bold text-ink-3">{i.name[0]}</div>
              }
              status="coming_soon"
              action={
                <button
                  onClick={() => toast(`${i.name} integration coming soon — join the waitlist`)}
                  className="text-xs text-teal hover:text-teal-dark font-medium transition"
                >
                  Join waitlist
                </button>
              }
            />
          ))}
        </div>
      </section>

      {/* Analytics */}
      <section>
        <h2 className="font-display text-base font-semibold text-ink mb-3">Analytics</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { name: 'Google Analytics 4', desc: 'Cross-reference session data with order revenue.' },
            { name: 'Triple Whale', desc: 'Import ROAS and attributed revenue from paid channels.' },
            { name: 'Northbeam', desc: 'Multi-touch attribution data alongside CRM analytics.' },
          ].map((i) => (
            <IntegrationCard
              key={i.name}
              name={i.name}
              description={i.desc}
              logo={<div className="text-xs font-bold text-ink-3">{i.name[0]}</div>}
              status="coming_soon"
              action={
                <button
                  onClick={() => toast(`${i.name} integration coming soon`)}
                  className="text-xs text-teal hover:text-teal-dark font-medium transition"
                >
                  Join waitlist
                </button>
              }
            />
          ))}
        </div>
      </section>

      {/* Team & Collaboration */}
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
                <button
                  onClick={() => toast(`${i.name} integration coming soon`)}
                  className="text-xs text-teal hover:text-teal-dark font-medium transition"
                >
                  Join waitlist
                </button>
              }
            />
          ))}
        </div>
      </section>
    </div>
  )
}
