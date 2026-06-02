import { Sun, Sparkles, Clock } from 'lucide-react'
import {
  filterByRange, rangeFor, sameDayLastWeek, sum,
  formatPHP, formatPHPCompact,
} from '../../api/lakbay'
import DeltaBadge from './DeltaBadge'

export default function TodaySnapshot({ records }) {
  const now = new Date()
  const today  = rangeFor('daily', now)
  const yest   = rangeFor('daily', new Date(now.getTime() - 86400000))
  const lwToday = sameDayLastWeek(now)

  const todayRecs    = filterByRange(records, today.start,   today.end)
  const yestRecs     = filterByRange(records, yest.start,    yest.end)
  const lwTodayRecs  = filterByRange(records, lwToday.start, lwToday.end)

  const todaySales  = sum(todayRecs, 'sales_amount')
  const yestSales   = sum(yestRecs,  'sales_amount')
  const lwSales     = sum(lwTodayRecs, 'sales_amount')

  const pct = (cur, prev) => prev === 0 ? (cur > 0 ? 100 : 0) : Math.round(((cur - prev) / prev) * 100)
  const dVsYest = pct(todaySales, yestSales)
  const dVsLW   = pct(todaySales, lwSales)

  const lastSignup = todayRecs.length
    ? todayRecs.sort((a, b) => b.transaction_id.localeCompare(a.transaction_id))[0]
    : null

  return (
    <section className="bg-gradient-to-br from-[#1B4F4F] to-[#2a6868] text-white rounded-2xl p-5 shadow-lg">
      <div className="flex items-center gap-2 mb-3 text-white/80 text-xs font-semibold uppercase tracking-wide">
        <Sun size={14} />
        Today · {now.toLocaleDateString('en-PH', { weekday: 'long', month: 'short', day: 'numeric' })}
      </div>

      <div className="flex items-end justify-between gap-3 flex-wrap mb-4">
        <div>
          <p className="text-3xl sm:text-4xl font-bold tracking-tight">{formatPHP(todaySales)}</p>
          <p className="text-white/70 text-sm mt-1">
            {todayRecs.length} sign-up{todayRecs.length === 1 ? '' : 's'} today
          </p>
        </div>
        <div className="flex flex-col gap-1.5 items-end">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-white/60">vs yesterday</span>
            <DeltaBadge delta={dVsYest} />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-white/60">vs same day last week</span>
            <DeltaBadge delta={dVsLW} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-3 border-t border-white/10">
        <div>
          <p className="text-[11px] text-white/60 uppercase tracking-wide">Yesterday</p>
          <p className="font-semibold mt-0.5">{formatPHPCompact(yestSales)} <span className="text-white/50 text-xs">· {yestRecs.length}</span></p>
        </div>
        <div>
          <p className="text-[11px] text-white/60 uppercase tracking-wide">Same day last wk</p>
          <p className="font-semibold mt-0.5">{formatPHPCompact(lwSales)} <span className="text-white/50 text-xs">· {lwTodayRecs.length}</span></p>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <p className="text-[11px] text-white/60 uppercase tracking-wide flex items-center gap-1">
            <Clock size={10} /> Last sign-up
          </p>
          <p className="font-semibold mt-0.5 truncate">
            {lastSignup
              ? <>{lastSignup.customer_name} <span className="text-white/50 text-xs">· {formatPHPCompact(lastSignup.sales_amount)}</span></>
              : <span className="text-white/50">— none yet</span>}
          </p>
        </div>
      </div>

      {todayRecs.length > 0 && todaySales >= yestSales && yestSales > 0 && (
        <div className="mt-3 flex items-center gap-1.5 text-amber-200 text-xs font-medium">
          <Sparkles size={12} /> Pacing ahead of yesterday — keep it up!
        </div>
      )}
    </section>
  )
}
