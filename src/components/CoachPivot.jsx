// Expandable pivot of YCBM bookings by coach / time slot (3-level drill-down).
//
// View 1 (By Coach):  Coach (# appts) ▸ Time slot (# appts) ▸ Booker names
// View 2 (By Slot):   Time slot (# appts) ▸ Coach (# appts) ▸ Booker names
//
// Counts = non-cancelled appointments. Each booker shows an attendance dot
// (showed / no-show / upcoming). Coach comes from the YCBM teamMember field.
import { useMemo, useState, useEffect } from 'react'
import { Users, Clock, ChevronRight, ChevronDown } from 'lucide-react'
import { getStatus, subscribeAttendance } from '../lib/attendance'

const SLOTS = [
  { h: 10, label: '10AM' }, { h: 14, label: '2PM' }, { h: 15, label: '3PM' },
  { h: 19, label: '7PM' }, { h: 20, label: '8PM' }, { h: 21, label: '9PM' },
]
const SLOT_HOURS = SLOTS.map(s => s.h)
const SLOT_ORDER = Object.fromEntries(SLOTS.map((s, i) => [s.label, i]))
const nearestHour = (h) => SLOT_HOURS.reduce((b, s) => (Math.abs(s - h) < Math.abs(b - h) ? s : b), SLOT_HOURS[0])
const slotLabelFor = (h) => (SLOTS.find(s => s.h === nearestHour(h)) || {}).label
const hourOf = (startsAt) => {
  const m = (startsAt || '').match(/T(\d{2}):/)
  return m ? Number(m[1]) : null
}

function attOf(b, now) {
  const m = getStatus(b.id)
  if (m === 'showed' || m === 'no_show') return m
  if (b.noShow === true) return 'no_show'
  if (new Date(b.startsAt).getTime() < now) return 'showed'
  return 'upcoming'
}
const ATT_DOT = { showed: 'bg-emerald-500', no_show: 'bg-red-500', upcoming: 'bg-gray-300' }
const ATT_LABEL = { showed: 'showed', no_show: 'no-show', upcoming: 'upcoming' }

// Show-up rate = showed / (showed + no-show), null when nothing tracked yet.
const showUpRate = (g) => (g.showed + g.noShow) > 0 ? Math.round((g.showed / (g.showed + g.noShow)) * 100) : null
const rateTone = (p) => p == null ? 'text-gray-300' : p >= 70 ? 'text-emerald-600' : p >= 40 ? 'text-amber-600' : 'text-red-600'

// Group rows two levels deep. `l1`/`l2` are 'coach' or 'slot'.
function buildPivot(rows, l1, l2) {
  const m = new Map()
  for (const r of rows) {
    const k1 = r[l1], k2 = r[l2]
    if (!m.has(k1)) m.set(k1, { key: k1, count: 0, showed: 0, noShow: 0, kids: new Map() })
    const g1 = m.get(k1); g1.count++
    if (r.att === 'showed') g1.showed++; else if (r.att === 'no_show') g1.noShow++
    if (!g1.kids.has(k2)) g1.kids.set(k2, { key: k2, count: 0, showed: 0, noShow: 0, bookers: [] })
    const g2 = g1.kids.get(k2); g2.count++; g2.bookers.push({ name: r.name, att: r.att })
    if (r.att === 'showed') g2.showed++; else if (r.att === 'no_show') g2.noShow++
  }
  const sortKey = (level) => (a, b) =>
    level === 'slot'
      ? (SLOT_ORDER[a.key] ?? 99) - (SLOT_ORDER[b.key] ?? 99)
      : b.count - a.count || String(a.key).localeCompare(String(b.key))
  return [...m.values()]
    .map(g1 => ({ ...g1, kids: [...g1.kids.values()].sort(sortKey(l2)) }))
    .sort(sortKey(l1))
}

export default function CoachPivot({ bookings = [], from, to }) {
  const [view, setView] = useState('coach')   // 'coach' | 'slot'
  const [expanded, setExpanded] = useState(() => new Set())
  const [attBump, setAttBump] = useState(0)
  useEffect(() => subscribeAttendance(() => setAttBump(n => n + 1)), [])

  const toggle = (key) => setExpanded(prev => {
    const n = new Set(prev)
    n.has(key) ? n.delete(key) : n.add(key)
    return n
  })

  const { coachPivot, slotPivot, total } = useMemo(() => {
    const now = Date.now()
    const a = from ? from.getTime() : -Infinity
    const b = to ? to.getTime() : Infinity
    const rows = bookings
      .filter(bk => {
        if (bk.cancelled === true || bk.status === 'Cancelled') return false
        const t = new Date(bk.startsAt).getTime()
        return t >= a && t <= b
      })
      .map(bk => ({
        coach: bk.coach || 'Unassigned',
        slot: slotLabelFor(hourOf(bk.startsAt) ?? 0) || 'Other',
        name: bk.name || 'Unknown',
        att: attOf(bk, now),
      }))
    return {
      coachPivot: buildPivot(rows, 'coach', 'slot'),
      slotPivot: buildPivot(rows, 'slot', 'coach'),
      total: rows.length,
    }
  }, [bookings, from, to, attBump])

  const data = view === 'coach' ? coachPivot : slotPivot
  const L1Icon = view === 'coach' ? Users : Clock
  const L2Icon = view === 'coach' ? Clock : Users

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Users size={16} style={{ color: '#1B4F4F' }} /> Per Coach / Time Slot</h2>
          <p className="text-[11px] text-gray-500 mt-0.5">I-click para mag-expand: {view === 'coach' ? 'Coach → slot → booker names' : 'Slot → coach → booker names'} · {total} appts</p>
        </div>
        {/* View toggle */}
        <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
          {[{ id: 'coach', label: 'By Coach' }, { id: 'slot', label: 'By Time Slot' }].map(v => (
            <button key={v.id} onClick={() => { setView(v.id); setExpanded(new Set()) }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                view === v.id ? 'bg-white text-[#1B4F4F] shadow-sm font-semibold' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {v.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-2 sm:p-3">
        {data.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">Walang appointments sa napiling period.</p>
        ) : (
          <ul className="flex flex-col">
            {data.map(g1 => {
              const k1 = `1:${g1.key}`
              const open1 = expanded.has(k1)
              return (
                <li key={g1.key} className="border-b border-gray-50 last:border-0">
                  {/* Level 1 */}
                  <button onClick={() => toggle(k1)}
                    className="w-full flex items-center gap-2 px-2 py-2.5 hover:bg-gray-50 rounded-lg text-left">
                    {open1 ? <ChevronDown size={15} className="text-gray-400 flex-shrink-0" /> : <ChevronRight size={15} className="text-gray-400 flex-shrink-0" />}
                    <L1Icon size={14} style={{ color: '#1B4F4F' }} className="flex-shrink-0" />
                    <span className="font-semibold text-gray-800 flex-1 truncate">{g1.key}</span>
                    {(() => { const p = showUpRate(g1); return (
                      <span className={`text-xs font-semibold ${rateTone(p)}`} title="Show-up rate">{p == null ? '—' : `${p}%`}</span>
                    )})()}
                    <span className="text-[11px] text-gray-300">·</span>
                    <span className="text-sm font-bold text-gray-900">{g1.count}</span>
                    <span className="text-[11px] text-gray-400">appts</span>
                  </button>

                  {/* Level 2 */}
                  {open1 && (
                    <ul className="ml-6 border-l border-gray-100 pl-1">
                      {g1.kids.map(g2 => {
                        const k2 = `2:${g1.key}|${g2.key}`
                        const open2 = expanded.has(k2)
                        return (
                          <li key={g2.key}>
                            <button onClick={() => toggle(k2)}
                              className="w-full flex items-center gap-2 px-2 py-2 hover:bg-gray-50 rounded-lg text-left">
                              {open2 ? <ChevronDown size={14} className="text-gray-300 flex-shrink-0" /> : <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />}
                              <L2Icon size={13} className="text-gray-400 flex-shrink-0" />
                              <span className="text-sm text-gray-700 flex-1 truncate">{g2.key}</span>
                              {(() => { const p = showUpRate(g2); return (
                                <span className={`text-[11px] font-semibold ${rateTone(p)}`} title="Show-up rate">{p == null ? '—' : `${p}%`}</span>
                              )})()}
                              <span className="text-[11px] text-gray-300">·</span>
                              <span className="text-sm font-semibold text-gray-800">{g2.count}</span>
                              <span className="text-[11px] text-gray-400">appts</span>
                            </button>

                            {/* Level 3 — booker names */}
                            {open2 && (
                              <ul className="ml-6 pl-3 border-l border-gray-100 py-1 flex flex-col gap-1">
                                {g2.bookers.map((bk, i) => (
                                  <li key={i} className="flex items-center gap-2 px-2 py-1 text-sm">
                                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${ATT_DOT[bk.att]}`} title={ATT_LABEL[bk.att]} />
                                    <span className="text-gray-700 truncate">{bk.name}</span>
                                    <span className="text-[10px] text-gray-400">· {ATT_LABEL[bk.att]}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
