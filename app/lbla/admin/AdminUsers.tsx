'use client'

import { useState, useEffect, useCallback } from 'react'
import { LBLA_TOOLS } from '@/lib/lblaTools'
import type { AdminUserRow } from '@/app/api/lbla/admin/route'

export default function AdminUsers({ callerId }: { callerId: string }) {
  const [users, setUsers] = useState<AdminUserRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/lbla/admin')
      const data = await res.json()
      if (!res.ok || data.error) {
        setError(data.error ?? 'Could not load users')
        return
      }
      setUsers(data.users as AdminUserRow[])
    } catch {
      setError('Network error loading users')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function save(userId: string, patch: { isAdmin?: boolean; tools?: string[] }) {
    setSavingId(userId)
    setError(null)
    try {
      const res = await fetch('/api/lbla/admin', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, ...patch }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setError(data.error ?? 'Could not save')
        return
      }
      setUsers((prev) => prev.map((u) => (
        u.userId === userId
          ? { ...u, isAdmin: data.user.isAdmin, tools: data.user.tools, hasMembership: true }
          : u
      )))
    } catch {
      setError('Network error saving change')
    } finally {
      setSavingId(null)
    }
  }

  function toggleTool(user: AdminUserRow, key: string) {
    const next = user.tools.includes(key)
      ? user.tools.filter((t) => t !== key)
      : [...user.tools, key]
    void save(user.userId, { tools: next })
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <h1 className="font-display text-2xl font-semibold text-ink">User Access</h1>
        <p className="mt-1 text-sm text-ink-3">
          Admins reach everything, including the dashboard. Everyone else sees only the tools ticked here.
          Accounts are created in the Supabase dashboard; they appear below once they exist.
        </p>
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl border border-cream-3 bg-white" />
          ))}
        </div>
      ) : users.length === 0 ? (
        <p className="rounded-2xl border border-cream-3 bg-white px-6 py-10 text-center text-sm text-ink-3">
          No users found.
        </p>
      ) : (
        <div className="space-y-3">
          {users.map((user) => {
            const isSelf = user.userId === callerId
            const busy = savingId === user.userId
            return (
              <div
                key={user.userId}
                className={`rounded-2xl border bg-white p-5 shadow-sm transition ${
                  busy ? 'border-teal/40 opacity-70' : 'border-cream-3'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">
                      {user.email}
                      {isSelf && <span className="ml-2 text-[11px] font-normal text-ink-3">(you)</span>}
                    </p>
                    {!user.hasMembership && (
                      <p className="mt-1 text-[11px] text-amber-600">
                        No access record yet. Ticking anything below creates one.
                      </p>
                    )}
                  </div>

                  <label className={`flex items-center gap-2 text-xs font-medium ${
                    isSelf ? 'text-ink-3' : 'text-ink-2 cursor-pointer'
                  }`}>
                    <input
                      type="checkbox"
                      checked={user.isAdmin}
                      // Self-demotion is blocked here and again server-side, so
                      // the last admin cannot lock themselves out.
                      disabled={busy || (isSelf && user.isAdmin)}
                      onChange={(e) => void save(user.userId, { isAdmin: e.target.checked })}
                      className="h-4 w-4 accent-teal disabled:opacity-40"
                    />
                    Admin
                    {isSelf && user.isAdmin && (
                      <span className="text-[10px] font-normal text-ink-3">(cannot remove your own)</span>
                    )}
                  </label>
                </div>

                {user.isAdmin ? (
                  <p className="mt-3 border-t border-cream-2 pt-3 text-xs text-ink-3">
                    Admin — has access to every tool and the dashboard. Per-tool grants do not apply.
                  </p>
                ) : (
                  <div className="mt-3 border-t border-cream-2 pt-3">
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                      {LBLA_TOOLS.map((tool) => (
                        <label
                          key={tool.key}
                          className="flex items-center gap-1.5 text-xs text-ink-2 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={user.tools.includes(tool.key)}
                            disabled={busy}
                            onChange={() => toggleTool(user, tool.key)}
                            className="h-3.5 w-3.5 accent-teal disabled:opacity-40"
                          />
                          {tool.label}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
