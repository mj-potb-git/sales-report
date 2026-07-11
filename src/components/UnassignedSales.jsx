// Unassigned Sales — PAID members whose LakbayHub invoice has NO cluster/coach
// tag, so they can't be credited to a coach and fall into "Unassigned". This
// panel lists them with an Export CSV so MJ can drop them into a Google Sheet
// and forward to the LakbayHub team to tag the cluster at the source.
import { useMemo, useState } from 'react'
import { UserX, Download, ChevronDown, ChevronRight } from 'lucide-react'
import { formatPHP } from '../api/lakbay'

export default function UnassignedSales({ customers = [] }) {
  const [open, setOpen] = useState(false)

  const rows = useMemo(() => {
    const out = []
    for (const c of customers) {
      if (c.coach || c.cluster) continue                     // has a coach tag → not unassigned
      if (!(c.totalPaid > 0)) continue                        // paid sales only
      const paidDates = c.invoices.filter(i => i.isPaid && i.paidDate).map(i => i.paidDate).sort()
      out.push({
        key: c.key,
        name: c.customer_name || 'Unknown',
        email: c.email || '',
        package: (c.package || '').replace(/\s*package\s*/i, '').trim() || '—',
        totalPaid: c.totalPaid,
        firstDate: paidDates[0] || '',
        status: c.isFullyPaid ? 'Fully paid' : 'Partial / DP',
      })
    }
    return out.sort((a, b) => (a.firstDate || '').localeCompare(b.firstDate || ''))
  }, [customers])

  if (rows.length === 0) return null
  const total = rows.reduce((s, r) => s + r.totalPaid, 0)
  const fmtDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

  function exportCSV() {
    const head = ['Customer', 'Email', 'Package', 'Total Paid', 'First Payment Date', 'Status']
    const body = rows.map(r => [r.name, r.email, r.package, r.totalPaid, r.firstDate, r.status])
    body.push([])
    body.push([`TOTAL (${rows.length} unassigned)`, '', '', total, '', ''])
    const csv = [head, ...body].map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'unassigned-sales-no-coach-tag.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-orange-200 overflow-hidden">
      <div className="px-4 py-3 bg-orange-50 flex items-center justify-between gap-3 flex-wrap">
        <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2 text-left" aria-expanded={open}>
          {open ? <ChevronDown size={16} className="text-orange-700" /> : <ChevronRight size={16} className="text-orange-700" />}
          <UserX size={18} className="text-orange-600" aria-hidden="true" />
          <span className="font-semibold text-orange-900">{rows.length} unassigned sale{rows.length > 1 ? 's' : ''} (no coach tag)</span>
          <span className="text-xs text-orange-700 hidden sm:inline">· {formatPHP(total)} — nabibilang sa revenue pero walang coach credit</span>
        </button>
        <button onClick={exportCSV}
          className="flex items-center gap-1.5 text-xs font-semibold text-orange-800 hover:text-orange-900 bg-white border border-orange-200 rounded-lg px-2.5 py-1.5">
          <Download size={13} /> Export CSV
        </button>
      </div>

      <p className="px-4 pt-3 text-[12px] text-gray-500">
        Mga PAID na sales na walang <code>cluster_name</code> (coach tag) sa LakbayHub invoice — kaya "Unassigned".
        I-export at ipa-tag sa LakbayHub team para ma-credit sa tamang coach.
      </p>

      {open && (
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                {['Customer', 'Email', 'Package', 'Total Paid', 'First Payment', 'Status'].map(h => (
                  <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map(r => (
                <tr key={r.key} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-800 whitespace-nowrap">{r.name}</td>
                  <td className="px-4 py-2 text-gray-500">{r.email || '—'}</td>
                  <td className="px-4 py-2 text-gray-500">{r.package}</td>
                  <td className="px-4 py-2 font-semibold text-gray-900 whitespace-nowrap">{formatPHP(r.totalPaid)}</td>
                  <td className="px-4 py-2 text-gray-600 whitespace-nowrap">{fmtDate(r.firstDate)}</td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${r.status === 'Fully paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{r.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50">
                <td className="px-4 py-2.5 font-semibold text-gray-700" colSpan={3}>TOTAL ({rows.length} unassigned)</td>
                <td className="px-4 py-2.5 font-bold text-gray-900 whitespace-nowrap" colSpan={3}>{formatPHP(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  )
}
