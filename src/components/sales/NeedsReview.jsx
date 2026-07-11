// "Needs Review" panel — surfaces LakbayHub sales records that are incomplete
// (missing date, zero amount, or no closer) so the team can fix them at the
// source instead of having them silently dropped from reports.

import { useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight, Download } from 'lucide-react'
import { formatPHP } from '../../api/lakbay'

const REASON_STYLE = {
  'no date':         'bg-red-100 text-red-700',
  'pending payment': 'bg-amber-100 text-amber-700',
  'zero amount':     'bg-amber-100 text-amber-700',
  'no attribution':  'bg-blue-100 text-blue-700',
}

function exportCsv(records) {
  const head = ['Customer', 'Email', 'Date', 'Amount', 'Closer', 'Team', 'Issues']
  const rows = records.map(r => [
    r.customer_name || '',
    r.meta?.email || '',
    r.date || '',
    r.sales_amount || 0,
    r.sales_agent === 'Unassigned' ? '' : r.sales_agent,
    r.team || '',
    (r.reviewReasons || []).join('; '),
  ])
  const csv = [head, ...rows]
    .map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'lakbayhub-needs-review.csv'
  a.click()
  URL.revokeObjectURL(url)
}

export default function NeedsReview({ records = [] }) {
  const [open, setOpen] = useState(false)
  if (records.length === 0) return null

  // Tally reasons for the summary line
  const tally = {}
  for (const r of records) for (const reason of r.reviewReasons || []) tally[reason] = (tally[reason] || 0) + 1
  const summary = Object.entries(tally).map(([k, v]) => `${v} ${k}`).join(' · ')

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-amber-200 overflow-hidden">
      <div className="px-4 py-3 bg-amber-50 flex items-center justify-between gap-3 flex-wrap">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-2 text-left"
          aria-expanded={open}
        >
          {open ? <ChevronDown size={16} className="text-amber-700" /> : <ChevronRight size={16} className="text-amber-700" />}
          <AlertTriangle size={18} className="text-amber-600" aria-hidden="true" />
          <span className="font-semibold text-amber-900">
            {records.length} record{records.length > 1 ? 's' : ''} needs review
          </span>
          {summary && <span className="text-xs text-amber-700 hidden sm:inline">· {summary}</span>}
        </button>
        <button
          onClick={() => exportCsv(records)}
          className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 hover:text-amber-900 bg-white border border-amber-200 rounded-lg px-2.5 py-1.5"
        >
          <Download size={13} /> CSV
        </button>
      </div>

      <p className="px-4 pt-3 text-[12px] text-gray-500">
        Mga sales na may kulang sa LakbayHub — hindi sila tama o kumpleto sa report hangga't di naaayos sa source.
      </p>

      {open && (
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                {['Customer', 'Date', 'Amount', 'Closer', 'Team', 'Issues'].map(h => (
                  <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {records.map((r, i) => (
                <tr key={r.transaction_id || i} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-800">{r.customer_name || '—'}</td>
                  <td className="px-4 py-2 text-gray-600">{r.date || <span className="text-red-500">—</span>}</td>
                  <td className="px-4 py-2 text-gray-700">{r.sales_amount ? formatPHP(r.sales_amount) : <span className="text-amber-600">₱0</span>}</td>
                  <td className="px-4 py-2 text-gray-600">{r.sales_agent === 'Unassigned' ? <span className="text-blue-500">—</span> : r.sales_agent}</td>
                  <td className="px-4 py-2 text-gray-500">{r.team}</td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1">
                      {(r.reviewReasons || []).map(reason => (
                        <span key={reason} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${REASON_STYLE[reason] || 'bg-gray-100 text-gray-600'}`}>
                          {reason}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
