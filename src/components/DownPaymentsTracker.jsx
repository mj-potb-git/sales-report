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

  const dps = useMemo(() => {
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
        paid, full, balance: full - paid, date: r.date, days,
      })
    }
    return out.sort((a, b) => b.days - a.days)   // longest-pending first
  }, [records, nowMs])

  const totalBalance = dps.reduce((s, d) => s + d.balance, 0)
  const totalPaid    = dps.reduce((s, d) => s + d.paid, 0)
  const fmtDate = (d) => new Date(d + (String(d).length <= 10 ? 'T00:00:00' : '')).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2 flex-wrap">
        <Wallet size={16} style={{ color: GOLD }} />
        <h3 className="font-semibold text-gray-900">{title} ({dps.length})</h3>
        <span className="text-[11px] text-gray-500">{subtitle} · partial pa lang ang bayad</span>
        <span className="ml-auto text-xs text-gray-600">
          Balance to collect: <b style={{ color: TEAL }}>{formatPHP(totalBalance)}</b>
          <span className="text-gray-400"> · naipon: {formatPHPCompact(totalPaid)}</span>
        </span>
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
