// Compact AACIO snapshot for the Overview tab.
//
// IMPORTANT: this is a SEPARATE, self-contained card. AACIO's external-team
// sales are intentionally NOT folded into MJ's company-wide Overview totals
// (those come from Fusioo). This just gives a one-glance peek so MJ doesn't
// have to switch tabs — full detail lives in the AACIO tab.

import { useEffect, useMemo, useState } from 'react'
import { Globe, CalendarCheck, Wallet, Receipt, ArrowRight } from 'lucide-react'
import useAacioData from '../hooks/useAacioData'
import {
  fetchSalesRecords, filterByRange, sum, startOfMonth, endOfMonth,
  startOfDay, formatPHP, formatPHPCompact,
} from '../api/lakbay'

const PRIMARY = '#1B4F4F'
const ACCENT  = '#F5A623'
const isExternalCluster = (team) => /external/i.test(team || '')

function Stat({ icon: Icon, label, value, sub, accent = PRIMARY }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5 text-gray-400">
        <Icon size={13} style={{ color: accent }} />
        <span className="text-[10px] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <span className="text-lg font-bold" style={{ color: accent }}>{value}</span>
      {sub && <span className="text-[11px] text-gray-400 leading-tight">{sub}</span>}
    </div>
  )
}

export default function AacioOverviewCard({ onJumpTab }) {
  const { bookings, loading } = useAacioData()
  const [extSales, setExtSales] = useState([])

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const recs = await fetchSalesRecords()
        if (alive) setExtSales(recs.filter(r => isExternalCluster(r.team)))
      } catch { /* shared cache logs */ }
    }
    load()
    const id = setInterval(load, 30_000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  const now = new Date()
  const mStart = startOfMonth(now)
  const mEnd   = endOfMonth(now)
  const todayStart = startOfDay(now)

  const snapshot = useMemo(() => {
    // Bookings scheduled this month (active only)
    const monthBookings = bookings.filter(b => {
      const t = new Date(b.startsAt).getTime()
      return !b.cancelled && t >= mStart.getTime() && t <= mEnd.getTime()
    })
    const todayBookings = monthBookings.filter(b => new Date(b.startsAt).getTime() >= todayStart.getTime()
      && new Date(b.startsAt).getTime() < todayStart.getTime() + 86400000)

    const monthSales = filterByRange(extSales, mStart, mEnd)
    const revenue = sum(monthSales, 'sales_amount')

    return {
      activeBookings: monthBookings.length,
      todayBookings: todayBookings.length,
      salesCount: monthSales.length,
      revenue,
      avg: monthSales.length ? revenue / monthSales.length : 0,
    }
  }, [bookings, extSales, mStart, mEnd, todayStart])

  return (
    <section className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <span className="w-7 h-7 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#FFF4E0' }}>
            <Globe size={15} style={{ color: ACCENT }} />
          </span>
          AACIO · External Team · This Month
        </h3>
        <button
          onClick={() => onJumpTab?.('aacio')}
          className="text-[11px] font-semibold hover:underline flex items-center gap-0.5"
          style={{ color: PRIMARY }}
        >
          Full report <ArrowRight size={11} />
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Stat icon={CalendarCheck} label="Bookings" value={loading ? '…' : snapshot.activeBookings}
          sub={`${snapshot.todayBookings} today`} />
        <Stat icon={Receipt} label="Sales" value={snapshot.salesCount}
          sub="tagged external" accent={ACCENT} />
        <Stat icon={Wallet} label="Revenue" value={formatPHPCompact(snapshot.revenue)}
          sub={formatPHP(snapshot.revenue)} accent={ACCENT} />
        <Stat icon={Wallet} label="Avg Deal" value={formatPHPCompact(snapshot.avg)}
          sub="revenue ÷ sales" />
      </div>
      <p className="text-[10px] text-gray-400 mt-3 pt-3 border-t border-gray-100">
        Hiwalay sa company totals — AACIO is the external team's own YCBM + LakbayHub external-cluster sales.
      </p>
    </section>
  )
}
