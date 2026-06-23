import { useState, useMemo, useEffect, useRef } from 'react'
import { Filter, Download, ChevronLeft, ChevronRight, MoreVertical, Sparkles, Wand2, Check, X, RotateCcw } from 'lucide-react'
import BookingCard from './BookingCard'

import AttendanceToggle from './AttendanceToggle'
import { getStatus, bulkSet, clearAll, inferAttendance, subscribeAttendance } from '../lib/attendance'
import { fetchSalesRecords } from '../api/lakbay'
import PeriodBar from './PeriodBar'
import CoachPivot from './CoachPivot'
import BookingTrend from './BookingTrend'
import YcbmReportUpload from './YcbmReportUpload'
import { mergeWithReport, subscribeReport, isOrientation } from '../lib/ycbmReport'
import { periodRange, periodLabelFor, currentMonthKey, PERIODS_WITH_ALL } from '../lib/periods'

function downloadCSV(filename, rows) {
  const csv = rows.map(row => row.map(cell => {
    if (cell == null) return ''
    const s = String(cell)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const VIEW_FILTERS = ['Upcoming', 'Past', 'Date Range']
const PER_PAGE = 10

// isOrientation is shared from lib/ycbmReport so every coaching view (Bookings,
// Acquisition funnel, Sales Performance) excludes orientation identically.

// Official POTB session time slots (confirmed by MJ — the 6 high-volume slots).
// Every booking is bucketed into the NEAREST of these by hour, so odd-hour
// bookings (reschedules / off-schedule) fold into a real slot — no "Other".
const SLOTS = [
  { h: 10, label: '10AM' },
  { h: 14, label: '2PM'  },
  { h: 15, label: '3PM'  },
  { h: 19, label: '7PM'  },
  { h: 20, label: '8PM'  },
  { h: 21, label: '9PM'  },
]
const SLOT_HOURS = SLOTS.map(s => s.h)
// Nearest official slot hour to `h` (ties → earlier slot, since we scan ascending).
const nearestSlotHour = (h) =>
  SLOT_HOURS.reduce((best, sh) => (Math.abs(sh - h) < Math.abs(best - h) ? sh : best), SLOT_HOURS[0])
// Hour parsed from the startsAt string (Manila-local as stored) — avoids any
// browser-timezone drift from new Date().getHours().
const hourOf = (startsAt) => {
  const m = (startsAt || '').match(/T(\d{2}):/)
  return m ? Number(m[1]) : null
}

export default function BookingsTab({ bookings: allBookings = [], mode = 'coaching' }) {
  // mode 'coaching' (default) shows sales/coaching bookings and EXCLUDES Welcome
  // Orientation; mode 'orientation' shows ONLY the Welcome Orientation bookings.
  const ORIENTATION = mode === 'orientation'
  // Re-render when an uploaded report is merged/cleared.
  const [repBump, setRepBump] = useState(0)
  useEffect(() => subscribeReport(() => setRepBump(n => n + 1)), [])
  // Merge live API bookings with the accumulated uploaded report (report wins),
  // then split coaching vs orientation for this tab.
  const bookings = useMemo(
    () => mergeWithReport(allBookings, 'acquisition').filter(b => ORIENTATION ? isOrientation(b) : !isOrientation(b)),
    [allBookings, ORIENTATION, repBump],
  )
  const [activeFilter, setActiveFilter] = useState('Upcoming')
  const [page, setPage] = useState(1)
  const [openMenu, setOpenMenu] = useState(null)
  const [autoFillOpen, setAutoFillOpen] = useState(false)
  const [flash, setFlash] = useState(null) // { type: 'ok'|'warn', text }
  const autoFillRef = useRef(null)

  // Close auto-fill dropdown on outside click
  useEffect(() => {
    if (!autoFillOpen) return
    const handler = (e) => {
      if (autoFillRef.current && !autoFillRef.current.contains(e.target)) setAutoFillOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [autoFillOpen])

  function flashMsg(type, text) {
    setFlash({ type, text })
    setTimeout(() => setFlash(null), 4000)
  }

  async function runAutoFill(strategy) {
    setAutoFillOpen(false)
    if (strategy === 'clear') {
      if (!confirm('Clear ALL attendance markings? This cannot be undone.')) return
      clearAll()
      flashMsg('ok', 'All attendance markings cleared.')
      return
    }
    try {
      const sales = await fetchSalesRecords()
      const updates = inferAttendance(bookings, sales, strategy)
      if (updates.length === 0) {
        flashMsg('warn', 'No past bookings to mark.')
        return
      }
      bulkSet(updates)
      const showed  = updates.filter(u => u.status === 'showed').length
      const noShow  = updates.filter(u => u.status === 'no_show').length
      flashMsg('ok', `Marked ${updates.length} bookings: ${showed} showed up, ${noShow} no-show.`)
    } catch (err) {
      flashMsg('warn', `Failed: ${err.message}`)
    }
  }

  const filtered = useMemo(() => {
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now()
    if (activeFilter === 'Upcoming') {
      return bookings.filter(b => new Date(b.startsAt).getTime() >= now)
                     .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt))
    }
    if (activeFilter === 'Past') {
      return bookings.filter(b => new Date(b.startsAt).getTime() < now)
                     .sort((a, b) => new Date(b.startsAt) - new Date(a.startsAt))
    }
    return [...bookings].sort((a, b) => new Date(b.startsAt) - new Date(a.startsAt))
  }, [bookings, activeFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE))
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)
  const startIdx = filtered.length === 0 ? 0 : (page - 1) * PER_PAGE + 1
  const endIdx = Math.min(page * PER_PAGE, filtered.length)

  // Re-render the summary when attendance markings change
  const [attBump, setAttBump] = useState(0)
  useEffect(() => subscribeAttendance(() => setAttBump(n => n + 1)), [])

  // Period filter for the summary (standard selector, like the other dashboards)
  const [periodId, setPeriodId] = useState('all')
  const [monthKey, setMonthKey] = useState(currentMonthKey())
  const [customDates, setCustomDates] = useState([])
  const isCustom = periodId === 'custom' && customDates.length > 0
  const customSet = useMemo(() => new Set(customDates), [customDates])
  const dKey = (d) => {
    const x = new Date(d)
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
  }
  const [sumFrom, sumTo] = useMemo(() => {
    if (isCustom) {
      const sorted = [...customDates].sort()
      const a = new Date(sorted[0] + 'T00:00:00')
      const b = new Date(sorted[sorted.length - 1] + 'T23:59:59')
      return [a, b]
    }
    const { start, end } = periodRange(periodId, monthKey)
    return [start, end]
  }, [isCustom, customDates, periodId, monthKey])
  const summaryLabel = isCustom
    ? `${customDates.length} custom days`
    : periodLabelFor(periodId, monthKey)

  // Booking funnel summary scoped to the selected period (by scheduled date):
  // booked / showed / no-show, per slot. Attendance = manual mark if set, else
  // YCBM No-Show flag, else past→showed.
  const summary = useMemo(() => {
    const now = Date.now()
    const a = sumFrom.getTime(), b2 = sumTo.getTime()
    const scoped = bookings.filter(bk => {
      const t = new Date(bk.startsAt).getTime()
      if (t < a || t > b2) return false
      return !isCustom || customSet.has(dKey(bk.startsAt))
    })
    const att = (b) => {
      const m = getStatus(b.id)
      if (m === 'showed' || m === 'no_show') return m
      if (b.noShow === true) return 'no_show'
      if (new Date(b.startsAt).getTime() < now) return 'showed'
      return 'upcoming'
    }
    let booked = 0, showed = 0, noShow = 0, upcoming = 0, cancelled = 0
    const slots = SLOTS.map(s => ({ ...s, bookings: 0, showed: 0 }))
    const slotByHour = new Map(slots.map(s => [s.h, s]))
    for (const b of scoped) {
      if (b.status === 'Cancelled') { cancelled++; continue }
      booked++
      const a = att(b)
      if (a === 'showed') showed++
      else if (a === 'no_show') noShow++
      else upcoming++
      const hr = hourOf(b.startsAt)
      if (hr == null) continue
      const slot = slotByHour.get(nearestSlotHour(hr))
      slot.bookings++
      if (a === 'showed') slot.showed++
    }
    const tracked = showed + noShow
    const rows = slots   // always the 6 official slots, in order
    return {
      booked, showed, noShow, upcoming, cancelled, rows,
      showUpRate: tracked > 0 ? Math.round((showed / tracked) * 100) : null,
    }
  }, [bookings, attBump, sumFrom, sumTo, isCustom, customSet]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col gap-4">
      {flash && (
        <div className={`px-4 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 ${
          flash.type === 'ok' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : 'bg-amber-50 text-amber-800 border border-amber-200'
        }`}>
          {flash.type === 'ok' ? <Check size={14} /> : <X size={14} />}
          {flash.text}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {ORIENTATION ? 'Orientation Roster' : 'Bookings Roster'}
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {ORIENTATION ? 'POTB Welcome Orientation sessions' : (activeFilter === 'Past' ? 'Past appointments' : activeFilter === 'Date Range' ? 'Selected date range' : 'Upcoming appointments')} · who’s booked &amp; when
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
            {VIEW_FILTERS.map(f => (
              <button
                key={f}
                onClick={() => { setActiveFilter(f); setPage(1) }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeFilter === f
                    ? 'bg-white text-[#1B4F4F] shadow-sm font-semibold'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          <button
            aria-label="Filters"
            className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            <Filter size={16} className="text-gray-600" />
          </button>

          {/* Auto-fill attendance dropdown */}
          <div className="relative" ref={autoFillRef}>
            <button
              onClick={() => setAutoFillOpen(o => !o)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-gray-200 hover:bg-gray-50 transition-colors"
              title="Auto-fill attendance markings"
            >
              <Wand2 size={13} className="text-[#1B4F4F]" />
              <span className="hidden sm:inline">Auto-fill</span>
            </button>
            {autoFillOpen && (
              <div className="absolute right-0 top-12 z-30 bg-white border border-gray-100 rounded-2xl shadow-xl min-w-[300px] py-1.5">
                <div className="px-3 py-2 border-b border-gray-100">
                  <p className="text-xs font-bold text-gray-900">Auto-fill Attendance <span className="font-normal text-amber-600">· fallback</span></p>
                  <p className="text-[10px] text-gray-500 mt-0.5">Reports now use YCBM’s own No-Show marking. Use this only if YCBM isn’t marked. Past bookings only · skips cancelled &amp; future.</p>
                </div>
                <button
                  onClick={() => runAutoFill('sales_then_no_show')}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors flex items-start gap-2"
                >
                  <Sparkles size={13} className="mt-0.5 text-amber-500 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-gray-900">Smart Match (Recommended)</p>
                    <p className="text-[10px] text-gray-500">Matched to LakbayHub sale → showed; else → no-show</p>
                  </div>
                </button>
                <button
                  onClick={() => runAutoFill('sales_then_unset')}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors flex items-start gap-2"
                >
                  <Sparkles size={13} className="mt-0.5 text-amber-500 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-gray-900">Conservative Match</p>
                    <p className="text-[10px] text-gray-500">Matched → showed; unmatched stay unset (you decide later)</p>
                  </div>
                </button>
                <div className="border-t border-gray-100 my-1" />
                <button
                  onClick={() => runAutoFill('all_showed')}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors flex items-start gap-2"
                >
                  <Check size={13} className="mt-0.5 text-emerald-600 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-gray-900">Mark all past as Showed</p>
                    <p className="text-[10px] text-gray-500">Bulk-set every past booking to showed up</p>
                  </div>
                </button>
                <button
                  onClick={() => runAutoFill('all_no_show')}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors flex items-start gap-2"
                >
                  <X size={13} className="mt-0.5 text-red-600 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-gray-900">Mark all past as No-Show</p>
                    <p className="text-[10px] text-gray-500">Bulk-set every past booking to no-show</p>
                  </div>
                </button>
                <div className="border-t border-gray-100 my-1" />
                <button
                  onClick={() => runAutoFill('clear')}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors flex items-start gap-2"
                >
                  <RotateCcw size={13} className="mt-0.5 text-gray-500 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-gray-900">Clear all markings</p>
                    <p className="text-[10px] text-gray-500">Reset every booking to unset</p>
                  </div>
                </button>
              </div>
            )}
          </div>

          <button
            aria-label="Export to CSV"
            onClick={() => {
              const today = new Date().toISOString().slice(0, 10)
              const header = ['Date', 'Time', 'Duration (min)', 'Customer', 'Team', 'Appointment Type', 'Attendance', 'Booking ID', 'Time Zone']
              const rows = [header, ...filtered.map(b => [
                b.date, b.time, b.durationMinutes, b.name, b.team, b.appointmentType,
                getStatus(b.id) || 'unset', b.id, b.timeZone,
              ])]
              downloadCSV(`${ORIENTATION ? 'orientation' : 'bookings'}-${activeFilter.toLowerCase()}-${today}.csv`, rows)
            }}
            title={`Export ${filtered.length} ${activeFilter.toLowerCase()} bookings`}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-colors hover:opacity-90"
            style={{ backgroundColor: '#1B4F4F' }}
          >
            <Download size={15} />
            <span className="hidden sm:inline">Export CSV</span>
          </button>
        </div>
      </div>

      {/* Accumulating YCBM report upload — exact data, merged (dedup) per upload.
          Upload daily here; covers both Bookings and Orientation (same export). */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">YCBM Report (exact data · iniipon)</p>
        <YcbmReportUpload account="acquisition" />
      </div>

      {/* Booking funnel summary — booked / showed / no-show + per time slot */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="font-semibold text-gray-900">{ORIENTATION ? 'Orientation Summary' : 'Booking Summary'} · {summaryLabel}</h2>
              <p className="text-[11px] text-gray-500 mt-0.5">{ORIENTATION ? 'Welcome Orientation sessions' : 'Coaching sessions only (excludes Welcome Orientation)'} · show-up galing sa manual mark o YCBM No-Show flag</p>
            </div>
            {summary.showUpRate != null && (
              <span className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-700">
                Show-Up Rate: {summary.showUpRate}%
              </span>
            )}
          </div>
          <PeriodBar
            periods={PERIODS_WITH_ALL}
            periodId={periodId} onPeriod={setPeriodId}
            monthKey={monthKey} onMonth={setMonthKey}
            customDates={customDates} isCustom={isCustom}
            onApplyCustom={(dates) => { setCustomDates(dates); setPeriodId('custom') }}
          />
        </div>
        {/* Stat tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-px bg-gray-100">
          {[
            { label: 'Nag-book',   value: summary.booked,    color: '#1B4F4F' },
            { label: 'Nag-show up', value: summary.showed,    color: '#16a34a' },
            { label: 'No-Show',    value: summary.noShow,    color: '#dc2626' },
            { label: 'Upcoming',   value: summary.upcoming,  color: '#64748b' },
            { label: 'Cancelled',  value: summary.cancelled, color: '#94a3b8' },
          ].map(s => (
            <div key={s.label} className="bg-white px-4 py-3 flex flex-col gap-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{s.label}</span>
              <span className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</span>
            </div>
          ))}
        </div>
        {/* Per time-slot breakdown */}
        <div className="px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">Per Time Slot</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 text-xs uppercase tracking-wide border-b border-gray-100">
                  <th className="py-2 pr-4 font-semibold">Slot</th>
                  <th className="py-2 px-3 font-semibold text-center">Bookings</th>
                  <th className="py-2 px-3 font-semibold text-center">Showed</th>
                  <th className="py-2 px-3 font-semibold text-center">Show-Up %</th>
                </tr>
              </thead>
              <tbody>
                {summary.rows.map(r => {
                  const pct = r.bookings > 0 ? Math.round((r.showed / r.bookings) * 100) : null
                  return (
                    <tr key={r.label} className="border-b border-gray-50">
                      <td className="py-2 pr-4 font-medium text-gray-700">{r.label}</td>
                      <td className="py-2 px-3 text-center text-gray-700">{r.bookings || '—'}</td>
                      <td className="py-2 px-3 text-center text-gray-700">{r.showed || '—'}</td>
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
        </div>
      </section>

      {/* Bookings trend bar chart — Week/Month/Year comparison across all data */}
      <BookingTrend bookings={bookings} />

      {/* Expandable per-coach / per-slot pivot (coach ↔ slot ↔ booker names),
          now with per-coach show-up rate. Coaching tab only; respects the
          period selector above. */}
      {!ORIENTATION && <CoachPivot bookings={bookings} from={sumFrom} to={sumTo} />}

      {/* Desktop table */}
      <div className="hidden sm:block bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Date', 'Time', 'Duration', 'Customer', 'Team', 'Appointment Type', 'Attendance', 'Actions'].map(col => (
                  <th
                    key={col}
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap cursor-pointer hover:text-gray-700 select-none"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paged.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                    No bookings found
                  </td>
                </tr>
              ) : paged.map(b => (
                <tr key={b.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{b.date}</td>
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{b.time}</td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{b.duration}</td>
                  <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{b.name}</td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    <span className="px-2 py-0.5 bg-teal-50 text-teal-700 rounded-md text-xs font-mono">
                      {b.team}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 max-w-[280px] truncate" title={b.appointmentType}>
                    {b.appointmentType}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <AttendanceToggle bookingId={b.id} />
                  </td>
                  <td className="px-4 py-3 relative">
                    <button
                      onClick={() => setOpenMenu(openMenu === b.id ? null : b.id)}
                      className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                      aria-label="Row actions"
                    >
                      <MoreVertical size={15} className="text-gray-500" />
                    </button>
                    {openMenu === b.id && (
                      <div className="absolute right-4 top-10 bg-white border border-gray-100 rounded-xl shadow-lg z-10 min-w-[130px] py-1">
                        {['View', 'Edit', 'Cancel'].map(action => (
                          <button
                            key={action}
                            onClick={() => setOpenMenu(null)}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            {action}
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-500">
          <span>{startIdx} – {endIdx} of {filtered.length}</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              aria-label="Previous page"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              aria-label="Next page"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile card list */}
      <div className="sm:hidden flex flex-col gap-3 pb-24">
        {paged.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg font-medium">No bookings found</p>
            <p className="text-sm mt-1">Try changing the filter above</p>
          </div>
        ) : (
          paged.map(b => <BookingCard key={b.id} booking={b} />)
        )}

        <div className="flex items-center justify-between px-1 py-2 text-sm text-gray-500">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
          >
            <ChevronLeft size={14} /> Prev
          </button>
          <span>Page {page} of {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
          >
            Next <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
