// Bookings trend bar chart with a Week / Month / Year toggle, for comparison
// across time (e.g. 2026 per month). Spans ALL bookings (not the period filter)
// so there are multiple buckets to compare. Bars: Booked vs Showed per bucket.
import { useMemo, useState, useEffect } from 'react'
import { BarChart3 } from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { getStatus, subscribeAttendance } from '../lib/attendance'

const PRIMARY = '#1B4F4F'
const GOLD = '#F5A623'
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const dateOf = (startsAt) => (startsAt || '').slice(0, 10)   // 'YYYY-MM-DD'

function weekMonday(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  const dow = (dt.getDay() + 6) % 7          // Mon=0 … Sun=6
  dt.setDate(dt.getDate() - dow)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

function attShowed(b, now) {
  const m = getStatus(b.id)
  if (m === 'showed') return true
  if (m === 'no_show') return false
  if (b.noShow === true) return false
  return new Date(b.startsAt).getTime() < now
}

// Max buckets to render per granularity (most-recent kept) so it stays readable.
const CAP = { week: 16, month: 18, year: 8 }

export default function BookingTrend({ bookings = [] }) {
  const [gran, setGran] = useState('month')
  const [attBump, setAttBump] = useState(0)
  useEffect(() => subscribeAttendance(() => setAttBump(n => n + 1)), [])

  const data = useMemo(() => {
    const now = Date.now()
    const m = new Map()
    for (const b of bookings) {
      if (b.cancelled === true || b.status === 'Cancelled') continue
      const ds = dateOf(b.startsAt)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ds)) continue
      let key, label
      if (gran === 'year') { key = ds.slice(0, 4); label = key }
      else if (gran === 'week') { key = weekMonday(ds); const [, mm, dd] = key.split('-'); label = `${MONTHS[+mm - 1]} ${+dd}` }
      else { key = ds.slice(0, 7); const [yy, mm] = key.split('-'); label = `${MONTHS[+mm - 1]} '${yy.slice(2)}` }
      if (!m.has(key)) m.set(key, { key, label, Booked: 0, Showed: 0 })
      const g = m.get(key); g.Booked++
      if (attShowed(b, now)) g.Showed++
    }
    return [...m.values()].sort((a, b) => a.key.localeCompare(b.key)).slice(-CAP[gran])
  }, [bookings, gran, attBump])

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold text-gray-900 flex items-center gap-2"><BarChart3 size={16} style={{ color: PRIMARY }} /> Bookings Trend</h2>
          <p className="text-[11px] text-gray-500 mt-0.5">Booked vs Showed · comparison across time (lahat ng data)</p>
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
          <p className="text-sm text-gray-400 py-10 text-center">Walang bookings data.</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#999' }} interval={0} angle={data.length > 10 ? -35 : 0} textAnchor={data.length > 10 ? 'end' : 'middle'} height={data.length > 10 ? 50 : 30} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#999' }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Booked" fill={PRIMARY} radius={[4, 4, 0, 0]} />
              <Bar dataKey="Showed" fill={GOLD} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  )
}
