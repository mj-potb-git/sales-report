// Uniform period selector used across all tabs:
// Yesterday · Today · This Week · Monthly (with a month dropdown) · + Custom.

import DateRangePicker from './DateRangePicker'
import { UNIFORM_PERIODS, monthOptions } from '../lib/periods'

export default function PeriodBar({
  periodId, onPeriod,
  monthKey, onMonth,
  customDates = [], isCustom = false, onApplyCustom,
}) {
  const months = monthOptions(12)
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
        {UNIFORM_PERIODS.map(p => {
          const active = !isCustom && periodId === p.id
          return (
            <button
              key={p.id}
              onClick={() => onPeriod(p.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                active ? 'bg-white text-[#1B4F4F] shadow-sm font-semibold' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {p.label}
            </button>
          )
        })}
      </div>

      {/* Month dropdown — only when Monthly is active */}
      {!isCustom && periodId === 'month' && (
        <select
          value={monthKey || months[0].key}
          onChange={(e) => onMonth(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 bg-white text-[#1B4F4F] focus:outline-none focus:border-[#1B4F4F]"
        >
          {months.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
      )}

      {onApplyCustom && (
        <DateRangePicker value={customDates} active={isCustom} onApply={onApplyCustom} />
      )}
    </div>
  )
}
