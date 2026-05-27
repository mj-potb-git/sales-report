import { Target, TrendingUp, TrendingDown } from 'lucide-react'
import { paceProjection, formatPHP, formatPHPCompact } from '../../api/lakbay'
import { getSettings } from '../../lib/settings'

const PRIMARY = '#1B4F4F'
const ACCENT  = '#F5A623'

export default function TargetProgress({ records }) {
  const { monthlyTarget } = getSettings()
  const p = paceProjection(records, monthlyTarget)
  const daysLeft = p.daysInMonth - p.daysElapsed
  const pctFilled = Math.min(100, p.targetPercent)
  const isAhead = p.paceVsTarget >= 0
  const onTrackPct = Math.round((p.daysElapsed / p.daysInMonth) * 100)

  return (
    <section className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="flex items-center gap-2 text-gray-500 text-xs font-semibold uppercase tracking-wide">
            <Target size={13} />
            Monthly Target
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {formatPHP(p.mtd)} <span className="text-gray-400 text-base font-medium">/ {formatPHPCompact(monthlyTarget)}</span>
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {p.targetPercent}% of target · {daysLeft} day{daysLeft === 1 ? '' : 's'} left
          </p>
        </div>
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold ${
          isAhead ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
        }`}>
          {isAhead ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
          {isAhead ? 'Ahead' : 'Behind'} by {formatPHPCompact(Math.abs(p.paceVsTarget))}
        </div>
      </div>

      <div className="relative h-3 bg-gray-100 rounded-full overflow-hidden">
        {/* "Where you should be" tick */}
        <div
          className="absolute top-0 bottom-0 w-px bg-gray-400 z-10"
          style={{ left: `${onTrackPct}%` }}
          title={`Should be here on day ${p.daysElapsed} of ${p.daysInMonth}`}
        />
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pctFilled}%`,
            backgroundColor: isAhead ? PRIMARY : ACCENT,
          }}
        />
      </div>

      <div className="grid grid-cols-3 gap-3 mt-4 pt-3 border-t border-gray-100">
        <div>
          <p className="text-[11px] text-gray-500 uppercase tracking-wide">Run rate</p>
          <p className="text-sm font-semibold text-gray-900 mt-0.5">{formatPHPCompact(p.dailyRunRate)}/day</p>
        </div>
        <div>
          <p className="text-[11px] text-gray-500 uppercase tracking-wide">Projected</p>
          <p className="text-sm font-semibold text-gray-900 mt-0.5">{formatPHPCompact(p.projected)}</p>
        </div>
        <div>
          <p className="text-[11px] text-gray-500 uppercase tracking-wide">Need /day</p>
          <p className="text-sm font-semibold text-gray-900 mt-0.5">
            {daysLeft > 0 ? formatPHPCompact(Math.max(0, (monthlyTarget - p.mtd) / daysLeft)) : '—'}
          </p>
        </div>
      </div>
    </section>
  )
}
