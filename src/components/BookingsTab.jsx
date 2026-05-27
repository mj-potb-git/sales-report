import { useState, useMemo, useEffect, useRef } from 'react'
import { Filter, Download, ChevronLeft, ChevronRight, MoreVertical, Sparkles, Wand2, Check, X, RotateCcw } from 'lucide-react'
import BookingCard from './BookingCard'
import StatusBadge from './StatusBadge'
import AttendanceToggle from './AttendanceToggle'
import { getStatus, bulkSet, clearAll, inferAttendance } from '../lib/attendance'
import { fetchSalesRecords } from '../api/lakbay'

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

export default function BookingsTab({ bookings = [] }) {
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
        <h1 className="text-xl font-bold text-gray-900">
          {activeFilter === 'Past' ? 'Past Bookings' : 'Upcoming Bookings'}
        </h1>

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
                  <p className="text-xs font-bold text-gray-900">Auto-fill Attendance</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">Past bookings only · skips cancelled & future</p>
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
              downloadCSV(`bookings-${activeFilter.toLowerCase()}-${today}.csv`, rows)
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

      {/* Desktop table */}
      <div className="hidden sm:block bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Date', 'Time', 'Duration', 'Booking', 'Team', 'Appointment Type', 'Attendance', 'Actions'].map(col => (
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
