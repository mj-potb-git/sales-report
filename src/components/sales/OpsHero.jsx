// Operations "hero" band — answers "is this period good?" in one glance.
// Big revenue number + a plain-language verdict + compact secondary stats.

import { TrendingUp, TrendingDown } from 'lucide-react'
import { formatPHP, formatPHPCompact } from '../../api/lakbay'
import { PRIMARY as TEAL, PRIMARY_DARK } from '../../lib/theme'

function Stat({ label, value }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] uppercase tracking-wide text-white/60">{label}</span>
      <span className="text-lg font-bold text-white leading-tight">{value}</span>
    </div>
  )
}

export default function OpsHero({
  periodLabel, revenue = 0, spend = 0, profit = 0, roas = null,
  salesCount = 0, showUpRate = null, bookings = 0, deltaSales = null,
}) {
  // Verdict — one quick read on health
  let verdict
  if (revenue === 0) verdict = { text: 'No sales yet', tone: 'rgba(255,255,255,0.18)' }
  else if (profit > 0 && roas !== null && roas >= 2) verdict = { text: '🚀 Strong', tone: '#16a34a' }
  else if (profit > 0) verdict = { text: '✅ Profitable', tone: '#16a34a' }
  else verdict = { text: '⚠️ Below breakeven', tone: '#d97706' }

  return (
    <section
      className="rounded-2xl p-5 sm:p-6 shadow-sm text-white"
      style={{ background: `linear-gradient(135deg, ${TEAL} 0%, ${PRIMARY_DARK} 100%)` }}
    >
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        {/* Hero number */}
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] uppercase tracking-widest text-white/70">Gross Revenue · {periodLabel}</span>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: verdict.tone }}>
              {verdict.text}
            </span>
          </div>
          <div className="flex items-end gap-3 mt-1">
            <span className="text-4xl sm:text-5xl font-extrabold tracking-tight">{formatPHP(revenue)}</span>
            {deltaSales !== null && deltaSales !== undefined && (
              <span className={`mb-1.5 inline-flex items-center gap-0.5 text-sm font-semibold ${deltaSales >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                {deltaSales >= 0 ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
                {Math.abs(deltaSales)}%
              </span>
            )}
          </div>
          <p className="text-sm text-white/70 mt-1">
            {salesCount} sales · {formatPHPCompact(profit)} profit · {roas === null ? '—' : `${roas.toFixed(2)}x`} ROAS
          </p>
        </div>

        {/* Secondary stats */}
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-x-6 gap-y-3 bg-white/5 rounded-xl px-4 py-3">
          <Stat label="Ad Spend" value={formatPHPCompact(spend)} />
          <Stat label="ROAS" value={roas === null ? '—' : `${roas.toFixed(2)}x`} />
          <Stat label="Profit" value={formatPHPCompact(profit)} />
          <Stat label="Bookings" value={String(bookings)} />
          <Stat label="Show-Up" value={showUpRate === null ? '—' : `${showUpRate}%`} />
        </div>
      </div>
    </section>
  )
}
