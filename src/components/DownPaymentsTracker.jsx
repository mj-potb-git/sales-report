// Down Payments tracker — every member who has paid a PARTIAL amount (a down
// payment) but not yet the full package price, tagged to their coach, with how
// long the balance has been outstanding, so MJ can follow up on collections.
//
// Sourced from invoice-level data (api/invoices → getInvoiceCustomers): a
// member is a "down payment" when they have paid something but their total paid
// is still below the package's full price. The DP date is their first payment;
// the balance is what's left to collect.
import { useMemo, useState } from 'react'
import { Wallet, Clock, Download } from 'lucide-react'
import { formatPHP } from '../api/lakbay'

const TEAL = '#1B4F4F'
const GOLD = '#F5A623'

// Aging badge — how urgent the follow-up is.
function ageStyle(days) {
  if (days <= 7)  return { cls: 'bg-emerald-100 text-emerald-700', label: `${days}d` }
  if (days <= 30) return { cls: 'bg-amber-100 text-amber-700',     label: `${days}d` }
  return { cls: 'bg-red-100 text-red-700', label: `${days}d` }
}

export default function DownPaymentsTracker({ customers = [], title = 'Down Payments', subtitle = 'Sign-up sa LakbayHub' }) {
  const [nowMs] = useState(() => Date.now())
  const [month, setMonth] = useState('all')   // 'all' or 'YYYY-MM'
  const [expanded, setExpanded] = useState(false)   // show 10, then "See all"
  const PREVIEW_COUNT = 10

  const allDps = useMemo(() => {
    const out = []
    for (const c of customers) {
      if (/2go|free/i.test(c.cluster || '')) continue         // free accounts aren't sales
      if (!(c.totalPaid > 0) || c.isFullyPaid) continue        // must be a real partial payment
      if (!c.fullPrice) continue                               // unknown package → can't size the balance
      const dpDate = c.dpDate || c.invoices.find(i => i.isPaid)?.paidDate
      if (!dpDate) continue                                    // no dated payment → can't age it
      const t = new Date(dpDate).getTime()
      const days = Math.max(0, Math.floor((nowMs - t) / 86400000))
      out.push({
        id: c.key,
        name: c.customer_name || 'Unknown',
        coach: c.coach || '—',
        package: (c.package || '').replace(/\s*package\s*/i, '').trim() || '—',
        paid: c.totalPaid, full: c.fullPrice, balance: c.fullPrice - c.totalPaid,
        date: dpDate, monthKey: String(dpDate).slice(0, 7), days,
      })
    }
    return out.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())   // latest DP first
  }, [customers, nowMs])

  const months = useMemo(() => {
    const set = new Set(allDps.map(d => d.monthKey).filter(Boolean))
    return [...set].sort((a, b) => b.localeCompare(a))
  }, [allDps])
  const monthLabel = (k) => new Date(k + '-01T00:00:00').toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })

  const dps = month === 'all' ? allDps : allDps.filter(d => d.monthKey === month)

  const totalBalance = dps.reduce((s, d) => s + d.balance, 0)
  const totalPaid    = dps.reduce((s, d) => s + d.paid, 0)
  const totalFull    = dps.reduce((s, d) => s + d.full, 0)
  const fmtDate = (d) => new Date(d + (String(d).length <= 10 ? 'T00:00:00' : '')).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })

  function exportCSV() {
    const rows = [['Customer', 'Coach', 'Package', 'Paid', 'Full Price', 'Balance', 'DP Date', 'Days Pending']]
    for (const d of dps) {
      rows.push([d.name, d.coach, d.package, d.paid, d.full, d.balance, d.date, d.days])
    }
    rows.push([])
    rows.push([`TOTAL (${dps.length} DPs)`, '', '', totalPaid, totalFull, totalBalance, '', ''])
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `down-payments-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${month}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2 flex-wrap">
        <Wallet size={16} style={{ color: GOLD }} />
        <h3 className="font-semibold text-gray-900">{title}</h3>
        <span className="text-[11px] text-gray-500">{subtitle} · may DP pero di pa fully paid</span>
        <select value={month} onChange={e => setMonth(e.target.value)}
          className="ml-auto rounded-lg border border-gray-200 px-2 py-1 text-xs bg-white">
          <option value="all">Lahat ng buwan</option>
          {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
        <button onClick={exportCSV} disabled={dps.length === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-40"
          style={{ backgroundColor: TEAL }}>
          <Download size={13} /> Export CSV
        </button>
      </div>

      {/* Totals — DP only */}
      <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100">
        <div className="px-4 py-3">
          <div className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">Total DPs</div>
          <div className="text-xl font-bold text-gray-900">{dps.length}</div>
        </div>
        <div className="px-4 py-3">
          <div className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">Naipon (paid)</div>
          <div className="text-xl font-bold" style={{ color: GOLD }}>{formatPHP(totalPaid)}</div>
        </div>
        <div className="px-4 py-3">
          <div className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">Balance to collect</div>
          <div className="text-xl font-bold" style={{ color: TEAL }}>{formatPHP(totalBalance)}</div>
          <div className="text-[11px] text-gray-400">sa ₱{totalFull.toLocaleString()} SRP</div>
        </div>
      </div>

      {dps.length === 0 ? (
        <p className="text-sm text-gray-400 py-6 text-center">Walang naka-down payment (fully paid lahat o walang partial).</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 text-xs uppercase tracking-wide border-b border-gray-100">
                <th className="px-4 py-2 font-semibold">Customer</th>
                <th className="px-3 py-2 font-semibold">Coach</th>
                <th className="px-3 py-2 font-semibold">Package</th>
                <th className="px-3 py-2 font-semibold text-right">Paid</th>
                <th className="px-3 py-2 font-semibold text-right">Balance</th>
                <th className="px-3 py-2 font-semibold">DP date</th>
                <th className="px-3 py-2 font-semibold text-right">Pending</th>
              </tr>
            </thead>
            <tbody>
              {(expanded ? dps : dps.slice(0, PREVIEW_COUNT)).map(d => {
                const a = ageStyle(d.days)
                return (
                  <tr key={d.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-2.5 font-medium text-gray-800">{d.name}</td>
                    <td className="px-3 py-2.5 text-gray-600">{d.coach}</td>
                    <td className="px-3 py-2.5 text-gray-500">{d.package}</td>
                    <td className="px-3 py-2.5 text-right text-gray-700">{formatPHP(d.paid)} <span className="text-gray-400 text-xs">/ {formatPHP(d.full)}</span></td>
                    <td className="px-3 py-2.5 text-right font-semibold" style={{ color: TEAL }}>{formatPHP(d.balance)}</td>
                    <td className="px-3 py-2.5 text-gray-600">{fmtDate(d.date)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${a.cls}`}>
                        <Clock size={11} /> {a.label}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {dps.length > PREVIEW_COUNT && (
            <div className="border-t border-gray-100 text-center">
              <button onClick={() => setExpanded(v => !v)}
                className="w-full py-2.5 text-xs font-semibold hover:bg-gray-50" style={{ color: TEAL }}>
                {expanded ? 'Show less' : `See all ${dps.length} down payments`}
              </button>
            </div>
          )}
          <p className="text-[11px] text-gray-400 px-4 py-2.5">
            Sorted latest DP first{!expanded && dps.length > PREVIEW_COUNT ? ` · showing ${PREVIEW_COUNT} of ${dps.length}` : ''}. Color: <span className="text-emerald-600">≤7d</span> · <span className="text-amber-600">8–30d</span> · <span className="text-red-600">30d+</span> (needs follow-up).
          </p>
        </div>
      )}
    </section>
  )
}
