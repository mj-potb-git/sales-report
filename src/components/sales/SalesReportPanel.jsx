// Compact sales-funnel report shared by the Acquisition and AACIO tabs.
// Funnel: Booked (YCBM appointments) → Showed up → Closed (sales).
//   • Booked   = all YCBM appointments scheduled in the period (the biggest)
//   • Showed up= attended (Show-Up Rate = showed ÷ booked)
//   • Closed   = LakbayHub paid sign-ups (Closing Rate = closed ÷ showed)
// Pure presentational — the parent computes the funnel object and passes it in.
//   funnel = { revenue, booked, showed, noShow, closed, cancelled,
//              showUpRate (0-100|null), closingRate (0-100|null) }
import { CalendarPlus, UserCheck, BadgeCheck, Wallet, XCircle, Percent } from 'lucide-react'

const TEAL = '#1B4F4F'
const GOLD = '#F5A623'

function fmtInt(n) { return new Intl.NumberFormat('en-PH').format(n || 0) }
function fmtPHP(n) {
  return '₱' + new Intl.NumberFormat('en-PH', { maximumFractionDigits: 0 }).format(Math.round(n || 0))
}

function Stat({ icon: Icon, label, value, sub, accent = TEAL }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-3 flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5 text-gray-400">
        <Icon size={14} style={{ color: accent }} />
        <span className="text-[10px] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <span className="text-xl font-bold leading-tight" style={{ color: accent }}>{value}</span>
      {sub && <span className="text-[11px] text-gray-400">{sub}</span>}
    </div>
  )
}

// One funnel step with a proportional bar relative to the widest step.
function FunnelStep({ icon: Icon, label, count, max, color, pct }) {
  const width = max > 0 ? Math.max(4, Math.round((count / max) * 100)) : 4
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5 w-32 flex-shrink-0">
        <Icon size={14} style={{ color }} />
        <span className="text-xs font-medium text-gray-600">{label}</span>
      </div>
      <div className="flex-1 h-6 bg-gray-100 rounded-md overflow-hidden">
        <div className="h-full rounded-md flex items-center px-2" style={{ width: `${width}%`, backgroundColor: color }}>
          <span className="text-[11px] font-bold text-white whitespace-nowrap">{fmtInt(count)}</span>
        </div>
      </div>
      <span className="text-[11px] text-gray-400 w-12 text-right flex-shrink-0">
        {pct != null ? `${pct}%` : ''}
      </span>
    </div>
  )
}

export default function SalesReportPanel({ title = 'Sales Report', periodLabel, funnel, loading = false, note }) {
  const f = funnel || {}
  const booked = f.booked || 0
  const showed = f.showed || 0
  const closed = f.closed || 0
  const max = Math.max(booked, showed, closed, 1)

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Booked → Showed up → Closed{periodLabel ? ` · ${periodLabel}` : ''}
          </p>
        </div>
        <span className="text-2xl font-extrabold" style={{ color: TEAL }}>{fmtPHP(f.revenue)}</span>
      </div>

      <div className="p-5 flex flex-col gap-4">
        {loading && booked + showed + closed === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">Loading YCBM bookings…</p>
        ) : (
          <>
            {/* Funnel bars: Booked (appointments) → Showed up → Closed */}
            <div className="flex flex-col gap-2">
              <FunnelStep icon={CalendarPlus} label="Booked (appointments)" count={booked} max={max} color="#4ECDC4" />
              <FunnelStep icon={UserCheck}    label="Showed up"             count={showed} max={max} color={GOLD}
                pct={booked > 0 ? Math.round((showed / booked) * 100) : null} />
              <FunnelStep icon={BadgeCheck}   label="Closed (sales)"        count={closed} max={max} color={TEAL}
                pct={showed > 0 ? Math.round((closed / showed) * 100) : null} />
            </div>

            {/* Key rates + money */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
              <Stat icon={UserCheck} label="Show-Up Rate" accent={GOLD}
                value={f.showUpRate != null ? `${f.showUpRate}%` : '—'} sub="showed ÷ booked" />
              <Stat icon={Percent}  label="Closing Rate" accent={TEAL}
                value={f.closingRate != null ? `${f.closingRate}%` : '—'} sub="closed ÷ showed" />
              <Stat icon={Wallet}   label="Revenue" accent={TEAL}
                value={fmtPHP(f.revenue)} sub={`${fmtInt(closed)} closed`} />
              <Stat icon={XCircle}  label="Cancelled" accent="#dc2626"
                value={fmtInt(f.cancelled)} sub="cancelled bookings" />
            </div>
            {note && <p className="text-[11px] text-gray-400">{note}</p>}
          </>
        )}
      </div>
    </section>
  )
}
