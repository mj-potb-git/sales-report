// Revenue trend bar chart with a Week / Month / Year toggle, for comparison
// across time (Per Month spans January → present of the current year). Spans
// ALL records (not the period filter) so there are multiple buckets to compare.
// Bars: total Revenue (sum of sales_amount) per bucket. Used by the Officers,
// Acquisition, and AACIO tabs (any records with `date` + `sales_amount`).
import { useMemo, useState } from 'react'
import { BarChart3 } from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import { formatPHP, formatPHPCompact } from '../api/lakbay'

const PRIMARY = '#1B4F4F'
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const dateStr = (r) => (r.date || '').slice(0, 10)   // 'YYYY-MM-DD'

function weekMonday(ds) {
  const [y, m, d] = ds.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  const dow = (dt.getDay() + 6) % 7
  dt.setDate(dt.getDate() - dow)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

const CAP = { week: 16, month: 18, year: 8 }

export default function RevenueTrend({ records = [] }) {
  const [gran, setGran] = useState('month')

  const data = useMemo(() => {
    const m = new Map()
    for (const r of records) {
      const ds = dateStr(r)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ds)) continue
      let key, label
      if (gran === 'year') { key = ds.slice(0, 4); label = key }
      else if (gran === 'week') { key = weekMonday(ds); const [, mm, dd] = key.split('-'); label = `${MONTHS[+mm - 1]} ${+dd}` }
      else { key = ds.slice(0, 7); const [yy, mm] = key.split('-'); label = `${MONTHS[+mm - 1]} '${yy.slice(2)}` }
      if (!m.has(key)) m.set(key, { key, label, Revenue: 0 })
      m.get(key).Revenue += r.sales_amount || 0
    }
    // Per Month: always January → present of the current year (fill empty with 0).
    if (gran === 'month') {
      const d = new Date()
      const yr = d.getFullYear()
      const out = []
      for (let i = 0; i <= d.getMonth(); i++) {
        const key = `${yr}-${String(i + 1).padStart(2, '0')}`
        out.push(m.get(key) || { key, label: `${MONTHS[i]} '${String(yr).slice(2)}`, Revenue: 0 })
      }
      return out
    }
    return [...m.values()].sort((a, b) => a.key.localeCompare(b.key)).slice(-CAP[gran])
  }, [records, gran])

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold text-gray-900 flex items-center gap-2"><BarChart3 size={16} style={{ color: PRIMARY }} /> Revenue Trend</h2>
          <p className="text-[11px] text-gray-500 mt-0.5">Total revenue · comparison across time (lahat ng data)</p>
        </div>
        <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
          {[{ id: 'week', label: 'Per Week' }, { id: 'month', label: 'Per Month' }, { id: 'year', label: 'Per Year' }].map(g => (
            <button key={g.id} onClick={() => setGran(g.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                gran === g.id ? 'bg-white text-[#1B4F4F] shadow-sm font-semibold' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {g.label}
            </button>
          ))}
        </div>
      </div>
      <div className="p-5">
        {data.length === 0 ? (
          <p className="text-sm text-gray-400 py-10 text-center">Walang revenue data.</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#999' }} interval={0} angle={data.length > 10 ? -35 : 0} textAnchor={data.length > 10 ? 'end' : 'middle'} height={data.length > 10 ? 50 : 30} />
              <YAxis tick={{ fontSize: 11, fill: '#999' }} tickFormatter={formatPHPCompact} width={64} />
              <Tooltip formatter={(v) => formatPHP(v)} />
              <Bar dataKey="Revenue" fill={PRIMARY} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  )
}
