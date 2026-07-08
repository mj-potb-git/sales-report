// Down Payments tracker — every partial (DP) sale, tagged to its coach, with
// how long the balance has been outstanding, so MJ can follow up on collections.
// A sale is a Down Payment when the amount paid is below the package's full
// price (Starter ₱9,999 · Travelpreneur ₱14,999 · Adventurer ₱69,990).
import { useMemo, useState } from 'react'
import { Wallet, Clock } from 'lucide-react'
import { formatPHP, formatPHPCompact } from '../api/lakbay'
import { coachFromCluster, packageFullPrice } from '../api/lakbayhub'

const TEAL = '#1B4F4F'
const GOLD = '#F5A623'

// Aging badge — how urgent the follow-up is.
function ageStyle(days) {
  if (days <= 7)  return { cls: 'bg-emerald-100 text-emerald-700', label: `${days}d` }
  if (days <= 30) return { cls: 'bg-amber-100 text-amber-700',     label: `${days}d` }
  return { cls: 'bg-red-100 text-red-700', label: `${days}d` }
}

export default function DownPaymentsTracker({ records = [], title = 'Down Payments', subtitle = 'Sign-up sa LakbayHub' }) {
  const [nowMs] = useState(() => Date.now())
  const [month, setMonth] = useState('all')   // 'all' or 'YYYY-MM'

  const allDps = useMemo(() => {
    const out = []
    for (const r of records) {
      const full = packageFullPrice(r.meta?.package)
      const paid = r.sales_amount || 0
      if (!full || paid <= 0 || paid >= full) continue   // not a partial payment
      if (!r.date) continue                              // no DP date → can't age it
      const t = new Date(r.date).getTime()
      const days = Math.max(0, Math.floor((nowMs - t) / 86400000))
      out.push({
        id: r.transaction_id,
        name: r.customer_name || 'Unknown',
        coach: coachFromCluster(r.team) || '—',
        package: (r.meta?.package || '').replace(/\s*package\s*/i, '').trim() || '—',
        paid, full, balance: full - paid, date: r.date, monthKey: String(r.date).slice(0, 7), days,
      })
    }
    return out.sort((a, b) => b.days - a.days)   // longest-pending first
  }, [records, nowMs])

  // Month options (newest first) derived from the DP dates.
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

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2 flex-wrap">
        <Wallet size={16} style={{ color: GOLD }} />
        <h3 className="font-semibold text-gray-900">{title}</h3>
        <span className="text-[11px] text-gray-500">{subtitle} · partial pa lang ang bayad</span>
        <select value={month} onChange={e => setMonth(e.target.value)}
          className="ml-auto rounded-lg border border-gray-200 px-2 py-1 text-xs bg-white">
          <option value="all">Lahat ng buwan</option>
          {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
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
              {dps.map(d => {
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
          <p className="text-[11px] text-gray-400 px-4 py-2.5">
            Naka-sort by pinakamatagal na naka-pending. Kulay: <span className="text-emerald-600">≤7d</span> · <span className="text-amber-600">8–30d</span> · <span className="text-red-600">30d+</span> (dapat na i-follow up).
          </p>
        </div>
      )}
    </section>
  )
}
