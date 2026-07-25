// Per-agent Down Payments & Accounts Receivable (AR) for the Officers tab.
// Fusioo booking transactions carry the actual cash paid + the outstanding
// balance (AR). This section lists, per Account Officer, the installments that
// still have money to collect — so each officer sees exactly what they need to
// follow up on (sisingilin).
import { useMemo, useState } from 'react'
import { Wallet, ChevronDown, ChevronRight, Download } from 'lucide-react'
import { formatPHP, formatPHPCompact } from '../api/lakbay'

const TEAL = '#1B4F4F'
const GOLD = '#F5A623'

export default function OfficerReceivables({ records = [], periodLabel = '' }) {
  const [open, setOpen] = useState({})

  const byAgent = useMemo(() => {
    const withBalance = records.filter(r => (r.receivable || 0) > 0)
    const m = new Map()
    for (const r of withBalance) {
      const k = r.sales_agent || 'Unassigned'
      if (!m.has(k)) m.set(k, { agent: k, team: r.team || '', paid: 0, ar: 0, srp: 0, txns: [] })
      const g = m.get(k)
      g.paid += r.sales_amount || 0
      g.ar   += r.receivable || 0
      g.srp  += r.srp || 0
      g.txns.push(r)
    }
    const arr = [...m.values()].map(g => ({
      ...g,
      txns: g.txns.sort((a, b) => String(b.date).localeCompare(String(a.date))),
    }))
    arr.sort((a, b) => b.ar - a.ar)
    return arr
  }, [records])

  const totalAR   = byAgent.reduce((s, a) => s + a.ar, 0)
  const totalPaid = byAgent.reduce((s, a) => s + a.paid, 0)
  const totalCount = byAgent.reduce((s, a) => s + a.txns.length, 0)

  const fmtDate = (d) => d ? new Date(d + (String(d).length <= 10 ? 'T00:00:00' : '')).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
  const pkgOf = (r) => (r.meta?.type_of_package || '').replace(/\s*package\s*/i, '').trim() || '—'

  function exportCSV() {
    const rows = [['POTB No.', 'Agent', 'Team', 'Date', 'Package', 'Paid (DP)', 'Balance (AR)', 'Total (SRP)']]
    for (const a of byAgent) for (const r of a.txns) {
      rows.push([r.meta?.gdx ?? '', a.agent, a.team, r.date, pkgOf(r), r.sales_amount, r.receivable, r.srp])
    }
    rows.push([])
    rows.push([`TOTAL · ${totalCount} accounts`, '', '', '', '', totalPaid, totalAR, ''])
    const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a'); a.href = url; a.download = `officer-receivables-${periodLabel || 'all'}.csv`.replace(/\s+/g, '-'); a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2 flex-wrap">
        <Wallet size={16} style={{ color: GOLD }} />
        <h3 className="font-semibold text-gray-900">Down Payments &amp; Accounts Receivable</h3>
        <span className="text-[11px] text-gray-500">per agent · DP/installment na may balance na sisingilin{periodLabel ? ` · ${periodLabel}` : ''}</span>
        <button onClick={exportCSV} disabled={totalCount === 0}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-40" style={{ backgroundColor: TEAL }}>
          <Download size={13} /> Export CSV
        </button>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100">
        <div className="px-4 py-3">
          <div className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">Accounts (DP)</div>
          <div className="text-xl font-bold text-gray-900">{totalCount}</div>
        </div>
        <div className="px-4 py-3">
          <div className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">Naipon (paid)</div>
          <div className="text-xl font-bold" style={{ color: GOLD }}>{formatPHP(totalPaid)}</div>
        </div>
        <div className="px-4 py-3">
          <div className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">AR — sisingilin</div>
          <div className="text-xl font-bold" style={{ color: TEAL }}>{formatPHP(totalAR)}</div>
        </div>
      </div>

      {byAgent.length === 0 ? (
        <p className="text-sm text-gray-400 py-6 text-center">Walang natitirang balance — bayad na lahat (o walang installment sa period).</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {byAgent.map(a => {
            const isOpen = open[a.agent]
            return (
              <div key={a.agent}>
                <button onClick={() => setOpen(o => ({ ...o, [a.agent]: !o[a.agent] }))}
                  className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-gray-50 text-left">
                  {isOpen ? <ChevronDown size={15} className="text-gray-400" /> : <ChevronRight size={15} className="text-gray-400" />}
                  <span className="font-medium text-gray-800 flex-1 truncate">{a.agent}</span>
                  <span className="text-xs text-gray-500">{a.txns.length} acct{a.txns.length > 1 ? 's' : ''}</span>
                  <span className="text-xs text-gray-400 ml-2">paid <b className="text-gray-700">{formatPHPCompact(a.paid)}</b></span>
                  <span className="text-sm font-bold ml-3" style={{ color: TEAL }}>AR {formatPHP(a.ar)}</span>
                </button>
                {isOpen && (
                  <div className="overflow-x-auto bg-gray-50/40">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-[10px] uppercase tracking-wide text-gray-400">
                          <th className="px-4 py-1.5 font-semibold">POTB No.</th>
                          <th className="px-3 py-1.5 font-semibold">Date</th>
                          <th className="px-3 py-1.5 font-semibold">Package</th>
                          <th className="px-3 py-1.5 font-semibold text-right">Paid (DP)</th>
                          <th className="px-3 py-1.5 font-semibold text-right">Balance (AR)</th>
                          <th className="px-3 py-1.5 font-semibold text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {a.txns.map(r => (
                          <tr key={r.transaction_id} className="border-t border-gray-100">
                            <td className="px-4 py-1.5 font-mono text-xs font-semibold text-[#1B4F4F] whitespace-nowrap">{r.meta?.gdx ?? '—'}</td>
                            <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{fmtDate(r.date)}</td>
                            <td className="px-3 py-1.5 text-gray-500">{pkgOf(r)}</td>
                            <td className="px-3 py-1.5 text-right text-gray-700">{formatPHP(r.sales_amount)}</td>
                            <td className="px-3 py-1.5 text-right font-semibold" style={{ color: TEAL }}>{formatPHP(r.receivable)}</td>
                            <td className="px-3 py-1.5 text-right text-gray-400">{formatPHP(r.srp)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
