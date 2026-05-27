import { useMemo } from 'react'
import { Activity, ExternalLink } from 'lucide-react'
import { formatPHP, parseDate } from '../../api/lakbay'

const PRIMARY = '#1B4F4F'

const statusTone = (s) => {
  if (s === 'PAID')      return 'bg-emerald-50 text-emerald-700'
  if (s === 'PENDING')   return 'bg-amber-50 text-amber-700'
  if (s === 'REFUNDED')  return 'bg-red-50 text-red-700'
  return 'bg-gray-100 text-gray-600'
}

export default function LiveActivityFeed({ records, limit = 10 }) {
  const recent = useMemo(() => {
    return [...records]
      .sort((a, b) => {
        // Sort by date descending, then by transaction_id desc as tiebreaker
        const dA = parseDate(a.date).getTime()
        const dB = parseDate(b.date).getTime()
        if (dA !== dB) return dB - dA
        return (b.transaction_id || '').localeCompare(a.transaction_id || '')
      })
      .slice(0, limit)
  }, [records, limit])

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-base font-semibold text-gray-800">Live Activity</h2>
        <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
          updating every 5s
        </span>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-50 overflow-hidden">
        {recent.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-400 text-sm">
            <Activity size={20} className="mx-auto mb-2 opacity-50" />
            No sign-ups yet
          </div>
        ) : recent.map((r, i) => {
          const initials = r.customer_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
          const status = r.meta?.payment_status
          return (
            <div key={r.transaction_id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                   style={{ backgroundColor: PRIMARY }}>
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-gray-900 truncate">{r.customer_name}</p>
                  {status && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold uppercase ${statusTone(status)}`}>
                      {status}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 truncate">
                  {r.meta?.package || 'Package'} · {r.team}
                  {r.meta?.email && <span className="text-gray-400"> · {r.meta.email}</span>}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-bold text-gray-900">{formatPHP(r.sales_amount)}</p>
                <p className="text-[11px] text-gray-400">{r.date}</p>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
