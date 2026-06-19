// Per-coach "Sales Performance" cards for the Acquisition tab — combines
// LakbayHub sign-up sales (Availed + SRP) with YCBM bookings (Appointment /
// Show Up / No Show) for the SELECTED period, so picking a month regenerates it.
//
// Matched by coach first name: LakbayHub cluster "ACQUISITION - MARTIN" ↔ YCBM
// teamMember "Martin of Pinoy Online Travel Biz". Formulas (per MJ's report):
//   Closing Rate = Availed ÷ Show Up        Show Up Rate = Show Up ÷ Appointment
import { useMemo, useState, useEffect } from 'react'
import { Award } from 'lucide-react'
import { formatPHP } from '../api/lakbay'
import { getStatus, subscribeAttendance } from '../lib/attendance'

const PRIMARY = '#1B4F4F'
const GOLD = '#F5A623'

// Extract the coach name from a cluster name across both audiences:
//   "ACQUISITION - MARTIN" · "AACIO MARTIN" · "AACIO EXTERNAL COACH - RAFAEL"
//   · "EXTERNAL COACH - MICHAEL"  → the coach. Non-coach clusters → null.
function coachFromCluster(team) {
  const t = (team || '').trim()
  let m
  if ((m = t.match(/external\s+coach\s*-\s*(.+)$/i))) return m[1].trim()
  if ((m = t.match(/^acquisition\s*-\s*(.+)$/i)))     return m[1].trim()
  if ((m = t.match(/^aacio\s+(.+)$/i)))               return m[1].trim()
  return null
}
const titleCase = (s) => (s || '').split(/\s+/).map(w => w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w).join(' ')
// Match key = first name (first token), uppercase — bridges "Michael Sy" ↔
// "EXTERNAL COACH - MICHAEL". (Acquisition coaches are single names, unaffected.)
const coachKey = (name) => (name || '').trim().split(/\s+/)[0].toUpperCase()

function attOf(b, now) {
  const m = getStatus(b.id)
  if (m === 'showed' || m === 'no_show') return m
  if (b.noShow === true) return 'no_show'
  if (new Date(b.startsAt).getTime() < now) return 'showed'
  return 'upcoming'
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between text-sm py-0.5">
      <span className="text-white/70 text-xs font-medium uppercase tracking-wide">{label}</span>
      <span className="font-bold text-white">{value}</span>
    </div>
  )
}

export default function SalesPerformanceCards({ salesRecords = [], bookings = [], from, to, periodLabel }) {
  const [attBump, setAttBump] = useState(0)
  useEffect(() => subscribeAttendance(() => setAttBump(n => n + 1)), [])

  const coaches = useMemo(() => {
    const now = Date.now()
    const a = from ? from.getTime() : -Infinity
    const b = to ? to.getTime() : Infinity
    const map = new Map()
    const get = (key) => {
      if (!map.has(key)) map.set(key, { key, name: titleCase(key), availed: 0, srp: 0, appt: 0, showup: 0, noshow: 0 })
      return map.get(key)
    }
    // LakbayHub: Availed (count) + SRP (sum) per coach cluster
    for (const r of salesRecords) {
      const coach = coachFromCluster(r.team)
      if (!coach) continue
      const c = get(coachKey(coach))
      if (c.name === titleCase(c.key)) c.name = titleCase(coach)  // nicer than the key
      c.availed += 1
      c.srp += r.sales_amount || 0
    }
    // YCBM: Appointment / Show Up / No Show per coach (teamMember), in [from,to]
    for (const bk of bookings) {
      if (!bk.coach) continue
      if (bk.cancelled === true || bk.status === 'Cancelled') continue
      const t = new Date(bk.startsAt).getTime()
      if (t < a || t > b) continue
      const c = get(coachKey(bk.coach))
      c.name = bk.coach            // prefer YCBM's nicely-cased full name
      c.appt += 1
      const att = attOf(bk, now)
      if (att === 'showed') c.showup += 1
      else if (att === 'no_show') c.noshow += 1
    }
    return [...map.values()]
      .map(c => ({
        ...c,
        closingRate: c.showup > 0 ? (c.availed / c.showup) * 100 : null,
        showUpRate: c.appt > 0 ? (c.showup / c.appt) * 100 : null,
      }))
      .sort((x, y) => y.srp - x.srp || y.availed - x.availed)
  }, [salesRecords, bookings, from, to, attBump])

  return (
    <section>
      <h2 className="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">
        <Award size={16} style={{ color: GOLD }} /> Sales Performance · {periodLabel}
        <span className="text-[11px] font-normal text-gray-400">(per coach · LakbayHub + YCBM)</span>
      </h2>
      {coaches.length === 0 ? (
        <p className="text-sm text-gray-400 py-6 text-center bg-white rounded-2xl border border-gray-100">
          Walang per-coach data sa napiling period.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {coaches.map(c => (
            <div key={c.key} className="rounded-2xl p-4 shadow-sm"
                 style={{ background: `linear-gradient(135deg, ${PRIMARY} 0%, #0f3a3a 100%)` }}>
              <h3 className="text-lg font-extrabold tracking-wide mb-2" style={{ color: GOLD }}>{c.name}</h3>
              <Row label="No. Availed" value={c.availed} />
              <Row label="SRP" value={formatPHP(c.srp)} />
              <Row label="Appointment" value={c.appt} />
              <Row label="Show Up" value={c.showup} />
              <Row label="No Show" value={c.noshow} />
              <div className="mt-1.5 pt-1.5 border-t border-white/15">
                <Row label="Closing Rate" value={c.closingRate == null ? '—' : `${c.closingRate.toFixed(2)}%`} />
                <Row label="Show Up Rate" value={c.showUpRate == null ? '—' : `${c.showUpRate.toFixed(2)}%`} />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
