import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { Package } from 'lucide-react'
import { aggregateBy, formatPHP, formatPHPCompact } from '../../api/lakbay'

const PALETTE = ['#1B4F4F', '#F5A623', '#4ECDC4', '#7FB069', '#C26DBC', '#6D9EEB']

export default function PackagePerformance({ records }) {
  const data = aggregateBy(records, 'meta.package')
  if (data.length === 0) {
    return null
  }
  const total = data.reduce((a, b) => a + b.sales, 0)

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-base font-semibold text-gray-800">Package Performance</h2>
        <span className="text-xs text-gray-500">· {data.length} packages</span>
      </div>
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <ResponsiveContainer width="100%" height={Math.max(180, data.length * 36)}>
          <BarChart data={data} layout="vertical" margin={{ left: 10, right: 16 }}>
            <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={formatPHPCompact} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={160} />
            <Tooltip formatter={v => formatPHP(v)} />
            <Bar dataKey="sales" radius={[0, 4, 4, 0]}>
              {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3 pt-3 border-t border-gray-100">
          {data.slice(0, 6).map((d, i) => (
            <div key={d.name} className="flex items-start gap-2 min-w-0">
              <Package size={14} style={{ color: PALETTE[i % PALETTE.length] }} className="mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-gray-900 truncate" title={d.name}>{d.name}</p>
                <p className="text-[11px] text-gray-500">
                  {d.count} sold · {total > 0 ? Math.round((d.sales / total) * 100) : 0}%
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
