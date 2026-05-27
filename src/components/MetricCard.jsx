import {
  Calendar, TrendingUp, BellOff, DollarSign,
  Users, Clock, Star, CalendarCheck,
} from 'lucide-react'

const iconMap = { Calendar, TrendingUp, BellOff, DollarSign, Users, Clock, Star, CalendarCheck }

export default function MetricCard({ metric }) {
  const Icon = iconMap[metric.icon] ?? Calendar

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: '#E8F4F4' }}
        >
          <Icon size={20} style={{ color: '#1B4F4F' }} />
        </div>
        {metric.trend && (
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              metric.up
                ? 'bg-green-50 text-green-600'
                : 'bg-red-50 text-red-500'
            }`}
          >
            {metric.up ? '↑' : '↓'} {metric.trend}
          </span>
        )}
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{metric.value}</p>
        <p className="text-xs text-gray-500 mt-0.5">{metric.label}</p>
      </div>
    </div>
  )
}
