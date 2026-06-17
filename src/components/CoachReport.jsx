// Per-coach analytics from an uploaded YCBM report CSV.
//
// WHY UPLOAD (not live API): the YCBM booking REST API does NOT expose the
// "Team" (assigned coach) — it's empty in every API response. Only YCBM's
// report EXPORT (Bookings → Export) includes the Team column. So MJ exports
// that CSV and uploads it here; we parse Team + Start (→ slot) + No Show /
// Status / Cancelled to track each coach's bookings, show-ups, and slots.
import { useMemo, useState, useEffect } from 'react'
import { Upload, Users, Clock, CheckCircle2, XCircle, FileSpreadsheet, Trash2 } from 'lucide-react'

const STORAGE_KEY = 'potb_coach_report_v1'

// Official POTB session slots (same as the Booking Summary).
const SLOTS = [
  { h: 10, label: '10AM' }, { h: 14, label: '2PM' }, { h: 15, label: '3PM' },
  { h: 19, label: '7PM' }, { h: 20, label: '8PM' }, { h: 21, label: '9PM' },
]
const SLOT_HOURS = SLOTS.map(s => s.h)
const nearestHour = (h) => SLOT_HOURS.reduce((b, s) => (Math.abs(s - h) < Math.abs(b - h) ? s : b), SLOT_HOURS[0])
const slotLabelFor = (h) => (SLOTS.find(s => s.h === nearestHour(h)) || {}).label

// "Coach Shiela" / "Maria of Pinoy Online Travel Biz" → "Maria"/"Shiela"
function cleanCoach(t) {
  const c = (t || '')
    .replace(/^coach\s+/i, '')
    .replace(/\s+of\s+pinoy.*$/i, '')
    .trim()
  return c || 'Unassigned'
}

// Minimal CSV parser (handles quoted fields + escaped quotes + CRLF).
function parseCSV(text) {
  const rows = []
  let i = 0, field = '', row = [], inQ = false
  while (i < text.length) {
    const c = text[i]
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else inQ = false }
      else field += c
    } else {
      if (c === '"') inQ = true
      else if (c === ',') { row.push(field); field = '' }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
      else if (c === '\r') { /* skip */ }
      else field += c
    }
    i++
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows
}

// Parse a YCBM report export into normalized booking rows.
function parseReport(text) {
  const rows = parseCSV(text)
  if (!rows.length) throw new Error('Walang laman ang file.')
  const h = rows[0].map(s => s.trim())
  const idx = (name) => h.indexOf(name)
  const cT = idx('Team'), cStart = idx('Start'), cNo = idx('No Show'),
        cCanc = idx('Cancelled'), cStatus = idx('Status'), cProf = idx('Profile')
  if (cT < 0 || cStart < 0) {
    throw new Error('Mukhang hindi ito YCBM report — kulang ang "Team" / "Start" columns. I-export mula sa YCBM → Bookings → Export.')
  }
  const out = []
  for (const r of rows.slice(1)) {
    if (r.length < 6) continue
    const m = (r[cStart] || '').match(/(\d{4}-\d{2}-\d{2})[ T](\d{2}):/)
    if (!m) continue
    const canc = (r[cCanc] || '').toLowerCase() === 'true'
    const no   = (r[cNo] || '').toLowerCase() === 'true'
    const finished = /finished/i.test(r[cStatus] || '')
    const att = canc ? 'cancelled' : no ? 'no_show' : finished ? 'showed' : 'upcoming'
    out.push({
      coach: cleanCoach(r[cT]),
      date: m[1],
      hour: Number(m[2]),
      slot: slotLabelFor(Number(m[2])),
      att,
      profile: (r[cProf] || '').trim(),
    })
  }
  return out
}

const isOrientationProfile = (p) => /orientation/i.test(p || '')

export default function CoachReport({ from, to }) {
  const [store, setStore] = useState(null)   // { uploadedAt, rows }
  const [error, setError] = useState(null)

  // Load any previously-uploaded report from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setStore(JSON.parse(raw))
    } catch { /* ignore */ }
  }, [])

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    try {
      const text = await file.text()
      const rows = parseReport(text)
      if (!rows.length) throw new Error('Walang nabasang bookings sa file.')
      const next = { uploadedAt: new Date().toISOString(), fileName: file.name, rows }
      setStore(next)
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* quota */ }
    } catch (err) {
      setError(err.message)
    } finally {
      e.target.value = ''  // allow re-uploading the same file
    }
  }

  const clear = () => {
    setStore(null)
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
  }

  // Coaching rows within the selected period (exclude orientation — this lives
  // on the coaching Bookings tab).
  const agg = useMemo(() => {
    if (!store?.rows) return null
    const a = from ? from.getTime() : -Infinity
    const b = to ? to.getTime() : Infinity
    const inRange = store.rows.filter(r => {
      if (isOrientationProfile(r.profile)) return false
      const t = new Date(r.date + 'T00:00:00').getTime()
      return t >= a && t <= b
    })
    // per coach totals + per slot
    const coaches = new Map()  // coach -> { booked, showed, noShow, cancelled, slots: {label:{book,showed}} }
    for (const r of inRange) {
      if (!coaches.has(r.coach)) coaches.set(r.coach, { coach: r.coach, booked: 0, showed: 0, noShow: 0, cancelled: 0, slots: {} })
      const c = coaches.get(r.coach)
      if (r.att === 'cancelled') { c.cancelled++; continue }
      c.booked++
      if (r.att === 'showed') c.showed++
      else if (r.att === 'no_show') c.noShow++
      const s = (c.slots[r.slot] = c.slots[r.slot] || { book: 0, showed: 0 })
      s.book++
      if (r.att === 'showed') s.showed++
    }
    const list = [...coaches.values()].sort((x, y) => y.booked - x.booked)
    return { list, count: inRange.length }
  }, [store, from, to])

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Users size={16} style={{ color: '#1B4F4F' }} /> Per Coach (from YCBM report)</h2>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Bookings · show-up · per time slot, bawat coach (Team column). Galing sa in-upload na YCBM report export.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold text-white cursor-pointer hover:opacity-90" style={{ backgroundColor: '#1B4F4F' }}>
            <Upload size={14} /> Upload YCBM report
            <input type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" />
          </label>
          {store && (
            <button onClick={clear} title="Clear uploaded report" className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-red-500">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="p-5">
        {error && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 text-red-700 text-xs">{error}</div>
        )}

        {!store ? (
          <div className="text-center py-8 text-gray-400">
            <FileSpreadsheet size={28} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm font-medium text-gray-500">Wala pang na-upload na report</p>
            <p className="text-xs mt-1">Sa YCBM → <strong>Bookings → Export</strong>, i-download ang CSV, tapos i-upload dito.<br />Makikita ang per-coach bookings, show-up, at time slots.</p>
          </div>
        ) : !agg || agg.list.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">Walang coaching bookings sa napiling period mula sa report.</p>
        ) : (
          <div className="flex flex-col gap-5">
            <p className="text-[11px] text-gray-400">
              Source: {store.fileName || 'YCBM report'} · {agg.count} bookings sa period · na-upload {new Date(store.uploadedAt).toLocaleString('en-PH')}
            </p>

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

            {/* Per-coach × time-slot matrix (bookings, with show-up beneath) */}
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
