'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────────────────

type MatchType = 'exact' | 'prefix'

export interface AllowedDiscountCode {
  id: string
  code_pattern: string
  match_type: MatchType
  kit_eligible: boolean
  category: string | null
  notes: string | null
  created_at: string
}

const CATEGORY_OPTIONS = ['ambassador', 'welcome', 'comeback', 'affiliate', 'marketing', 'promo'] as const

const CATEGORY_BADGE_CLS: Record<string, string> = {
  ambassador: 'bg-teal/10 text-teal-deep',
  welcome:    'bg-blue-50 text-blue-600',
  comeback:   'bg-amber-50 text-amber-700',
  affiliate:  'bg-purple-50 text-purple-600',
  marketing:  'bg-pink-50 text-pink-600',
  promo:      'bg-orange-50 text-orange-600',
}

function categoryBadgeCls(category: string | null): string {
  return category ? (CATEGORY_BADGE_CLS[category] ?? 'bg-cream-2 text-ink-2') : 'bg-cream-2 text-ink-3'
}

// ── Shared field styles ───────────────────────────────────────────────────────

const inputCls = 'w-full rounded-lg border border-cream-3 bg-white px-2.5 py-1.5 text-sm text-ink focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal transition'

// ── Row form (shared by inline edit + add) ───────────────────────────────────

interface CodeFormValues {
  code_pattern: string
  match_type: MatchType
  kit_eligible: boolean
  category: string
  notes: string
}

function CodeFields({
  values,
  onChange,
}: {
  values: CodeFormValues
  onChange: (values: CodeFormValues) => void
}) {
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      <div>
        <label className="block text-[11px] font-medium text-ink-2 mb-1">Code pattern *</label>
        <input
          type="text"
          value={values.code_pattern}
          onChange={(e) => onChange({ ...values, code_pattern: e.target.value })}
          placeholder="e.g. DT or WELCOME15"
          className={inputCls + ' font-data uppercase'}
        />
      </div>
      <div>
        <label className="block text-[11px] font-medium text-ink-2 mb-1">Match type *</label>
        <select
          value={values.match_type}
          onChange={(e) => onChange({ ...values, match_type: e.target.value as MatchType })}
          className={inputCls}
        >
          <option value="exact">Exact match</option>
          <option value="prefix">Prefix (starts with)</option>
        </select>
      </div>
      <div>
        <label className="block text-[11px] font-medium text-ink-2 mb-1">Category</label>
        <select
          value={values.category}
          onChange={(e) => onChange({ ...values, category: e.target.value })}
          className={inputCls}
        >
          <option value="">—</option>
          {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="flex items-end pb-1.5">
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <input
            type="checkbox"
            checked={values.kit_eligible}
            onChange={(e) => onChange({ ...values, kit_eligible: e.target.checked })}
            className="h-4 w-4 rounded border-cream-3 text-teal focus:ring-teal"
          />
          Applies to kit SKUs (MKLBKLLKT / MKLBKLLKTGWP)
        </label>
      </div>
      <div className="sm:col-span-2">
        <label className="block text-[11px] font-medium text-ink-2 mb-1">Notes</label>
        <input
          type="text"
          value={values.notes}
          onChange={(e) => onChange({ ...values, notes: e.target.value })}
          placeholder="Optional context for this code"
          className={inputCls}
        />
      </div>
    </div>
  )
}

// ── Table row ─────────────────────────────────────────────────────────────────

function CodeRow({
  code,
  onEdit,
  onDelete,
}: {
  code: AllowedDiscountCode
  onEdit: (id: string, values: CodeFormValues) => Promise<string | null>
  onDelete: (id: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [values, setValues] = useState<CodeFormValues>({
    code_pattern: code.code_pattern,
    match_type: code.match_type,
    kit_eligible: code.kit_eligible,
    category: code.category ?? '',
    notes: code.notes ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  function startEdit() {
    setValues({
      code_pattern: code.code_pattern,
      match_type: code.match_type,
      kit_eligible: code.kit_eligible,
      category: code.category ?? '',
      notes: code.notes ?? '',
    })
    setError(null)
    setEditing(true)
  }

  async function saveEdit() {
    if (!values.code_pattern.trim()) { setError('Code pattern is required'); return }
    setSaving(true)
    setError(null)
    const err = await onEdit(code.id, values)
    setSaving(false)
    if (err) { setError(err); return }
    setEditing(false)
  }

  if (editing) {
    return (
      <tr className="border-t border-cream-2 bg-cream/40">
        <td colSpan={6} className="px-4 py-3.5">
          <div className="space-y-2.5">
            <CodeFields values={values} onChange={setValues} />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={saveEdit}
                disabled={saving}
                className="rounded-md bg-teal px-3 py-1 text-xs font-semibold text-white hover:bg-teal-dark disabled:opacity-50 transition"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-md border border-cream-3 px-3 py-1 text-xs text-ink-3 hover:text-ink transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr className="border-t border-cream-2">
      <td className="px-4 py-3 font-data text-xs text-ink whitespace-nowrap">{code.code_pattern}</td>
      <td className="px-4 py-3 text-xs text-ink-2 whitespace-nowrap">{code.match_type === 'prefix' ? 'Prefix' : 'Exact'}</td>
      <td className="px-4 py-3 whitespace-nowrap">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${code.kit_eligible ? 'bg-teal/10 text-teal-deep' : 'bg-cream-2 text-ink-3'}`}>
          {code.kit_eligible ? 'Yes' : 'No'}
        </span>
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        {code.category ? (
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${categoryBadgeCls(code.category)}`}>
            {code.category}
          </span>
        ) : <span className="text-xs text-ink-3">—</span>}
      </td>
      <td className="px-4 py-3 text-xs text-ink-3 max-w-xs truncate" title={code.notes ?? ''}>{code.notes ?? '—'}</td>
      <td className="px-4 py-3 whitespace-nowrap text-right">
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={startEdit} className="text-xs font-medium text-teal-deep hover:text-teal transition">Edit</button>
          {confirmDelete ? (
            <span className="flex items-center gap-1.5">
              <span className="text-xs text-red-500 font-medium">Delete?</span>
              <button type="button" onClick={() => onDelete(code.id)} className="rounded-md bg-red-500 px-2 py-0.5 text-xs font-semibold text-white hover:bg-red-600 transition">Yes</button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="rounded-md border border-cream-3 px-2 py-0.5 text-xs text-ink-3 hover:text-ink transition">No</button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className="text-xs font-medium text-ink-3 hover:text-red-500 transition">Delete</button>
          )}
        </div>
      </td>
    </tr>
  )
}

// ── Add form ──────────────────────────────────────────────────────────────────

const EMPTY_FORM: CodeFormValues = { code_pattern: '', match_type: 'exact', kit_eligible: false, category: '', notes: '' }

function AddCodeForm({ onAdd }: { onAdd: (values: CodeFormValues) => Promise<string | null> }) {
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState<CodeFormValues>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const firstInputRef = useRef<HTMLDivElement>(null)

  function openForm() {
    setOpen(true)
    setTimeout(() => firstInputRef.current?.querySelector('input')?.focus(), 0)
  }

  async function handleAdd() {
    if (!values.code_pattern.trim()) { setError('Code pattern is required'); return }
    setSaving(true)
    setError(null)
    const err = await onAdd(values)
    setSaving(false)
    if (err) { setError(err); return }
    setValues(EMPTY_FORM)
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={openForm}
        className="flex items-center gap-1.5 px-4 py-3 text-xs font-medium text-ink-3 hover:text-teal transition"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M8 3v10M3 8h10" strokeLinecap="round" />
        </svg>
        Add code
      </button>
    )
  }

  return (
    <div className="px-4 py-3.5 border-t border-cream-2 space-y-2.5 bg-cream/40" ref={firstInputRef}>
      <CodeFields values={values} onChange={setValues} />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleAdd}
          disabled={saving}
          className="rounded-md bg-teal px-3 py-1 text-xs font-semibold text-white hover:bg-teal-dark disabled:opacity-50 transition"
        >
          {saving ? 'Saving…' : 'Add code'}
        </button>
        <button
          type="button"
          onClick={() => { setValues(EMPTY_FORM); setOpen(false); setError(null) }}
          className="rounded-md border border-cream-3 px-3 py-1 text-xs text-ink-3 hover:text-ink transition"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DiscountCodesSettings({ codes: initialCodes }: { codes: AllowedDiscountCode[] }) {
  const [codes, setCodes] = useState<AllowedDiscountCode[]>(initialCodes)

  async function handleAdd(values: CodeFormValues): Promise<string | null> {
    const res = await fetch('/api/lbla/discount-codes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    })
    const data = await res.json()
    if (!res.ok) return data.error ?? 'Failed to add code'
    setCodes((prev) => [...prev, data.code])
    return null
  }

  async function handleEdit(id: string, values: CodeFormValues): Promise<string | null> {
    const res = await fetch(`/api/lbla/discount-codes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    })
    const data = await res.json()
    if (!res.ok) return data.error ?? 'Failed to update code'
    setCodes((prev) => prev.map((c) => (c.id === id ? data.code : c)))
    return null
  }

  async function handleDelete(id: string) {
    const removed = codes.find((c) => c.id === id)
    setCodes((prev) => prev.filter((c) => c.id !== id))
    const res = await fetch(`/api/lbla/discount-codes/${id}`, { method: 'DELETE' })
    if (!res.ok && removed) {
      setCodes((prev) => [...prev, removed].sort((a, b) => a.created_at.localeCompare(b.created_at)))
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">

      {/* Header */}
      <div className="mb-6">
        <Link href="/lbla" className="flex items-center gap-1.5 text-xs font-medium text-ink-3 hover:text-teal transition mb-3 w-fit">
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M10 3L5 8l5 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Team Tools
        </Link>
        <h1 className="font-display text-2xl font-semibold text-ink">Allowed Discount Codes</h1>
        <p className="mt-1 text-sm text-ink-3">
          Codes on this list count toward net sales in cost/margin reports (e.g. the KLL royalty report). Any code not listed here is treated as a $0 discount, even if one was applied on the order.
        </p>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-cream-3 bg-white shadow-sm">
        {codes.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-ink-3">No codes added yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-cream">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-3">Code Pattern</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-3">Match</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-3">Kit Eligible</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-3">Category</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-3">Notes</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-ink-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {codes.map((code) => (
                  <CodeRow key={code.id} code={code} onEdit={handleEdit} onDelete={handleDelete} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <AddCodeForm onAdd={handleAdd} />
      </div>
    </div>
  )
}
