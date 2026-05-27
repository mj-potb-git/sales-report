import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { lastSignupByCluster, timeAgo, formatPHPCompact } from '../../api/lakbay'

const PRIMARY = '#1B4F4F'

// Status thresholds for "cluster health"
function clusterStatus(daysSinceLast) {
  if (daysSinceLast <= 1)  return { label: 'Active',   tone: 'bg-emerald-50 text-emerald-700', Icon: CheckCircle2 }
  if (daysSinceLast <= 3)  return { label: 'Steady',   tone: 'bg-blue-50 text-blue-700',       Icon: CheckCircle2 }
  if (daysSinceLast <= 7)  return { label: 'Slowing',  tone: 'bg-amber-50 text-amber-700',     Icon: AlertCircle }
  return                          { label: 'Dormant',  tone: 'bg-red-50 text-red-700',         Icon: AlertCircle }
}

export default function ClusterHealth({ records, onTeamClick }) {
  const rows = lastSignupByCluster(records)
  if (rows.length === 0) return null

  return (
    <section>
      <h2 className="text-base font-semibold text-gray-800 mb-3">Cluster Health</h2>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                {['Cluster', 'Status', 'Last sign-up', 'Today', 'Today rev'].map(h => (
                  <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map(r => {
                const status = clusterStatus(r.daysSinceLast)
                return (
                  <tr
                    key={r.name}
                    onClick={() => onTeamClick?.({ name: r.name })}
                    className={`hover:bg-gray-50 transition-colors ${onTeamClick ? 'cursor-pointer' : ''}`}
                  >
                    <td className="px-4 py-2.5 font-medium text-gray-900">{r.name}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold ${status.tone}`}>
                        <status.Icon size={11} />
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{timeAgo(r.lastSignupAt)}</td>
                    <td className="px-4 py-2.5 text-gray-700 font-medium">{r.todayCount}</td>
                    <td className="px-4 py-2.5 text-gray-900 font-semibold">{formatPHPCompact(r.todaySales)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
