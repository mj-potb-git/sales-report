// Per-coach "Sales Performance" cards — hybrid source:
//   • Availed + SRP  ← LakbayHub sign-up sales (API, accurate)
//   • Appointment / Show Up / No Show ← YCBM bookings
//       - if a YCBM REPORT CSV is uploaded → use it (EXACT, 100%)
//       - else → live API (automatic, ~78% on busy days)
// When a report is uploaded, the cards FOLLOW it; the live API total is shown
// as a cross-check. Closing Rate = Availed ÷ Show Up; Show Up Rate = Show Up ÷ Appt.
import { useMemo, useState, useEffect } from 'react'
import { Award, Upload, Trash2, FileCheck2 } from 'lucide-react'
import { formatPHP } from '../api/lakbay'
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
const cleanCoach = (n) => (n || '').replace(/^coach\s+/i, '').replace(/\s+of\s+pinoy.*$/i, '').trim()

function attOf(b, now) {
  const m = getStatus(b.id)
  if (m === 'showed' || m === 'no_show') return m
  if (b.noShow === true) return 'no_show'
  if (new Date(b.startsAt).getTime() < now) return 'showed'
  return 'upcoming'
}

// --- YCBM report CSV (Export) parser -> [{ coach, ms, att }] -----------------
function parseCSV(text) {
  const rows = []; let i = 0, f = '', row = [], q = false
  while (i < text.length) {
    const c = text[i]
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++ } else q = false } else f += c }
    else { if (c === '"') q = true; else if (c === ',') { row.push(f); f = '' } else if (c === '\n') { row.push(f); rows.push(row); row = []; f = '' } else if (c === '\r') { /*skip*/ } else f += c }
    i++
  }
  if (f.length || row.length) { row.push(f); rows.push(row) }
  return rows
}
function parseReport(text) {
  const rows = parseCSV(text)
  if (!rows.length) throw new Error('Walang laman ang file.')
  const h = rows[0].map(s => s.trim()); const ix = (n) => h.indexOf(n)
  const cT = ix('Team'), cS = ix('Start'), cNo = ix('No Show'), cC = ix('Cancelled'), cP = ix('Profile')
  if (cT < 0 || cS < 0) throw new Error('Hindi YCBM report — kulang ang "Team"/"Start" columns (i-export sa YCBM → Bookings → Export).')
  const out = []
  for (const r of rows.slice(1)) {
    if (r.length < 6) continue
    if (/orientation/i.test(r[cP] || '')) continue
    if ((r[cC] || '').toLowerCase() === 'true') continue
    const m = (r[cS] || '').match(/(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/)
    if (!m) continue
    out.push({
      coach: cleanCoach(r[cT]) || 'Unassigned',
      ms: new Date(`${m[1]}T${m[3] ? `${m[2]}:${m[3]}` : m[2]}:00`).getTime(),
      att: (r[cNo] || '').toLowerCase() === 'true' ? 'no_show' : 'showed',
    })
  }
  return out
}

export default function SalesPerformanceCards({
  salesRecords = [], bookings = [], from, to, periodLabel,
  aliases = {}, loading = false, storageKey = 'ycbm_report',
}) {
  const [attBump, setAttBump] = useState(0)
  useEffect(() => subscribeAttendance(() => setAttBump(n => n + 1)), [])

  // Uploaded report (persisted per tab)
  const LS = `potb_salesperf_report_${storageKey}`
  const [report, setReport] = useState(null)   // { uploadedAt, fileName, rows }
  const [err, setErr] = useState(null)
  useEffect(() => {
    try { const raw = localStorage.getItem(LS); if (raw) setReport(JSON.parse(raw)) } catch { /* ignore */ }
  }, [LS])

  const onFile = async (e) => {
    const file = e.target.files?.[0]; if (!file) return
    setErr(null)
    try {
      const rows = parseReport(await file.text())
      if (!rows.length) throw new Error('Walang nabasang bookings.')
      const next = { uploadedAt: new Date().toISOString(), fileName: file.name, rows }
      setReport(next)
      try { localStorage.setItem(LS, JSON.stringify(next)) } catch { /* quota */ }
    } catch (e2) { setErr(e2.message) }
    finally { e.target.value = '' }
  }
  const clearReport = () => { setReport(null); try { localStorage.removeItem(LS) } catch { /* ignore */ } }

  const resolve = (rawName) => {
    const k = coachKey(rawName)
    const canon = aliases[k]
    return canon ? { key: coachKey(canon), name: canon } : { key: k, name: null }
  }

  const { coaches, usingReport, autoTotal, reportTotal } = useMemo(() => {
    const now = Date.now()
    const a = from ? from.getTime() : -Infinity
    const b = to ? to.getTime() : Infinity
    const map = new Map()
    const get = (key, fallback) => {
      if (!map.has(key)) map.set(key, { key, name: fallback || titleCase(key), availed: 0, srp: 0, appt: 0, showup: 0, noshow: 0 })
      return map.get(key)
    }
    // LakbayHub: Availed + SRP (always from API — accurate)
    for (const r of salesRecords) {
      const coach = coachFromCluster(r.team); if (!coach) continue
      const { key, name } = resolve(coach)
      const c = get(key, name || titleCase(coach)); if (name) c.name = name
      c.availed += 1; c.srp += r.sales_amount || 0
    }
    // Cross-check: live API appointment total in range
    let autoTotal = 0
    for (const bk of bookings) {
      if (!bk.coach || bk.cancelled === true || bk.status === 'Cancelled') continue
      const t = new Date(bk.startsAt).getTime(); if (t < a || t > b) continue
      autoTotal++
    }
    // YCBM side: report (exact) if uploaded & covers the period, else live API
    const reportInRange = report?.rows?.filter(r => r.ms >= a && r.ms <= b) || []
    const usingReport = reportInRange.length > 0
    if (usingReport) {
      for (const r of reportInRange) {
        const { key, name } = resolve(r.coach)
        const c = get(key, name || titleCase(r.coach)); if (name) c.name = name
        c.appt += 1
        if (r.att === 'showed') c.showup += 1; else if (r.att === 'no_show') c.noshow += 1
      }
    } else {
      for (const bk of bookings) {
        if (!bk.coach || bk.cancelled === true || bk.status === 'Cancelled') continue
        const t = new Date(bk.startsAt).getTime(); if (t < a || t > b) continue
        const { key, name } = resolve(bk.coach)
        const c = get(key, name || bk.coach); c.name = name || bk.coach
        c.appt += 1
        const att = attOf(bk, now)
        if (att === 'showed') c.showup += 1; else if (att === 'no_show') c.noshow += 1
      }
    }
    const list = [...map.values()].map(c => ({
      ...c,
      closingRate: c.showup > 0 ? (c.availed / c.showup) * 100 : null,
      showUpRate: c.appt > 0 ? (c.showup / c.appt) * 100 : null,
    })).sort((x, y) => y.srp - x.srp || y.availed - x.availed)
    return { coaches: list, usingReport, autoTotal, reportTotal: reportInRange.length }
  }, [salesRecords, bookings, from, to, attBump, aliases, report]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section>
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
          <Award size={16} style={{ color: GOLD }} /> Sales Performance · {periodLabel}
          {usingReport
            ? <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full inline-flex items-center gap-1"><FileCheck2 size={12} /> Uploaded report (exact)</span>
            : <span className="text-[11px] font-normal text-gray-400">(automatic · YCBM API)</span>}
        </h2>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white cursor-pointer hover:opacity-90" style={{ backgroundColor: PRIMARY }}>
            <Upload size={13} /> Upload YCBM report
            <input type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" />
          </label>
          {report && (
            <button onClick={clearReport} title="Clear uploaded report (balik sa automatic)" className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-red-500"><Trash2 size={14} /></button>
          )}
        </div>
      </div>

      {err && <div className="mb-2 px-3 py-2 rounded-lg bg-red-50 text-red-700 text-xs">{err}</div>}
      {report && (
        <p className="text-[11px] text-gray-400 mb-2">
          {usingReport
            ? <>Source: <b>{report.fileName}</b> ({reportTotal} appts sa period) · cross-check vs live API: <b>{autoTotal}</b> appts {autoTotal !== reportTotal && <span className="text-amber-600">(API ~{Math.round((autoTotal / Math.max(1, reportTotal)) * 100)}% — kulang sa busy days)</span>}</>
            : <>May na-upload na report pero walang sakop na booking sa napiling period — automatic muna.</>}
        </p>
      )}

      {loading && !usingReport && bookings.length === 0 ? (
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
              ].map(([l, v]) => (
                <div key={l} className="flex items-center justify-between text-sm py-0.5">
                  <span className="text-white/70 text-xs font-medium uppercase tracking-wide">{l}</span>
                  <span className="font-bold text-white">{v}</span>
                </div>
              ))}
              <div className="mt-1.5 pt-1.5 border-t border-white/15">
                <div className="flex items-center justify-between text-sm py-0.5">
                  <span className="text-white/70 text-xs font-medium uppercase tracking-wide">Closing Rate</span>
                  <span className="font-bold text-white">{c.closingRate == null ? '—' : `${c.closingRate.toFixed(2)}%`}</span>
                </div>
                <div className="flex items-center justify-between text-sm py-0.5">
                  <span className="text-white/70 text-xs font-medium uppercase tracking-wide">Show Up Rate</span>
                  <span className="font-bold text-white">{c.showUpRate == null ? '—' : `${c.showUpRate.toFixed(2)}%`}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
