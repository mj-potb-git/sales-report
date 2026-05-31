// Detailed Sales Breakdown — "how much has each closer/team sold?" for the
// selected period (daily / weekly / monthly / custom — driven by the parent).
//
// NOTE on attribution: LakbayHub's `sales_closer` field is currently 100%
// "Unassigned", but the CLUSTER name encodes the closer (e.g.
// "ACQUISITION - MARIA"). So the per-person view groups by cluster/team — that
// is where the real attribution lives until Fusioo is wired in.

import { useMemo, useState } from 'react'
import { Wallet, Download } from 'lucide-react'
import { formatPHP, formatPHPCompact } from '../../api/lakbay'

const TEAL = '#1B4F4F'
const GOLD = '#F5A623'

const DIMENSIONS = [
  { id: 'cluster', label: 'By Closer / Cluster', keyOf: r => r.team || 'No Cluster' },
  { id: 'package', label: 'By Package',          keyOf: r => r.meta?.package || 'No Package' },
]

function groupSum(records, keyOf) {
  const m = new Map()
  for (const r of records) {
    const k = keyOf(r)
    if (!m.has(k)) m.set(k, { name: k, sales: 0, count: 0 })
    const g = m.get(k)
    g.sales += r.sales_amount || 0
    g.count += 1
  }
  return [...m.values()]
    .map(g => ({ ...g, avg: g.count ? Math.round(g.sales / g.count) : 0 }))
    .sort((a, b) => b.sales - a.sales)
}

export default function SalesBreakdown({ records = [], periodLabel = '' }) {
  const [dim, setDim] = useState('cluster')
  const dimension = DIMENSIONS.find(d => d.id === dim) ?? DIMENSIONS[0]

  const rows = useMemo(() => groupSum(records, dimension.keyOf), [records, dimension])
  const totalSales = useMemo(() => records.reduce((a, r) => a + (r.sales_amount || 0), 0), [records])
  const totalCount = records.length
  const avg = totalCount ? Math.round(totalSales / totalCount) : 0
  const maxSales = Math.max(1, ...rows.map(r => r.sales))

  function exportCSV() {
    const header = [dimension.label.replace('By ', ''), 'Total Sales (PHP)', '# Sales', 'Avg (PHP)', 'Share %']
    const lines = rows.map(r => [
      `"${r.name}"`,
      r.sales,
      r.count,
      r.avg,
      totalSales ? Math.round((r.sales / totalSales) * 100) : 0,
    ].join(','))
    const csv = [header.join(','), ...lines, '', `"TOTAL",${totalSales},${totalCount},${avg},100`].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `detailed-sales-${dim}-${periodLabel.replace(/\s+/g, '-').toLowerCase() || 'period'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-5 rounded-full" style={{ backgroundColor: TEAL }} />
          <div>
            <h2 className="font-semibold text-gray-900">Detailed Sales Breakdown</h2>
            <p className="text-[11px] text-gray-500 mt-0.5">
              How much each closer/cluster sold {periodLabel ? `· ${periodLabel}` : ''}
            </p>
          </div>
        </div>
        <button
          onClick={exportCSV}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition hover:opacity-90"
          style={{ backgroundColor: TEAL }}
        >
          <Download size={14} /> Export CSV
        </button>
      </div>

      {/* Overall totals */}
      <div className="grid grid-cols-3 gap-3 p-5 pb-2">
        <Stat icon={Wallet} label="Overall Sales" value={formatPHP(totalSales)} tone="#dcfce7" />
        <Stat label="# of Sales" value={String(totalCount)} tone="#E6F0F0" />
        <Stat label="Avg per Sale" value={formatPHPCompact(avg)} tone="#FFF4E0" />
      </div>

      {/* Dimension toggle */}
      <div className="px-5 pt-1">
        <div className="inline-flex bg-gray-100 rounded-xl p-1 gap-1">
          {DIMENSIONS.map(d => (
            <button
              key={d.id}
              onClick={() => setDim(d.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                dim === d.id ? 'bg-white shadow-sm font-semibold' : 'text-gray-500 hover:text-gray-700'
              }`}
              style={dim === d.id ? { color: TEAL } : undefined}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {/* Breakdown table */}
      <div className="p-5 pt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50">
              {['#', dimension.label.replace('By ', ''), 'Total Sales', '# Sales', 'Avg', 'Share'].map(h => (
                <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400">No sales in this period</td></tr>
            ) : rows.map((r, i) => {
              const share = totalSales ? Math.round((r.sales / totalSales) * 100) : 0
              return (
                <tr key={r.name} className="hover:bg-gray-50 transition-colors">
                  <td className="px-3 py-2.5">
                    <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${
                      i === 0 ? 'bg-amber-100 text-amber-700' :
                      i === 1 ? 'bg-gray-200 text-gray-700' :
                      i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'
                    }`}>{i + 1}</span>
                  </td>
                  <td className="px-3 py-2.5 font-medium text-gray-900">{r.name}</td>
                  <td className="px-3 py-2.5 font-bold text-gray-900 whitespace-nowrap">{formatPHP(r.sales)}</td>
                  <td className="px-3 py-2.5 text-gray-600">{r.count}</td>
                  <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{formatPHPCompact(r.avg)}</td>
                  <td className="px-3 py-2.5 w-40">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${Math.max(4, (r.sales / maxSales) * 100)}%`, backgroundColor: i === 0 ? GOLD : TEAL }} />
                      </div>
                      <span className="text-xs text-gray-500 w-9 text-right">{share}%</span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-gray-200 font-bold text-gray-900 bg-gray-50">
                <td className="px-3 py-2.5" />
                <td className="px-3 py-2.5">TOTAL</td>
                <td className="px-3 py-2.5 whitespace-nowrap">{formatPHP(totalSales)}</td>
                <td className="px-3 py-2.5">{totalCount}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">{formatPHPCompact(avg)}</td>
                <td className="px-3 py-2.5">100%</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  )
}

function Stat({ icon: Icon, label, value, tone }) {
  return (
    <div className="rounded-xl border border-gray-100 p-3">
      <div className="flex items-center gap-2">
        {Icon && (
          <span className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: tone }}>
            <Icon size={14} style={{ color: TEAL }} />
          </span>
        )}
        <span className="text-[11px] text-gray-500">{label}</span>
      </div>
      <p className="text-xl font-bold text-gray-900 mt-1.5 truncate" title={value}>{value}</p>
    </div>
  )
}
