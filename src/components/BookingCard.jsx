import { useState } from 'react'
import { MoreVertical, Clock, Calendar, Users } from 'lucide-react'
import StatusBadge from './StatusBadge'
import AttendanceToggle from './AttendanceToggle'

export default function BookingCard({ booking }) {
  const [menuOpen, setMenuOpen] = useState(false)

  const initials = booking.name
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 relative">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
            style={{ backgroundColor: '#1B4F4F' }}
          >
            {initials}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 truncate">{booking.name}</p>
            <p className="text-xs text-gray-500 truncate">{booking.appointmentType}</p>
          </div>
        </div>

        <div className="relative flex-shrink-0">
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="Actions"
          >
            <MoreVertical size={16} className="text-gray-500" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-8 bg-white border border-gray-100 rounded-xl shadow-lg z-10 min-w-[140px] py-1">
              {['View', 'Edit', 'Cancel'].map(action => (
                <button
                  key={action}
                  onClick={() => setMenuOpen(false)}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  {action}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <Calendar size={12} />
          {booking.date}
        </span>
        <span className="flex items-center gap-1">
          <Clock size={12} />
          {booking.time} · {booking.duration}
        </span>
        <span className="flex items-center gap-1">
          <Users size={12} />
          {booking.team}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <AttendanceToggle bookingId={booking.id} />
        {booking.status && <StatusBadge status={booking.status} />}
      </div>
    </div>
  )
}
