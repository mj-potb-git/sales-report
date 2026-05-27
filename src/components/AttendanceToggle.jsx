import { useState, useEffect } from 'react'
import { Check, X, Circle } from 'lucide-react'
import { getStatus, cycleStatus, subscribeAttendance } from '../lib/attendance'

// 3-state toggle: unset (gray) → showed (green) → no_show (red) → unset
export default function AttendanceToggle({ bookingId, size = 'sm' }) {
  const [status, setStatus] = useState(getStatus(bookingId))

  useEffect(() => {
    const unsub = subscribeAttendance(() => setStatus(getStatus(bookingId)))
    return unsub
  }, [bookingId])

  const cfg =
    status === 'showed' ? { Icon: Check, label: 'Showed up', tone: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' }
  : status === 'no_show' ? { Icon: X,    label: 'No show',   tone: 'bg-red-100 text-red-700 hover:bg-red-200' }
  :                       { Icon: Circle, label: 'Mark',     tone: 'bg-gray-100 text-gray-400 hover:bg-gray-200' }

  const px = size === 'sm' ? 'px-2 py-1 text-[11px]' : 'px-3 py-1.5 text-xs'

  return (
    <button
      onClick={(e) => { e.stopPropagation(); cycleStatus(bookingId) }}
      title="Click to cycle: unset → showed → no-show → unset"
      className={`inline-flex items-center gap-1 rounded-md font-semibold transition-colors ${px} ${cfg.tone}`}
    >
      <cfg.Icon size={11} />
      {cfg.label}
    </button>
  )
}
