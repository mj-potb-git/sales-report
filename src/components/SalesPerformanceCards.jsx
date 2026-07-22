// Per-coach "Sales Performance" cards.
//   • Availed + SRP  ← LakbayHub sign-up sales (salesRecords)
//   • Appointment / Show Up / No Show ← `bookings` (the parent merges the live
//     API with any accumulated uploaded YCBM report — report wins, so when a
//     report is uploaded these are EXACT; otherwise it's the live API).
// Show Up Rate = Show Up ÷ (Show Up + No Show) — concluded appointments only.
// Closing Rate = No. Availed (closed sales, LakbayHub) ÷ Appointments (YCBM) —
//   of the appointments booked under the coach, how many became sales. Uses
//   appointments (not show-ups) as the base because sales and show-ups are
//   different sources/date-bases; show-ups produced absurd >100% rates.
import { useMemo, useState, useEffect } from 'react'
import { Award } from 'lucide-react'
import { formatPHP } from '../api/lakbay'
import { packageFullPrice } from '../api/lakbayhub'
import { getStatus, subscribeAttendance } from '../lib/attendance'

const PRIMARY = '#1B4F4F'
const GOLD = '#F5A623'

function coachFromCluster(team) {
  const t = (team || '').trim()
  let m
  if ((m = t.match(/external\s+coach\s*-\s*(.+)$/i))) return m[1].trim()
  if ((m = t.match(/^acquisition\s*-\s*(.+)$/i)))     return m[1].trim()
  if ((m = t.match(/^aacio\s+(.+)$/i)))               return m[1].trim()
  return null
}
const titleCase = (s) => (s || '').split(/\s+/).map(w => w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w).join(' ')
const coachKey = (name) => (name || '').trim().split(/\s+/)[0].toUpperCase()

// Attendance per booking. Per MJ's actual YCBM workflow: a no-show is explicitly
// marked (noShow=true), a show is marked "finished", a cancel is cancelled. The
// only reliable positive signal is noShow===true — so a PAST appointment that is
// NOT flagged no-show was finished = SHOWED. Future unmarked = upcoming (excluded).
// A manual mark always wins.
function attOf(b, now) {
  const m = getStatus(b.id)
  if (m === 'showed' || m === 'no_show') return m
  if (b.noShow === true) return 'no_show'
  if (b.noShow === false) return 'showed'
  if (new Date(b.startsAt).getTime() < now) return 'showed' // past & not flagged no-show = showed (finished)
  return 'upcoming'
}

export default function SalesPerformanceCards({
  salesRecords = [], bookings = [], from, to, periodLabel, aliases = {}, loading = false,
}) {
  const [attBump, setAttBump] = useState(0)
  const [nowMs] = useState(() => Date.now()) // stable "now" — avoid impure Date.now() in render
  useEffect(() => subscribeAttendance(() => setAttBump(n => n + 1)), [])

  const resolve = (rawName) => {
    const k = coachKey(rawName)
    const canon = aliases[k]
    return canon ? { key: coachKey(canon), name: canon } : { key: k, name: null }
  }

  const coaches = useMemo(() => {
    const now = nowMs
    const a = from ? from.getTime() : -Infinity
    const b = to ? to.getTime() : Infinity
    const map = new Map()
    const get = (key, fallback) => {
      if (!map.has(key)) map.set(key, { key, name: fallback || titleCase(key), availed: 0, srp: 0, appt: 0, showup: 0, noshow: 0, cancelled: 0 })
      return map.get(key)
    }
    for (const r of salesRecords) {
      const coach = coachFromCluster(r.team); if (!coach) continue
      const { key, name } = resolve(coach)
      const c = get(key, name || titleCase(coach)); if (name) c.name = name
      // Count each customer's package ONCE — at the down-payment/close
      // (signup_count=1). The balance payment (signup_count=0) is collection,
      // NOT a new sale, so it isn't re-counted (a DP+balance member = 1 availed).
      // SRP = the package's full price at close (not the partial payment amount).
      const closes = r.signup_count == null ? 1 : r.signup_count
      if (closes > 0) {
        c.availed += closes
        c.srp += (packageFullPrice(r.meta?.package) || r.sales_amount || 0) * closes
      }
    }
    for (const bk of bookings) {
      if (!bk.coach) continue
      const t = new Date(bk.startsAt).getTime(); if (t < a || t > b) continue
      const { key, name } = resolve(bk.coach)
      const c = get(key, name || bk.coach); c.name = name || bk.coach
      // Cancelled bookings still count as an appointment that was made (per MJ),
      // tracked separately — they don't go into the active Appointment/Show-up.
      if (bk.cancelled === true || bk.status === 'Cancelled') { c.cancelled += 1; continue }
      c.appt += 1
      const att = attOf(bk, now)
      if (att === 'showed') c.showup += 1; else if (att === 'no_show') c.noshow += 1
    }
    return [...map.values()].map(c => ({
      ...c,
      // Show-up rate = showed ÷ concluded (showed + no-show). Upcoming
      // appointments are excluded, so it reads "—" until sessions conclude
      // instead of a misleading 0%.
      showUpRate: (c.showup + c.noshow) > 0 ? (c.showup / (c.showup + c.noshow)) * 100 : null,
      // Closing Rate = closed sales ÷ APPOINTMENTS booked (booking-to-sale
      // conversion). Denominator is appointments, NOT show-ups: sales
      // (LakbayHub, by payment date) and show-ups (YCBM, by appointment date)
      // are different sources/date-bases, so sales÷show-ups produced absurd
      // >100% figures (e.g. 275%). Appointments is the stable, bounded base.
      // Clamped to 100% so residual cross-source/date noise never shows >100%.
      closingRate: c.appt > 0 ? Math.min(100, (c.availed / c.appt) * 100) : null,
    })).sort((x, y) => y.srp - x.srp || y.availed - x.availed)
  }, [salesRecords, bookings, from, to, attBump, aliases]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section>
      <h2 className="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">
        <Award size={16} style={{ color: GOLD }} /> Sales Performance · {periodLabel}
        <span className="text-[11px] font-normal text-gray-400">(per coach · LakbayHub + YCBM)</span>
      </h2>
      {loading && bookings.length === 0 ? (
        <p className="text-sm text-gray-400 py-6 text-center bg-white rounded-2xl border border-gray-100">Naglo-load pa ang YCBM bookings…</p>
      ) : coaches.length === 0 ? (
        <p className="text-sm text-gray-400 py-6 text-center bg-white rounded-2xl border border-gray-100">Walang per-coach data sa napiling period.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {coaches.map(c => (
            <div key={c.key} className="rounded-2xl p-4 shadow-sm" style={{ background: `linear-gradient(135deg, ${PRIMARY} 0%, #0f3a3a 100%)` }}>
              <h3 className="text-lg font-extrabold tracking-wide mb-2" style={{ color: GOLD }}>{c.name}</h3>
              {[
                ['No. Availed', c.availed],
                ['SRP', formatPHP(c.srp)],
                ['Appointment', c.appt],
                ['Show Up', c.showup],
                ['No Show', c.noshow],
                ['Cancelled', c.cancelled],
              ].map(([l, v]) => (
                <div key={l} className="flex items-center justify-between text-sm py-0.5">
                  <span className="text-white/70 text-xs font-medium uppercase tracking-wide">{l}</span>
                  <span className="font-bold text-white">{v}</span>
                </div>
              ))}
              <div className="mt-1.5 pt-1.5 border-t border-white/15">
                <div className="flex items-center justify-between text-sm py-0.5">
                  <span className="text-white/70 text-xs font-medium uppercase tracking-wide">Show Up Rate</span>
                  <span className="font-bold text-white">{c.showUpRate == null ? '—' : `${c.showUpRate.toFixed(2)}%`}</span>
                </div>
                <div className="flex items-center justify-between text-sm py-0.5">
                  <span className="text-white/70 text-xs font-medium uppercase tracking-wide">Closing Rate</span>
                  <span className="font-bold" style={{ color: GOLD }}>{c.closingRate == null ? '—' : `${c.closingRate.toFixed(2)}%`}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
