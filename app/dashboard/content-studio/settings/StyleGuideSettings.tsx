'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────────────────

type Category = 'avoid' | 'enforce' | 'vocabulary' | 'examples'

export interface StyleGuideRule {
  id: string
  category: Category
  rule: string
  active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

// ── Category config ───────────────────────────────────────────────────────────

const CATEGORIES: {
  id: Category
  label: string
  description: string
  accent: string
  badgeCls: string
}[] = [
  {
    id: 'avoid',
    label: 'Avoid',
    description: 'Things Claude should never do',
    accent: 'border-l-4 border-red-400',
    badgeCls: 'bg-red-50 text-red-600',
  },
  {
    id: 'enforce',
    label: 'Enforce',
    description: 'Rules Claude must always follow',
    accent: 'border-l-4 border-teal',
    badgeCls: 'bg-teal/10 text-teal-deep',
  },
  {
    id: 'vocabulary',
    label: 'Vocabulary',
    description: 'Specific word and phrase choices',
    accent: 'border-l-4 border-blue-400',
    badgeCls: 'bg-blue-50 text-blue-600',
  },
  {
    id: 'examples',
    label: 'Examples',
    description: 'Sample copy Claude should emulate',
    accent: 'border-l-4 border-amber-400',
    badgeCls: 'bg-amber-50 text-amber-600',
  },
]

// ── Toggle switch ─────────────────────────────────────────────────────────────

function Toggle({ active, onChange }: { active: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!active)}
      aria-pressed={active}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
        active ? 'bg-teal' : 'bg-cream-3'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
          active ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

// ── Rule row ──────────────────────────────────────────────────────────────────

function RuleRow({
  rule,
  onToggle,
  onEdit,
  onDelete,
}: {
  rule: StyleGuideRule
  onToggle: (id: string, active: boolean) => Promise<void>
  onEdit: (id: string, text: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(rule.rule)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  function startEdit() {
    setEditText(rule.rule)
    setEditing(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  async function saveEdit() {
    if (editText.trim() === rule.rule) { setEditing(false); return }
    setSaving(true)
    await onEdit(rule.id, editText.trim())
    setSaving(false)
    setEditing(false)
  }

  function cancelEdit() {
    setEditText(rule.rule)
    setEditing(false)
  }

  return (
    <div className={`flex items-start gap-3 px-4 py-3 transition-colors ${rule.active ? '' : 'opacity-50'}`}>
      {/* Toggle */}
      <div className="mt-0.5 shrink-0">
        <Toggle active={rule.active} onChange={(v) => onToggle(rule.id, v)} />
      </div>

      {/* Rule text / inline editor */}
      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="space-y-2">
            <textarea
              ref={inputRef}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              maxLength={500}
              rows={2}
              className="w-full resize-none rounded-lg border border-teal px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-teal"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={saveEdit}
                disabled={saving || editText.trim().length === 0}
                className="rounded-md bg-teal px-3 py-1 text-xs font-semibold text-white hover:bg-teal-dark disabled:opacity-50 transition"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                className="rounded-md border border-cream-3 px-3 py-1 text-xs text-ink-3 hover:text-ink transition"
              >
                Cancel
              </button>
              <span className="ml-auto text-[10px] font-data text-ink-3">{editText.length}/500</span>
            </div>
          </div>
        ) : (
          <p
            className="text-sm text-ink leading-relaxed cursor-pointer hover:text-teal-deep transition-colors"
            title="Click to edit"
            onClick={startEdit}
          >
            {rule.rule}
          </p>
        )}
      </div>

      {/* Delete */}
      <div className="shrink-0">
        {confirmDelete ? (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-red-500 font-medium">Delete?</span>
            <button
              type="button"
              onClick={() => onDelete(rule.id)}
              className="rounded-md bg-red-500 px-2 py-0.5 text-xs font-semibold text-white hover:bg-red-600 transition"
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="rounded-md border border-cream-3 px-2 py-0.5 text-xs text-ink-3 hover:text-ink transition"
            >
              No
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="rounded-md p-1 text-cream-3 hover:text-red-400 transition"
            title="Delete rule"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 4h12M6 4V2h4v2M5 4v9a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}

// ── Add rule form ─────────────────────────────────────────────────────────────

function AddRuleForm({
  category,
  onAdd,
}: {
  category: Category
  onAdd: (category: Category, rule: string) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  function openForm() {
    setOpen(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  async function handleAdd() {
    if (!text.trim()) return
    setSaving(true)
    await onAdd(category, text.trim())
    setSaving(false)
    setText('')
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={openForm}
        className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-ink-3 hover:text-teal transition"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M8 3v10M3 8h10" strokeLinecap="round" />
        </svg>
        Add rule
      </button>
    )
  }

  return (
    <div className="px-4 py-3 border-t border-cream-2 space-y-2">
      <textarea
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={500}
        rows={2}
        placeholder="Describe the rule…"
        className="w-full resize-none rounded-lg border border-cream-3 bg-white px-3 py-2 text-sm text-ink focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal transition"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleAdd}
          disabled={saving || text.trim().length === 0}
          className="rounded-md bg-teal px-3 py-1 text-xs font-semibold text-white hover:bg-teal-dark disabled:opacity-50 transition"
        >
          {saving ? 'Saving…' : 'Save rule'}
        </button>
        <button
          type="button"
          onClick={() => { setText(''); setOpen(false) }}
          className="rounded-md border border-cream-3 px-3 py-1 text-xs text-ink-3 hover:text-ink transition"
        >
          Cancel
        </button>
        <span className="ml-auto text-[10px] font-data text-ink-3">{text.length}/500</span>
      </div>
    </div>
  )
}

// ── Category section ──────────────────────────────────────────────────────────

function CategorySection({
  config,
  rules,
  onToggle,
  onEdit,
  onDelete,
  onAdd,
}: {
  config: typeof CATEGORIES[number]
  rules: StyleGuideRule[]
  onToggle: (id: string, active: boolean) => Promise<void>
  onEdit: (id: string, text: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onAdd: (category: Category, rule: string) => Promise<void>
}) {
  const [open, setOpen] = useState(true)
  const activeCount = rules.filter((r) => r.active).length

  return (
    <div className={`rounded-2xl border border-cream-3 bg-white shadow-sm overflow-hidden ${config.accent}`}>
      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-cream/50 transition-colors"
      >
        <div className="flex-1 flex items-center gap-2.5 text-left">
          <span className="font-display text-sm font-semibold text-ink">{config.label}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${config.badgeCls}`}>
            {activeCount}/{rules.length} active
          </span>
          <span className="text-xs text-ink-3">{config.description}</span>
        </div>
        <svg
          className={`h-4 w-4 text-ink-3 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
        >
          <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <>
          {rules.length === 0 ? (
            <div className="px-5 py-4 text-sm text-ink-3 border-t border-cream-2">
              No rules yet in this category.
            </div>
          ) : (
            <div className="divide-y divide-cream-2 border-t border-cream-2">
              {rules.map((rule) => (
                <RuleRow
                  key={rule.id}
                  rule={rule}
                  onToggle={onToggle}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              ))}
            </div>
          )}
          <AddRuleForm category={config.id} onAdd={onAdd} />
        </>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function StyleGuideSettings({
  rules: initialRules,
  seedNeeded,
}: {
  rules: StyleGuideRule[]
  seedNeeded: boolean
}) {
  const [rules, setRules] = useState<StyleGuideRule[]>(initialRules)
  const [seeding, setSeeding] = useState(false)
  const [seedError, setSeedError] = useState<string | null>(null)

  // ── Seed ───────────────────────────────────────────────────────────────────

  async function handleSeed() {
    setSeeding(true)
    setSeedError(null)
    try {
      const res = await fetch('/api/content-studio/style-guide/seed', { method: 'POST' })
      const data = await res.json()
      if (!res.ok || data.error) { setSeedError(data.error ?? 'Seed failed'); return }
      // Refetch all rules
      const listRes = await fetch('/api/content-studio/style-guide')
      const listData = await listRes.json()
      setRules(listData.rules ?? [])
    } finally {
      setSeeding(false)
    }
  }

  // ── Toggle ─────────────────────────────────────────────────────────────────

  async function handleToggle(id: string, active: boolean) {
    // Optimistic update
    setRules((prev) => prev.map((r) => r.id === id ? { ...r, active } : r))
    const res = await fetch('/api/content-studio/style-guide', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, active }),
    })
    if (!res.ok) {
      // Revert
      setRules((prev) => prev.map((r) => r.id === id ? { ...r, active: !active } : r))
    }
  }

  // ── Edit ───────────────────────────────────────────────────────────────────

  async function handleEdit(id: string, rule: string) {
    const res = await fetch('/api/content-studio/style-guide', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, rule }),
    })
    const data = await res.json()
    if (res.ok && data.rule) {
      setRules((prev) => prev.map((r) => r.id === id ? data.rule : r))
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  async function handleDelete(id: string) {
    // Optimistic remove
    const removed = rules.find((r) => r.id === id)
    setRules((prev) => prev.filter((r) => r.id !== id))
    const res = await fetch('/api/content-studio/style-guide', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (!res.ok && removed) {
      // Revert
      setRules((prev) => [...prev, removed].sort((a, b) => a.sort_order - b.sort_order))
    }
  }

  // ── Add ────────────────────────────────────────────────────────────────────

  async function handleAdd(category: Category, rule: string) {
    const res = await fetch('/api/content-studio/style-guide', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, rule }),
    })
    const data = await res.json()
    if (res.ok && data.rule) {
      setRules((prev) => [...prev, data.rule])
    }
  }

  const showSeedBanner = seedNeeded && rules.length === 0

  return (
    <div className="space-y-6">

      {/* ── Page header ── */}
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/content-studio"
          className="flex items-center gap-1.5 text-xs font-medium text-ink-3 hover:text-teal transition"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M10 3L5 8l5 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Content Studio
        </Link>
        <span className="text-ink-3">/</span>
        <h1 className="font-display text-sm font-semibold text-ink">Style Guide</h1>
      </div>

      {/* ── Seed banner ── */}
      {showSeedBanner && (
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-amber-800">No rules yet.</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Load the LashBox LA defaults to get started — you can edit or delete any rule after.
            </p>
            {seedError && <p className="text-xs text-red-600 mt-1">{seedError}</p>}
          </div>
          <button
            type="button"
            onClick={handleSeed}
            disabled={seeding}
            className="shrink-0 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60 transition"
          >
            {seeding ? 'Loading…' : 'Load Defaults'}
          </button>
        </div>
      )}

      {/* ── Context note ── */}
      <p className="text-xs text-ink-3 leading-relaxed">
        Active rules are injected into every Content Studio generation. Toggle rules off to suspend them without deleting. Click any rule text to edit it inline.
      </p>

      {/* ── Category sections ── */}
      <div className="space-y-4">
        {CATEGORIES.map((cat) => {
          const catRules = rules
            .filter((r) => r.category === cat.id)
            .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
          return (
            <CategorySection
              key={cat.id}
              config={cat}
              rules={catRules}
              onToggle={handleToggle}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onAdd={handleAdd}
            />
          )
        })}
      </div>

    </div>
  )
}
