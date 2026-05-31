// Scheduling Insights — answers "which DAY and TIME get the most bookings and
// the best show-up rate?" so the manager can adjust the team's schedule.
//
// Source: YCBM bookings (startsAt → day-of-week + hour) + YCBM `noShow` flag.
//   showed   = appointment is past AND not flagged no-show
//   no-show  = noShow === true
//   upcoming = future appointment (excluded from rate denominators)
// Show-Up Rate = showed / (showed + no-show), computed only over appointments
// that have actually occurred (decided), so upcoming ones don't dilute it.

import { useMemo } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from 'recharts'
import { CalendarDays, Clock, TrendingUp, Sparkles } from 'lucide-react'

const TEAL = '#1B4F4F'
const GOLD = '#F5A623'

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
// Present Monday-first (business week)
const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0]

function hourLabel(h) {
  return h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`
}

function isCancelled(b) {
  return Boolean(b.raw?.cancelled || b.status === 'Cancelled')
}

// Derive attendance from YCBM's own noShow flag (+ past/future).
function statusOf(b, nowMs) {
  if (b.noShow === true) return 'no_show'
  if (new Date(b.startsAt).getTime() < nowMs) return 'showed'
  return 'upcoming'
}

function rate(showed, noShow) {
  const d = showed + noShow
  return d > 0 ? Math.round((showed / d) * 100) : null
}

// Color a show-up rate cell (green good → red poor)
function rateColor(r) {
  if (r === null) return '#f3f4f6'
  if (r >= 60) return '#bbf7d0'      // green-200
  if (r >= 40) return '#fef08a'      // yellow-200
  if (r >= 20) return '#fed7aa'      // orange-200
  return '#fecaca'                    // red-200
}
function rateText(r) {
  if (r === null) return '#9ca3af'
  if (r >= 60) return '#166534'
  if (r >= 40) return '#854d0e'
  if (r >= 20) return '#9a3412'
  return '#991b1b'
}

export default function SchedulingInsights({ bookings = [], nowMs }) {
  const active = useMemo(() => bookings.filter(b => !isCancelled(b)), [bookings])

  // --- By day of week ---
  const byDay = useMemo(() => {
    const m = {}
    for (const d of DOW_ORDER) m[d] = { dow: d, bookings: 0, showed: 0, noShow: 0, upcoming: 0 }
    for (const b of active) {
      const d = new Date(b.startsAt).getDay()
      const row = m[d]; if (!row) continue
      row.bookings++
      const s = statusOf(b, nowMs)
      if (s === 'showed') row.showed++
      else if (s === 'no_show') row.noShow++
      else row.upcoming++
    }
    return DOW_ORDER.map(d => {
      const r = m[d]
      return { ...r, label: DOW[d], showUpRate: rate(r.showed, r.noShow), decided: r.showed + r.noShow }
    })
  }, [active, nowMs])

  // --- By hour / time slot ---
  const byHour = useMemo(() => {
    const m = new Map()
    for (const b of active) {
      const h = new Date(b.startsAt).getHours()
      if (!m.has(h)) m.set(h, { hour: h, bookings: 0, showed: 0, noShow: 0, upcoming: 0 })
      const row = m.get(h)
      row.bookings++
      const s = statusOf(b, nowMs)
      if (s === 'showed') row.showed++
      else if (s === 'no_show') row.noShow++
      else row.upcoming++
    }
    return [...m.values()]
      .sort((a, b) => a.hour - b.hour)
      .map(r => ({ ...r, label: hourLabel(r.hour), showUpRate: rate(r.showed, r.noShow), decided: r.showed + r.noShow }))
  }, [active, nowMs])

  // --- Day × Hour heatmap (only hours that actually have bookings) ---
  const hours = useMemo(() => byHour.map(h => h.hour), [byHour])
  const heat = useMemo(() => {
    const grid = {}
    for (const d of DOW_ORDER) { grid[d] = {}; for (const h of hours) grid[d][h] = { bookings: 0, showed: 0, noShow: 0 } }
    for (const b of active) {
      const dt = new Date(b.startsAt)
      const d = dt.getDay(), h = dt.getHours()
      if (!grid[d] || !grid[d][h]) continue
      grid[d][h].bookings++
      const s = statusOf(b, nowMs)
      if (s === 'showed') grid[d][h].showed++
      else if (s === 'no_show') grid[d][h].noShow++
    }
    return grid
  }, [active, hours, nowMs])

  // --- Headline insights ---
  const insights = useMemo(() => {
    const busiestDay = [...byDay].sort((a, b) => b.bookings - a.bookings)[0]
    const busiestHour = [...byHour].sort((a, b) => b.bookings - a.bookings)[0]
    // best show-up rate among days/hours with a meaningful sample (≥5 decided)
    const SAMPLE = 5
    const bestDay = [...byDay].filter(d => d.decided >= SAMPLE && d.showUpRate !== null)
      .sort((a, b) => b.showUpRate - a.showUpRate)[0]
    const bestHour = [...byHour].filter(h => h.decided >= SAMPLE && h.showUpRate !== null)
      .sort((a, b) => b.showUpRate - a.showUpRate)[0]
    const worstHour = [...byHour].filter(h => h.decided >= SAMPLE && h.showUpRate !== null)
      .sort((a, b) => a.showUpRate - b.showUpRate)[0]
    return { busiestDay, busiestHour, bestDay, bestHour, worstHour }
  }, [byDay, byHour])

  if (active.length === 0) {
    return (
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center text-gray-400">
        No bookings in this period to analyze.
      </section>
    )
  }

  const maxDayBookings = Math.max(1, ...byDay.map(d => d.bookings))

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <CalendarDays size={16} style={{ color: TEAL }} /> Scheduling Insights — Best Days &amp; Times
        </h2>
        <p className="text-[11px] text-gray-500 mt-0.5">
          When do leads book most, and when do they actually show up? Use this to set the team’s schedule.
          Show-Up Rate is computed only over appointments that already happened.
        </p>
      </div>

      {/* Headline chips */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 p-5 pb-2">
        <InsightChip icon={CalendarDays} tone="#E6F0F0" label="Busiest day"
          value={insights.busiestDay ? insights.busiestDay.label : '—'}
          sub={insights.busiestDay ? `${insights.busiestDay.bookings} bookings` : ''} />
        <InsightChip icon={Clock} tone="#E6F0F0" label="Busiest time"
          value={insights.busiestHour ? insights.busiestHour.label : '—'}
          sub={insights.busiestHour ? `${insights.busiestHour.bookings} bookings` : ''} />
        <InsightChip icon={TrendingUp} tone="#dcfce7" label="Best show-up time"
          value={insights.bestHour ? insights.bestHour.label : '—'}
          sub={insights.bestHour ? `${insights.bestHour.showUpRate}% show-up` : 'need more data'} />
        <InsightChip icon={Sparkles} tone="#FFF4E0" label="Best show-up day"
          value={insights.bestDay ? insights.bestDay.label : '—'}
          sub={insights.bestDay ? `${insights.bestDay.showUpRate}% show-up` : 'need more data'} />
      </div>

      {/* By day of week */}
      <div className="px-5 py-4 grid lg:grid-cols-2 gap-6">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">By Day of Week</h3>
          <div className="space-y-1.5">
            {byDay.map(d => (
              <div key={d.dow} className="flex items-center gap-2 text-xs">
                <span className="w-9 font-semibold text-gray-700">{d.label}</span>
                <div className="flex-1 bg-gray-100 rounded-md h-6 relative overflow-hidden">
                  <div className="h-full rounded-md flex items-center px-2 text-white font-semibold"
                       style={{ width: `${Math.max(8, (d.bookings / maxDayBookings) * 100)}%`, backgroundColor: TEAL }}>
                    {d.bookings}
                  </div>
                </div>
                <span className="w-28 text-right text-gray-500">
                  {d.showUpRate === null ? '—' : (
                    <><span className="font-bold" style={{ color: rateText(d.showUpRate) }}>{d.showUpRate}%</span> show-up</>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* By time slot */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">By Time Slot</h3>
          <ResponsiveContainer width="100%" height={Math.max(160, byHour.length * 34)}>
            <BarChart data={byHour} layout="vertical" margin={{ left: 8, right: 28, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} width={48} />
              <Tooltip formatter={(v, n) => [v, n === 'bookings' ? 'Bookings' : n]}
                       labelFormatter={l => `${l}`} />
              <Bar dataKey="bookings" radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 11, fill: '#6b7280' }}>
                {byHour.map((h, i) => (
                  <Cell key={i} fill={h.showUpRate !== null && h.showUpRate >= 50 ? GOLD : TEAL} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="text-[10px] text-gray-400 mt-1">
            <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ backgroundColor: GOLD }} />
            gold = ≥50% show-up rate
          </p>
        </div>
      </div>

      {/* Day × Time heatmap */}
      <div className="px-5 py-4 border-t border-gray-100">
        <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">
          Day × Time — Show-Up Rate (booking count inside)
        </h3>
        <div className="overflow-x-auto">
          <table className="border-collapse text-xs">
            <thead>
              <tr>
                <th className="px-2 py-1.5 text-left text-gray-500 font-semibold sticky left-0 bg-white">Day \ Time</th>
                {hours.map(h => (
                  <th key={h} className="px-2 py-1.5 text-center text-gray-600 font-semibold whitespace-nowrap">{hourLabel(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DOW_ORDER.map(d => (
                <tr key={d}>
                  <th className="px-2 py-1.5 text-left text-gray-700 font-semibold sticky left-0 bg-white whitespace-nowrap">{DOW[d]}</th>
                  {hours.map(h => {
                    const cell = heat[d][h]
                    const r = rate(cell.showed, cell.noShow)
                    return (
                      <td key={h} className="px-1 py-1 text-center" style={{ minWidth: 56 }}>
                        <div className="rounded-md py-1.5 px-1 leading-tight"
                             style={{ backgroundColor: rateColor(r), color: rateText(r) }}
                             title={`${DOW[d]} ${hourLabel(h)} · ${cell.bookings} bookings · ${cell.showed} showed / ${cell.noShow} no-show`}>
                          <div className="font-bold">{r === null ? '—' : `${r}%`}</div>
                          <div className="text-[9px] opacity-70">{cell.bookings} bk</div>
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-gray-400 mt-2">
          Each cell = show-up rate for that day+time · “bk” = total bookings in that slot ·
          green ≥60% · yellow 40–59% · orange 20–39% · red &lt;20% · grey = no decided appointments yet.
        </p>
      </div>
    </section>
  )
}

function InsightChip({ icon: Icon, label, value, sub, tone }) {
  return (
    <div className="rounded-xl border border-gray-100 p-3 flex flex-col gap-1">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: tone }}>
        <Icon size={15} style={{ color: TEAL }} />
      </div>
      <span className="text-[11px] text-gray-500">{label}</span>
      <span className="text-lg font-bold text-gray-900 leading-none">{value}</span>
      {sub && <span className="text-[11px] text-gray-400">{sub}</span>}
    </div>
  )
}
