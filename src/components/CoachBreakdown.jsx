// Automatic per-coach analytics from LIVE YCBM bookings (no upload).
//
// Each booking now carries `coach` (from the YCBM teamMember field — see
// api/ycbm.js BOOKING_FIELDS). We group the period's coaching bookings by
// coach and show booked / showed / no-show / cancelled + a per-coach × slot
// matrix. Attendance = manual mark if set, else YCBM No-Show flag, else
// past→showed (same rule as the Booking Summary).
import { useMemo, useState, useEffect } from 'react'
import { Users, Clock, CheckCircle2, XCircle } from 'lucide-react'
import { getStatus, subscribeAttendance } from '../lib/attendance'

const SLOTS = [
  { h: 10, label: '10AM' }, { h: 14, label: '2PM' }, { h: 15, label: '3PM' },
  { h: 19, label: '7PM' }, { h: 20, label: '8PM' }, { h: 21, label: '9PM' },
]
const SLOT_HOURS = SLOTS.map(s => s.h)
const nearestHour = (h) => SLOT_HOURS.reduce((b, s) => (Math.abs(s - h) < Math.abs(b - h) ? s : b), SLOT_HOURS[0])
const slotLabelFor = (h) => (SLOTS.find(s => s.h === nearestHour(h)) || {}).label
const hourOf = (startsAt) => {
  const m = (startsAt || '').match(/T(\d{2}):/)
  return m ? Number(m[1]) : null
}

export default function CoachBreakdown({ bookings = [], from, to }) {
  const [attBump, setAttBump] = useState(0)
  useEffect(() => subscribeAttendance(() => setAttBump(n => n + 1)), [])

  const agg = useMemo(() => {
    const now = Date.now()
    const a = from ? from.getTime() : -Infinity
    const b = to ? to.getTime() : Infinity
    const att = (bk) => {
      const m = getStatus(bk.id)
      if (m === 'showed' || m === 'no_show') return m
      if (bk.noShow === true) return 'no_show'
      if (new Date(bk.startsAt).getTime() < now) return 'showed'
      return 'upcoming'
    }
    const coaches = new Map()
    let inRange = 0
    for (const bk of bookings) {
      const t = new Date(bk.startsAt).getTime()
      if (t < a || t > b) continue
      inRange++
      const coach = bk.coach || 'Unassigned'
      if (!coaches.has(coach)) coaches.set(coach, { coach, booked: 0, showed: 0, noShow: 0, cancelled: 0, slots: {} })
      const c = coaches.get(coach)
      if (bk.cancelled === true || bk.status === 'Cancelled') { c.cancelled++; continue }
      c.booked++
      const a2 = att(bk)
      if (a2 === 'showed') c.showed++
      else if (a2 === 'no_show') c.noShow++
      const hr = hourOf(bk.startsAt)
      if (hr == null) continue
      const label = slotLabelFor(hr)
      const s = (c.slots[label] = c.slots[label] || { book: 0, showed: 0 })
      s.book++
      if (a2 === 'showed') s.showed++
    }
    return { list: [...coaches.values()].sort((x, y) => y.booked - x.booked), inRange }
  }, [bookings, from, to, attBump])

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Users size={16} style={{ color: '#1B4F4F' }} /> Per Coach</h2>
        <p className="text-[11px] text-gray-500 mt-0.5">Bookings · show-up · per time slot, bawat coach (galing sa YCBM Team — automatic).</p>
      </div>

      <div className="p-5">
        {agg.list.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">Walang coaching bookings sa napiling period.</p>
        ) : (
          <div className="flex flex-col gap-5">
            {/* Per-coach totals */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-400 text-xs uppercase tracking-wide border-b border-gray-100">
                    <th className="py-2 pr-4 font-semibold">Coach</th>
                    <th className="py-2 px-3 font-semibold text-center"><span className="inline-flex items-center gap-1"><Clock size={12} />Booked</span></th>
                    <th className="py-2 px-3 font-semibold text-center"><span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 size={12} />Showed</span></th>
                    <th className="py-2 px-3 font-semibold text-center"><span className="inline-flex items-center gap-1 text-red-500"><XCircle size={12} />No-Show</span></th>
                    <th className="py-2 px-3 font-semibold text-center">Cancelled</th>
                    <th className="py-2 px-3 font-semibold text-center">Show-Up %</th>
                  </tr>
                </thead>
                <tbody>
                  {agg.list.map(c => {
                    const tracked = c.showed + c.noShow
                    const pct = tracked > 0 ? Math.round((c.showed / tracked) * 100) : null
                    return (
                      <tr key={c.coach} className="border-b border-gray-50">
                        <td className="py-2 pr-4 font-medium text-gray-800">{c.coach}</td>
                        <td className="py-2 px-3 text-center font-semibold text-gray-900">{c.booked}</td>
                        <td className="py-2 px-3 text-center text-emerald-700">{c.showed || '—'}</td>
                        <td className="py-2 px-3 text-center text-red-600">{c.noShow || '—'}</td>
                        <td className="py-2 px-3 text-center text-gray-500">{c.cancelled || '—'}</td>
                        <td className="py-2 px-3 text-center">
                          {pct == null ? <span className="text-gray-300">—</span> : (
                            <span className={`font-semibold ${pct >= 70 ? 'text-emerald-600' : pct >= 40 ? 'text-amber-600' : 'text-red-600'}`}>{pct}%</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Per-coach × time-slot matrix (booked · showed) */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">Per Coach × Time Slot (booked · showed)</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="px-3 py-2 text-left text-xs font-bold text-gray-700 uppercase tracking-wide">Coach</th>
                      {SLOTS.map(s => (
                        <th key={s.label} className="px-3 py-2 text-center text-[11px] font-semibold text-gray-600">{s.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {agg.list.map(c => (
                      <tr key={c.coach} className="border-b border-gray-50">
                        <td className="px-3 py-2 font-medium text-gray-800 whitespace-nowrap">{c.coach}</td>
                        {SLOTS.map(s => {
                          const v = c.slots[s.label]
                          return (
                            <td key={s.label} className="px-3 py-2 text-center">
                              {!v ? <span className="text-gray-300">—</span> : (
                                <span className="inline-flex flex-col leading-tight">
                                  <span className="font-semibold text-gray-900">{v.book}</span>
                                  <span className="text-[10px] text-emerald-600">{v.showed} ✓</span>
                                </span>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
