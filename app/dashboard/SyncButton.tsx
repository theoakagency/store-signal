'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function SyncButton() {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'syncing' | 'done' | 'error'>('idle')
  const [summary, setSummary] = useState('')

  async function handleSync() {
    setState('syncing')
    setSummary('')
    try {
      const res = await fetch('/api/shopify/sync', { method: 'POST' })
      const data = await res.json()

      if (data.error) {
        setState('error')
        setSummary(data.error)
        return
      }

      const parts = []
      if (data.orders !== undefined) parts.push(`${data.orders} orders`)
      if (data.customers !== undefined) parts.push(`${data.customers} customers`)
      setSummary(parts.join(', '))
      setState('done')
      router.refresh()
    } catch {
      setState('error')
      setSummary('Network error')
    }
  }

  return (
    <div className="flex items-center gap-2">
      {summary && (
        <span className={`hidden sm:block text-xs font-data ${state === 'error' ? 'text-red-400' : 'text-teal'}`}>
          {state === 'done' ? `✓ ${summary}` : summary}
        </span>
      )}
      <button
        onClick={handleSync}
        disabled={state === 'syncing'}
        className="flex items-center gap-1.5 rounded-lg border border-cream-3 bg-white px-2.5 py-1.5 text-xs font-medium text-ink-2 shadow-sm hover:bg-cream disabled:opacity-50 disabled:cursor-not-allowed transition"
      >
        {state === 'syncing' ? (
          <>
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-cream-3 border-t-teal" />
            Syncing…
          </>
        ) : (
          <>
            <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M13.5 2.5A6.5 6.5 0 1 1 7 1M13.5 2.5V6M13.5 2.5H10" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Sync
          </>
        )}
      </button>
    </div>
  )
}
