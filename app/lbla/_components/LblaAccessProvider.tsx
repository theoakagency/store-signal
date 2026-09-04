'use client'

import { createContext, useContext } from 'react'
import type { LblaAccess } from '@/lib/lblaAuth'

const LblaAccessContext = createContext<LblaAccess | null>(null)

export function LblaAccessProvider({
  value,
  children,
}: {
  value: LblaAccess
  children: React.ReactNode
}) {
  return <LblaAccessContext.Provider value={value}>{children}</LblaAccessContext.Provider>
}

/** Grants for the signed-in user. Client components use this to hide links to
 *  tools the user cannot open — enforcement still lives in proxy.ts. */
export function useLblaAccess(): LblaAccess {
  const ctx = useContext(LblaAccessContext)
  if (!ctx) throw new Error('useLblaAccess must be used inside LblaAccessProvider')
  return ctx
}

export function useHasTool(toolKey: string): boolean {
  const access = useLblaAccess()
  return access.isAdmin || access.tools.includes(toolKey)
}
