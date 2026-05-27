import { useState, useMemo } from 'react'
import { Filter, Download, ChevronLeft, ChevronRight, MoreVertical } from 'lucide-react'
import BookingCard from './BookingCard'
import StatusBadge from './StatusBadge'
import AttendanceToggle from './AttendanceToggle'

const VIEW_FILTERS = ['Upcoming', 'Past', 'Date Range']
const PER_PAGE = 10

export default function BookingsTab({ bookings = [] }) {
  const [activeFilter, setActiveFilter] = useState('Upcoming')
  const [page, setPage] = useState(1)
  const [openMenu, setOpenMenu] = useState(null)

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

          <button
            aria-label="Export"
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-colors"
            style={{ backgroundColor: '#1B4F4F' }}
          >
            <Download size={15} />
            <span className="hidden sm:inline">Export</span>
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
