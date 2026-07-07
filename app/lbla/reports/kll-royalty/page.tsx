'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────────────────

interface DetailRow {
  order_number: string
  sku: string
  product_title: string
  qty: number
  unit_price: number
  gross_sales: number
  discount_code: string
  discount_amount: number
  gwp_cost: number
  net_sales: number
  item_shipping_cost: number
  final_net: number
  royalty: number
}

interface ReportResponse {
  month: string
  summary: { net_sales: number; royalty: number }
  rows: DetailRow[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getDefaultMonth(): string {
  const now = new Date()
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
}

function displayMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December']
  return `${months[m - 1]} ${y}`
}

function fmtCurrency(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function downloadCsv(rows: DetailRow[], month: string) {
  const headers = [
    'Order Number', 'SKU', 'Product Title', 'Qty', 'Unit Price', 'Gross Sales',
    'Discount Code', 'Discount Amount', 'GWP Cost', 'Net Sales',
    'Item Shipping Cost', 'Final Net', 'Royalty',
  ]
  const csvRows = [
    headers,
    ...rows.map((r) => [
      r.order_number, r.sku, r.product_title, String(r.qty),
      r.unit_price.toFixed(2), r.gross_sales.toFixed(2),
      r.discount_code, r.discount_amount.toFixed(2), r.gwp_cost.toFixed(2),
      r.net_sales.toFixed(2), r.item_shipping_cost.toFixed(2),
      r.final_net.toFixed(2), r.royalty.toFixed(2),
    ]),
  ]
  const csv = csvRows.map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `kll-royalty-${month}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Calculation explainer ──────────────────────────────────────────────────────

const CALCULATION_STEPS = [
  'We start with the full sale price of each Korean Lash Lift product sold',
  'We subtract any discount, but only for specific approved discount codes (partner codes, welcome offers, affiliate codes, and approved promos). Regular full-price sales and unapproved discounts are not touched',
  'We subtract the cost of any free gift that came with a kit purchase',
  'We subtract the actual cost of shipping that order, split fairly across everything in the package',
  'Whatever\'s left is the "Net Sales" for that product',
  'The royalty is 10% of that Net Sales number',
]

function CalculationExplainer() {
  const [open, setOpen] = useState(false)

  return (
    <div className="mb-6 rounded-2xl border border-cream-3 bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-cream/50 transition"
      >
        <span className="text-xs font-semibold text-ink-2">How this number is calculated</span>
        <svg
          className={`h-3.5 w-3.5 text-ink-3 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}
        >
          <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <ul className="border-t border-cream-2 px-5 py-4 space-y-1.5">
          {CALCULATION_STEPS.map((step, i) => (
            <li key={i} className="flex gap-2 text-xs text-ink-3 leading-relaxed">
              <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-ink-3" />
              {step}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Table skeleton ────────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-cream-3 bg-white shadow-sm">
      <div className="divide-y divide-cream-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-3 animate-pulse">
            <div className="h-4 w-20 rounded bg-cream-3" />
            <div className="h-4 w-32 rounded bg-cream-2" />
            <div className="h-4 w-12 rounded bg-cream-2 ml-auto" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function KllRoyaltyReportPage() {
  const [month, setMonth] = useState(getDefaultMonth())
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<ReportResponse | null>(null)

  const fetchReport = useCallback(async (selectedMonth: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/lbla/reports/kll-royalty?month=${selectedMonth}`)
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to load report'); setReport(null); return }
      setReport(data as ReportResponse)
    } catch {
      setError('Network error')
      setReport(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchReport(month) }, [month, fetchReport])

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">

      {/* Header */}
      <div className="mb-6">
        <Link href="/lbla" className="flex items-center gap-1.5 text-xs font-medium text-ink-3 hover:text-teal transition mb-3 w-fit">
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M10 3L5 8l5 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Team Tools
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold text-ink">KLL Royalty Report</h1>
            <p className="mt-1 text-sm text-ink-3">
              Net sales and 10% royalty on target KLL SKUs, lashboxla.com retail only.{' '}
              <Link href="/lbla/settings/discount-codes" className="text-teal-deep hover:text-teal transition">Manage allowed discount codes →</Link>
            </p>
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-ink-2 mb-1">Month</label>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="rounded-xl border border-cream-3 bg-white px-4 py-2.5 text-sm text-ink focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20 transition"
            />
          </div>
        </div>
      </div>

      <CalculationExplainer />

      {/* Error */}
      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Summary cards */}
      {report && !error && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-cream-3 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">Net Sales — {displayMonth(report.month)}</p>
            <p className="mt-2 font-display text-3xl font-semibold text-ink">{fmtCurrency(report.summary.net_sales)}</p>
          </div>
          <div className="rounded-2xl border border-cream-3 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">Royalty (10%) — {displayMonth(report.month)}</p>
            <p className="mt-2 font-display text-3xl font-semibold text-teal-deep">{fmtCurrency(report.summary.royalty)}</p>
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading && <TableSkeleton />}

      {/* No results */}
      {!isLoading && report && report.rows.length === 0 && !error && (
        <div className="rounded-2xl border border-cream-3 bg-white p-10 text-center shadow-sm">
          <p className="text-sm text-ink-3">No target-SKU sales found for {displayMonth(report.month)}.</p>
        </div>
      )}

      {/* Detail table */}
      {!isLoading && report && report.rows.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium text-ink">
              {report.rows.length.toLocaleString()} line item{report.rows.length !== 1 ? 's' : ''}
            </p>
            <button
              type="button"
              onClick={() => downloadCsv(report.rows, report.month)}
              className="flex items-center gap-2 rounded-xl border border-cream-3 bg-white px-4 py-2 text-sm font-medium text-ink-2 transition hover:border-teal/40 hover:text-teal"
            >
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M8 3v7M5 7l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M2 12v1a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-1" strokeLinecap="round" />
              </svg>
              Export CSV
            </button>
          </div>

          <div className="overflow-hidden rounded-2xl border border-cream-3 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-cream-2 bg-cream">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-3 whitespace-nowrap">Order</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-3 whitespace-nowrap">SKU / Product</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-ink-3 whitespace-nowrap">Qty</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-ink-3 whitespace-nowrap">Unit Price</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-ink-3 whitespace-nowrap">Gross Sales</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-3 whitespace-nowrap">Discount Code</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-ink-3 whitespace-nowrap">Discount Amt</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-ink-3 whitespace-nowrap">GWP Cost</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-ink-3 whitespace-nowrap">Net Sales</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-ink-3 whitespace-nowrap">Item Shipping</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-ink-3 whitespace-nowrap">Final Net</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-ink-3 whitespace-nowrap">Royalty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cream-2">
                  {report.rows.map((r, i) => (
                    <tr key={`${r.order_number}-${r.sku}-${i}`} className={i % 2 === 0 ? 'bg-white' : 'bg-cream/40'}>
                      <td className="px-4 py-3 font-data text-xs text-ink whitespace-nowrap">{r.order_number}</td>
                      <td className="px-4 py-3 text-xs text-ink whitespace-nowrap max-w-xs truncate" title={r.product_title}>
                        <span className="font-data">{r.sku}</span>
                        <span className="block text-ink-3 truncate">{r.product_title}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-data text-xs text-ink">{r.qty}</td>
                      <td className="px-4 py-3 text-right font-data text-xs text-ink">{fmtCurrency(r.unit_price)}</td>
                      <td className="px-4 py-3 text-right font-data text-xs text-ink">{fmtCurrency(r.gross_sales)}</td>
                      <td className="px-4 py-3 text-xs text-ink-2 whitespace-nowrap">{r.discount_code || '—'}</td>
                      <td className="px-4 py-3 text-right font-data text-xs text-ink">{fmtCurrency(r.discount_amount)}</td>
                      <td className="px-4 py-3 text-right font-data text-xs text-ink">{fmtCurrency(r.gwp_cost)}</td>
                      <td className="px-4 py-3 text-right font-data text-xs text-ink">{fmtCurrency(r.net_sales)}</td>
                      <td className="px-4 py-3 text-right font-data text-xs text-ink">{fmtCurrency(r.item_shipping_cost)}</td>
                      <td className="px-4 py-3 text-right font-data text-xs text-ink">{fmtCurrency(r.final_net)}</td>
                      <td className="px-4 py-3 text-right font-data text-xs font-semibold text-teal-deep">{fmtCurrency(r.royalty)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-cream-3 bg-cream">
                    <td colSpan={8} className="px-4 py-3 text-xs font-semibold text-ink">Total</td>
                    <td className="px-4 py-3 text-right font-data text-xs font-semibold text-ink">{fmtCurrency(report.summary.net_sales)}</td>
                    <td />
                    <td />
                    <td className="px-4 py-3 text-right font-data text-xs font-semibold text-teal-deep">{fmtCurrency(report.summary.royalty)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
