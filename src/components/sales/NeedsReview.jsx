// "Needs Review" panel — surfaces LakbayHub sales records that are incomplete
// (missing date, zero amount, or no closer) so the team can fix them at the
// source instead of having them silently dropped from reports.
//
// No-date records can be DATED right here: the inline "Assign date" editor
// writes a saleDateOverride (Supabase-shared), which immediately moves the
// sale into its true month across every view (Acquisition, Reports, AACIO).

import { useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight, Download, CalendarClock, Check, X } from 'lucide-react'
import { formatPHP } from '../../api/lakbay'
import { fbName } from '../../api/lakbayhub'
import { keyForRecord, setOverride } from '../../lib/saleDateOverrides'

const REASON_STYLE = {
  'no date':        'bg-red-100 text-red-700',
  'zero amount':    'bg-amber-100 text-amber-700',
  'no attribution': 'bg-blue-100 text-blue-700',
}

// Inline date-assign for a record LakbayHub left dateless. Writes a shared
// override keyed off the RAW record (email + empty date + amount), so it
// survives refetches. Exported for reuse in the AgentDetail drill-down.
export function AssignSaleDate({ record, onAssigned }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState('')

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border border-red-200 bg-red-50 text-red-700 text-[11px] font-semibold hover:bg-red-100 transition-colors"
        title="Ilagay ang petsa mula sa manual tracker — papasok agad sa tamang buwan"
      >
        <CalendarClock size={12} /> Assign date
      </button>
    )
  }
  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="date"
        value={val}
        onChange={e => setVal(e.target.value)}
        className="border border-gray-200 rounded-md px-1.5 py-0.5 text-xs focus:outline-none focus:border-[#1B4F4F]"
      />
      <button
        onClick={() => {
          if (val) {
            setOverride(keyForRecord(record), val, { originalDate: record.date || null, note: 'dated from manual tracker' })
            onAssigned?.(val)
          }
          setEditing(false)
        }}
        title="Save date"
        className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
      ><Check size={13} /></button>
      <button onClick={() => setEditing(false)} title="Cancel" className="p-1 text-gray-400 hover:bg-gray-100 rounded"><X size={13} /></button>
    </span>
  )
}

function exportCsv(records) {
  const head = ['Customer', 'FB Name', 'Email', 'Date', 'Package', 'Amount', 'Closer', 'Team', 'Issues']
  const rows = records.map(r => [
    r.customer_name || '',
    fbName(r) || '',
    r.meta?.email || '',
    r.date || '',
    r.meta?.package || '',
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

export default function NeedsReview({ records = [], onAssigned }) {
  const [open, setOpen] = useState(false)
  if (records.length === 0) return null

  // Tally reasons for the summary line
  const tally = {}
  for (const r of records) for (const reason of r.reviewReasons || []) tally[reason] = (tally[reason] || 0) + 1
  const summary = Object.entries(tally).map(([k, v]) => `${v} ${k}`).join(' · ')
  const undatedTotal = records.filter(r => !r.date).reduce((s, r) => s + (Number(r.sales_amount) || 0), 0)

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
          {undatedTotal > 0 && (
            <span className="text-xs font-bold text-red-700 hidden sm:inline">· {formatPHP(undatedTotal)} na hindi kasama sa monthly (walang petsa)</span>
          )}
        </button>
        <button
          onClick={() => exportCsv(records)}
          className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 hover:text-amber-900 bg-white border border-amber-200 rounded-lg px-2.5 py-1.5"
        >
          <Download size={13} /> CSV
        </button>
      </div>

      <p className="px-4 pt-3 text-[12px] text-gray-500">
        Mga sales na may kulang sa LakbayHub. Ang mga <b>walang petsa</b> ay hindi kasama sa kahit anong buwan —
        i-click ang <b>Assign date</b> para ilagay ang petsa mula sa manual tracker at papasok agad sila sa tamang buwan.
      </p>

      {open && (
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                {['Customer', 'Date', 'Package', 'Amount', 'Closer', 'Team', 'Issues'].map(h => (
                  <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {records.map((r, i) => {
                const fb = fbName(r)
                return (
                  <tr key={r.transaction_id || i} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-800">
                      {r.customer_name || '—'}
                      {fb && <div className="text-[11px] text-gray-400">FB: {fb}</div>}
                    </td>
                    <td className="px-4 py-2 text-gray-600 whitespace-nowrap">
                      {r.date || <AssignSaleDate record={r} onAssigned={onAssigned} />}
                    </td>
                    <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{(r.meta?.package || '').replace(/\s*package\s*/i, '').trim() || '—'}</td>
                    <td className="px-4 py-2 text-gray-700 whitespace-nowrap">{r.sales_amount ? formatPHP(r.sales_amount) : <span className="text-amber-600">₱0</span>}</td>
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
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
