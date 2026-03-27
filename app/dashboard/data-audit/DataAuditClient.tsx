'use client'

import { useState } from 'react'
import type { AuditEntry } from './page'

const PLATFORMS = ['Shopify', 'Klaviyo', 'Meta Ads', 'Google Ads', 'GA4', 'Search Console', 'SEMrush', 'Recharge', 'LoyaltyLion', 'Customer Intelligence', 'Product Intelligence']
const TENANT_ID = '00000000-0000-0000-0000-000000000001'

interface KnownDiscrepancy {
  platform: string
  metric: string
  issue: string
  root_cause: string
  impact: 'high' | 'medium' | 'low'
  fixable: boolean
}

interface Props {
  auditLog: AuditEntry[]
  knownDiscrepancies: KnownDiscrepancy[]
}

const IMPACT_COLORS = {
  high:   'bg-red-50 text-red-700 ring-red-200',
  medium: 'bg-yellow-50 text-yellow-700 ring-yellow-200',
  low:    'bg-blue-50 text-blue-700 ring-blue-200',
}

export default function DataAuditClient({ auditLog, knownDiscrepancies }: Props) {
  const [log, setLog] = useState<AuditEntry[]>(auditLog)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [filterPlatform, setFilterPlatform] = useState<string>('all')
  const [filterMatch, setFilterMatch] = useState<string>('all')

  const [form, setForm] = useState({
    platform: 'Shopify',
    metric_name: '',
    time_window: '',
    expected_value: '',
    actual_value: '',
    match: 'true',
    tolerance_note: '',
    discrepancy_note: '',
    verified_by: '',
    notes: '',
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.metric_name || !form.expected_value || !form.actual_value || !form.verified_by) return
    setSaving(true)
    try {
      const res = await fetch('/api/data-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: TENANT_ID,
          platform: form.platform,
          metric_name: form.metric_name,
          time_window: form.time_window || 'Not specified',
          expected_value: form.expected_value,
          actual_value: form.actual_value,
          match: form.match === 'true',
          tolerance_note: form.tolerance_note || null,
          discrepancy_note: form.discrepancy_note || null,
          verified_by: form.verified_by,
          notes: form.notes || null,
        }),
      })
      const data = await res.json() as { entry?: AuditEntry; error?: string }
      if (data.entry) {
        setLog([data.entry, ...log])
        setShowForm(false)
        setForm({ platform: 'Shopify', metric_name: '', time_window: '', expected_value: '', actual_value: '', match: 'true', tolerance_note: '', discrepancy_note: '', verified_by: '', notes: '' })
      }
    } finally {
      setSaving(false)
    }
  }

  const filtered = log.filter((e) => {
    if (filterPlatform !== 'all' && e.platform !== filterPlatform) return false
    if (filterMatch === 'match' && !e.match) return false
    if (filterMatch === 'mismatch' && e.match) return false
    return true
  })

  const mismatchCount = log.filter((e) => !e.match).length

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Data Audit</h1>
        <p className="mt-1 text-sm text-ink-2">
          Spot-check system figures against source-of-truth platform dashboards.
          Log verifications and track known discrepancies.
        </p>
      </div>

      {/* Summary pills */}
      <div className="flex flex-wrap gap-3">
        <div className="rounded-xl border border-cream-3 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs text-ink-3">Total Verifications</p>
          <p className="font-display text-2xl font-bold text-ink">{log.length}</p>
        </div>
        <div className="rounded-xl border border-cream-3 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs text-ink-3">Mismatches Found</p>
          <p className={`font-display text-2xl font-bold ${mismatchCount > 0 ? 'text-red-600' : 'text-teal-deep'}`}>{mismatchCount}</p>
        </div>
        <div className="rounded-xl border border-cream-3 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs text-ink-3">Known Permanent Issues</p>
          <p className="font-display text-2xl font-bold text-amber-600">{knownDiscrepancies.length}</p>
        </div>
      </div>

      {/* Known discrepancies */}
      <section>
        <h2 className="font-display text-sm font-semibold text-ink mb-3">Known Permanent Discrepancies</h2>
        <p className="text-xs text-ink-3 mb-4">These are documented data limitations inherent to platform API constraints or architectural decisions — they are not bugs.</p>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {knownDiscrepancies.map((d, i) => (
            <div key={i} className="rounded-2xl border border-cream-3 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <span className="text-[10px] font-data uppercase tracking-wider text-ink-3">{d.platform}</span>
                  <p className="font-display text-sm font-semibold text-ink">{d.metric}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${IMPACT_COLORS[d.impact]}`}>
                    {d.impact} impact
                  </span>
                  {d.fixable ? (
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold bg-teal-pale text-teal-deep ring-1 ring-teal-200">fixable</span>
                  ) : (
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold bg-cream-2 text-ink-3 ring-1 ring-cream-3">api limit</span>
                  )}
                </div>
              </div>
              <p className="text-xs text-ink-2 mb-1.5">{d.issue}</p>
              <p className="text-[11px] text-ink-3"><span className="font-medium">Root cause:</span> {d.root_cause}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Manual audit log */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-sm font-semibold text-ink">Verification Log</h2>
          <button
            onClick={() => setShowForm(!showForm)}
            className="rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-cream hover:bg-ink/90 transition"
          >
            {showForm ? 'Cancel' : '+ Add Verification'}
          </button>
        </div>

        {/* Add form */}
        {showForm && (
          <form onSubmit={handleSubmit} className="mb-6 rounded-2xl border border-cream-3 bg-cream p-5 shadow-sm space-y-4">
            <p className="font-display text-sm font-semibold text-ink">New Verification Entry</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="block text-xs font-medium text-ink-2 mb-1">Platform *</label>
                <select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })} className="w-full rounded-lg border border-cream-3 bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-teal/30">
                  {PLATFORMS.map((p) => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-2 mb-1">Metric *</label>
                <input value={form.metric_name} onChange={(e) => setForm({ ...form, metric_name: e.target.value })} placeholder="e.g. Total Orders (30d)" className="w-full rounded-lg border border-cream-3 bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-teal/30" />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-2 mb-1">Time Window</label>
                <input value={form.time_window} onChange={(e) => setForm({ ...form, time_window: e.target.value })} placeholder="e.g. Last 30 days" className="w-full rounded-lg border border-cream-3 bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-teal/30" />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-2 mb-1">Expected (source of truth) *</label>
                <input value={form.expected_value} onChange={(e) => setForm({ ...form, expected_value: e.target.value })} placeholder="e.g. $42,310" className="w-full rounded-lg border border-cream-3 bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-teal/30" />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-2 mb-1">Actual (Store Signal) *</label>
                <input value={form.actual_value} onChange={(e) => setForm({ ...form, actual_value: e.target.value })} placeholder="e.g. $41,890" className="w-full rounded-lg border border-cream-3 bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-teal/30" />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-2 mb-1">Match?</label>
                <select value={form.match} onChange={(e) => setForm({ ...form, match: e.target.value })} className="w-full rounded-lg border border-cream-3 bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-teal/30">
                  <option value="true">Yes — matches</option>
                  <option value="false">No — discrepancy</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-2 mb-1">Verified by *</label>
                <input value={form.verified_by} onChange={(e) => setForm({ ...form, verified_by: e.target.value })} placeholder="Your name" className="w-full rounded-lg border border-cream-3 bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-teal/30" />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-2 mb-1">Tolerance note</label>
                <input value={form.tolerance_note} onChange={(e) => setForm({ ...form, tolerance_note: e.target.value })} placeholder="e.g. ±2% due to sync lag" className="w-full rounded-lg border border-cream-3 bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-teal/30" />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-2 mb-1">Discrepancy explanation</label>
                <input value={form.discrepancy_note} onChange={(e) => setForm({ ...form, discrepancy_note: e.target.value })} placeholder="If mismatch, explain why" className="w-full rounded-lg border border-cream-3 bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-teal/30" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-2 mb-1">Notes</label>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Any additional context" className="w-full rounded-lg border border-cream-3 bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-teal/30 resize-none" />
            </div>
            <button type="submit" disabled={saving} className="rounded-lg bg-teal-deep px-4 py-2 text-sm font-semibold text-white hover:bg-teal-deep/90 transition disabled:opacity-50">
              {saving ? 'Saving…' : 'Save Entry'}
            </button>
          </form>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <select value={filterPlatform} onChange={(e) => setFilterPlatform(e.target.value)} className="rounded-lg border border-cream-3 bg-white px-3 py-1.5 text-xs text-ink focus:outline-none">
            <option value="all">All platforms</option>
            {PLATFORMS.map((p) => <option key={p}>{p}</option>)}
          </select>
          <select value={filterMatch} onChange={(e) => setFilterMatch(e.target.value)} className="rounded-lg border border-cream-3 bg-white px-3 py-1.5 text-xs text-ink focus:outline-none">
            <option value="all">All results</option>
            <option value="match">Matches only</option>
            <option value="mismatch">Mismatches only</option>
          </select>
          <span className="text-xs text-ink-3">{filtered.length} entries</span>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-cream-3 bg-cream px-6 py-10 text-center">
            <p className="text-sm text-ink-3">No verification entries yet.</p>
            <p className="mt-1 text-xs text-ink-3">Click "+ Add Verification" to log your first spot check.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-cream-3 bg-white shadow-sm">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-cream-3 bg-cream">
                  <th className="px-4 py-3 text-left font-data uppercase tracking-wider text-ink-3">Platform</th>
                  <th className="px-4 py-3 text-left font-data uppercase tracking-wider text-ink-3">Metric</th>
                  <th className="px-4 py-3 text-left font-data uppercase tracking-wider text-ink-3 hidden sm:table-cell">Window</th>
                  <th className="px-4 py-3 text-right font-data uppercase tracking-wider text-ink-3">Expected</th>
                  <th className="px-4 py-3 text-right font-data uppercase tracking-wider text-ink-3">Actual</th>
                  <th className="px-4 py-3 text-center font-data uppercase tracking-wider text-ink-3">Match</th>
                  <th className="px-4 py-3 text-left font-data uppercase tracking-wider text-ink-3 hidden lg:table-cell">Verified by</th>
                  <th className="px-4 py-3 text-left font-data uppercase tracking-wider text-ink-3 hidden lg:table-cell">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-2">
                {filtered.map((entry) => (
                  <tr key={entry.id} className={`hover:bg-cream/50 ${!entry.match ? 'bg-red-50/40' : ''}`}>
                    <td className="px-4 py-3 font-medium text-ink">{entry.platform}</td>
                    <td className="px-4 py-3">
                      <p className="text-ink">{entry.metric_name}</p>
                      {entry.discrepancy_note && (
                        <p className="text-[10px] text-red-600 mt-0.5">{entry.discrepancy_note}</p>
                      )}
                      {entry.tolerance_note && (
                        <p className="text-[10px] text-ink-3 mt-0.5">{entry.tolerance_note}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink-3 hidden sm:table-cell">{entry.time_window}</td>
                    <td className="px-4 py-3 text-right font-mono text-ink">{entry.expected_value}</td>
                    <td className="px-4 py-3 text-right font-mono text-ink">{entry.actual_value}</td>
                    <td className="px-4 py-3 text-center">
                      {entry.match ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-teal-pale px-2 py-0.5 text-[10px] font-semibold text-teal-deep">
                          <span className="h-1.5 w-1.5 rounded-full bg-teal" />
                          Match
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700 ring-1 ring-red-200">
                          <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                          Mismatch
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink-3 hidden lg:table-cell">{entry.verified_by}</td>
                    <td className="px-4 py-3 text-ink-3 hidden lg:table-cell whitespace-nowrap">
                      {new Date(entry.verified_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
