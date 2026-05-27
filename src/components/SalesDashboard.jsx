// Operations monitoring view — mirrors the POTB Meta Ads spreadsheet layout.
// Combines:
//   - YCBM bookings (live)
//   - Manual attendance markings (localStorage)
//   - LakbayHub sales (live, for revenue + conversion)
//   - Meta Ads (placeholder rows for now — manual entry until API is wired)

import { useEffect, useMemo, useState } from 'react'
import {
  Calendar, Clock, CheckCircle2, XCircle, AlertCircle,
  DollarSign, TrendingUp, TrendingDown, Users, ChevronRight,
  Minus, Activity, ArrowRight,
} from 'lucide-react'
import { attendanceStats, getStatus, subscribeAttendance } from '../lib/attendance'
import { fetchSalesRecords, formatPHP, formatPHPCompact, parseDate } from '../api/lakbay'
import { fetchMetaDailyMap } from '../api/meta'

const PRIMARY = '#1B4F4F'
const TIME_SLOTS = [10, 15, 19, 20, 21] // 10AM, 3PM, 7PM, 8PM, 9PM (typical POTB session times)

const PERIODS = [
  { id: 'today',   label: 'Today',     days: 1,  compareLabel: 'vs yesterday' },
  { id: 'weekly',  label: 'This Week', days: 7,  compareLabel: 'vs last week' },
  { id: 'biweek',  label: '14 Days',   days: 14, compareLabel: 'vs prior 14d' },
  { id: 'monthly', label: 'This Month',days: 30, compareLabel: 'vs last month' },
]

// ---------------------------------------------------------------------------
// Helpers

function startOfDay(d) { const x = new Date(d); x.setHours(0,0,0,0); return x }

function formatDayLabel(d) {
  return d.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })
}
// Use LOCAL date components (not UTC). YCBM returns startsAt without TZ
// so it's interpreted as local; bucketing must also use local components or
// the columns end up one day off in PHT.
function formatDateISO(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function hourLabel(h) {
  return h === 0 ? '12AM' : h < 12 ? `${h}AM` : h === 12 ? '12PM' : `${h - 12}PM`
}

// Last N days as Date objects (oldest → newest)
function lastNDays(n, anchor = new Date()) {
  const today = startOfDay(anchor)
  return Array.from({ length: n }, (_, i) => new Date(today.getTime() - (n - 1 - i) * 86400000))
}

// Group bookings by date string YYYY-MM-DD
function groupByDate(bookings) {
  const map = new Map()
  for (const b of bookings) {
    const key = formatDateISO(new Date(b.startsAt))
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(b)
  }
  return map
}

// Group sales records by date string YYYY-MM-DD
function groupSalesByDate(records) {
  const map = new Map()
  for (const r of records) {
    const key = r.date
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(r)
  }
  return map
}

// ---------------------------------------------------------------------------
// Sub-components

function MetricRow({ label, values, formatter = String, accent = false, bold = false }) {
  return (
    <tr className={accent ? 'bg-gray-50' : ''}>
      <th className={`px-3 py-2 text-left text-xs uppercase tracking-wide whitespace-nowrap sticky left-0 z-10 ${
        accent ? 'bg-gray-50 text-gray-700 font-bold' : 'bg-white text-gray-600 font-semibold'
      }`}>
        {label}
      </th>
      {values.map((v, i) => (
        <td key={i} className={`px-3 py-2 text-sm whitespace-nowrap text-center ${
          bold ? 'font-bold text-gray-900' : 'text-gray-700'
        }`}>
          {formatter(v)}
        </td>
      ))}
    </tr>
  )
}

function SectionHeaderRow({ label, span, color = '#1B4F4F' }) {
  return (
    <tr>
      <th colSpan={span} className="px-3 py-1.5 text-left text-[11px] uppercase tracking-widest font-bold text-white sticky left-0"
          style={{ backgroundColor: color }}>
        {label}
      </th>
    </tr>
  )
}

function HeatCell({ attendees, bookings }) {
  if (bookings === 0) {
    return <td className="px-2 py-1.5 text-center text-gray-300 text-xs">—</td>
  }
  const ratio = attendees / bookings
  const tone =
    ratio >= 0.7 ? 'bg-emerald-100 text-emerald-800'
  : ratio >= 0.4 ? 'bg-amber-100 text-amber-800'
  : ratio >= 0   ? 'bg-red-100 text-red-800'
  :                'bg-gray-100 text-gray-600'
  return (
    <td className="px-2 py-1.5 text-center">
      <span className={`inline-block min-w-[60px] px-2 py-0.5 rounded-md text-[11px] font-semibold ${tone}`}>
        {attendees}/{bookings}
      </span>
    </td>
  )
}

// ---------------------------------------------------------------------------

export default function SalesDashboard({ bookings = [] }) {
  const [periodId, setPeriodId] = useState('biweek')
  const period = PERIODS.find(p => p.id === periodId) ?? PERIODS[2]
  const DAYS_BACK = period.days

  const days = useMemo(() => lastNDays(DAYS_BACK), [DAYS_BACK])
  // Previous period (same length, immediately before current window) for comparison
  const priorDays = useMemo(() => {
    const today = startOfDay(new Date())
    return Array.from({ length: DAYS_BACK }, (_, i) =>
      new Date(today.getTime() - (DAYS_BACK + DAYS_BACK - 1 - i) * 86400000))
  }, [DAYS_BACK])
  const dayKeys      = days.map(formatDateISO)
  const priorDayKeys = priorDays.map(formatDateISO)

  // Pull LakbayHub sales for cross-source correlation
  const [salesByDate, setSalesByDate] = useState(new Map())
  useEffect(() => {
    let cancelled = false
    fetchSalesRecords()
      .then(recs => { if (!cancelled) setSalesByDate(groupSalesByDate(recs)) })
      .catch(() => {})
    // Refresh sales every 30s so cross-source stays roughly in sync
    const id = setInterval(() => {
      fetchSalesRecords()
        .then(recs => { if (!cancelled) setSalesByDate(groupSalesByDate(recs)) })
        .catch(() => {})
    }, 30_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  // Pull Meta Ads daily insights — always fetch 60 days to cover both current
  // and previous comparison windows in one call. Sliced per period when used.
  const [metaByDate, setMetaByDate] = useState(new Map())
  const [metaError, setMetaError] = useState(null)
  useEffect(() => {
    let cancelled = false
    const load = () =>
      fetchMetaDailyMap({ days: 60 })
        .then(m => { if (!cancelled) { setMetaByDate(m); setMetaError(null) } })
        .catch(e => { if (!cancelled) setMetaError(e) })
    load()
    const id = setInterval(load, 60_000) // Meta data updates more slowly than YCBM
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  // Re-render when attendance markings change (toggles in Bookings tab)
  const [attendanceTick, bumpAttendance] = useState(0)
  useEffect(() => subscribeAttendance(() => bumpAttendance(n => n + 1)), [])

  const bookingsByDate = useMemo(() => {
    // Use ALL bookings (past + future) so we can show the matrix
    return groupByDate(bookings)
  }, [bookings])

  // Per-day computed metrics for the table
  const perDay = days.map(day => {
    const key = formatDateISO(day)
    const dayBookings = (bookingsByDate.get(key) || []).filter(b => !b.raw?.cancelled)
    const dayCancelled = (bookingsByDate.get(key) || []).filter(b => b.raw?.cancelled)
    const attendance = attendanceStats(dayBookings)
    const daySales = salesByDate.get(key) || []
    const salesAmount = daySales.reduce((a, r) => a + (r.sales_amount || 0), 0)
    const salesCount = daySales.length
    const meta = metaByDate.get(key) || null
    // Conversion = sales / show-ups (or sales / bookings if no attendance tracked)
    const denom = attendance.tracked > 0 ? attendance.showed : dayBookings.length
    const conversion = denom > 0 ? Math.round((salesCount / denom) * 100) : null
    // Ads-side metrics
    const spend = meta?.spend || 0
    const leads = meta?.leads || 0
    const cpl   = leads > 0   ? Math.round(spend / leads)        : null  // ₱ per lead
    const cac   = salesCount > 0 ? Math.round(spend / salesCount) : null  // ₱ per sale
    const roas  = spend > 0   ? +(salesAmount / spend).toFixed(2): null
    const arPct = salesAmount > 0 ? Math.round((spend / salesAmount) * 100) : null

    // Additional funnel percentages
    const totalBookingsInclCancelled = dayBookings.length + dayCancelled.length
    const cancellationPct = totalBookingsInclCancelled > 0
      ? Math.round((dayCancelled.length / totalBookingsInclCancelled) * 100) : null
    const leadToBookPct = leads > 0 ? Math.round((dayBookings.length / leads) * 100) : null
    const showUpPct  = attendance.tracked > 0 ? attendance.showUpRate : null
    const noShowPct  = attendance.tracked > 0 ? Math.round((attendance.noShow / attendance.tracked) * 100) : null
    const bookToSalePct = dayBookings.length > 0 ? Math.round((salesCount / dayBookings.length) * 100) : null
    const showToSalePct = attendance.showed > 0 ? Math.round((salesCount / attendance.showed) * 100) : null
    const avgOrderValue = salesCount > 0 ? Math.round(salesAmount / salesCount) : null

    return {
      day, key,
      totalBookings:  dayBookings.length,
      cancelled:      dayCancelled.length,
      cancellationPct,
      showed:         attendance.showed,
      noShow:         attendance.noShow,
      unset:          attendance.unset,
      showUpRate:     attendance.showUpRate,
      showUpPct, noShowPct,
      leadToBookPct, bookToSalePct, showToSalePct,
      avgOrderValue,
      salesAmount,
      salesCount,
      conversion,
      // Meta Ads metrics
      spend,
      leads,
      cpl, cac, roas, arPct,
      // time-slot breakdown
      bySlot: TIME_SLOTS.map(h => {
        const slotBookings = dayBookings.filter(b => new Date(b.startsAt).getHours() === h)
        const slotShowed   = slotBookings.filter(b => getStatus(b.id) === 'showed').length
        return { hour: h, bookings: slotBookings.length, attendees: slotShowed }
      }),
    }
  })

  // Totals across the visible window
  const totals = perDay.reduce((acc, d) => ({
    bookings:   acc.bookings   + d.totalBookings,
    cancelled:  acc.cancelled  + d.cancelled,
    showed:     acc.showed     + d.showed,
    noShow:     acc.noShow     + d.noShow,
    sales:      acc.sales      + d.salesAmount,
    salesCount: acc.salesCount + d.salesCount,
    spend:      acc.spend      + (d.spend || 0),
    leads:      acc.leads      + (d.leads || 0),
  }), { bookings: 0, cancelled: 0, showed: 0, noShow: 0, sales: 0, salesCount: 0, spend: 0, leads: 0 })

  const totalROAS = totals.spend > 0 ? +(totals.sales / totals.spend).toFixed(2) : null
  const totalARPct = totals.sales > 0 ? Math.round((totals.spend / totals.sales) * 100) : null
  const totalCPL = totals.leads > 0 ? Math.round(totals.spend / totals.leads) : null
  const totalCAC = totals.salesCount > 0 ? Math.round(totals.spend / totals.salesCount) : null
  const totalCVR = totals.leads > 0 ? Math.round((totals.salesCount / totals.leads) * 100) : null

  // --- Prior-period totals for comparison ---
  const prior = priorDays.reduce((acc, day) => {
    const key = formatDateISO(day)
    const dayBookings = (bookingsByDate.get(key) || []).filter(b => !b.raw?.cancelled)
    const daySales = salesByDate.get(key) || []
    const m = metaByDate.get(key)
    return {
      bookings:   acc.bookings   + dayBookings.length,
      sales:      acc.sales      + daySales.reduce((a, r) => a + (r.sales_amount || 0), 0),
      salesCount: acc.salesCount + daySales.length,
      spend:      acc.spend      + (m?.spend || 0),
      leads:      acc.leads      + (m?.leads || 0),
    }
  }, { bookings: 0, sales: 0, salesCount: 0, spend: 0, leads: 0 })

  // Percent change current vs prior, treating 0-prior as 100% positive
  const pct = (cur, pri) => pri === 0 ? (cur > 0 ? 100 : 0) : Math.round(((cur - pri) / pri) * 100)
  const delta = {
    bookings:   pct(totals.bookings,   prior.bookings),
    sales:      pct(totals.sales,      prior.sales),
    salesCount: pct(totals.salesCount, prior.salesCount),
    spend:      pct(totals.spend,      prior.spend),
    leads:      pct(totals.leads,      prior.leads),
  }

  const totalAttendance = totals.showed + totals.noShow
  const overallShowUpRate = totalAttendance > 0
    ? Math.round((totals.showed / totalAttendance) * 100)
    : null
  const overallNoShowRate = totalAttendance > 0
    ? Math.round((totals.noShow / totalAttendance) * 100)
    : null
  const overallBookToSale = totals.bookings > 0
    ? Math.round((totals.salesCount / totals.bookings) * 100) : 0
  const overallShowToSale = totals.showed > 0
    ? Math.round((totals.salesCount / totals.showed) * 100) : null
  const overallLeadToBook = totals.leads > 0
    ? Math.round((totals.bookings / totals.leads) * 100) : null
  const overallCancellationRate = (totals.bookings + totals.cancelled) > 0
    ? Math.round((totals.cancelled / (totals.bookings + totals.cancelled)) * 100) : 0
  const overallConversion = overallShowUpRate !== null ? overallShowToSale : overallBookToSale

  return (
    <div className="flex flex-col gap-5 pb-24 sm:pb-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Operations Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            POTB · {period.label} ({DAYS_BACK === 1 ? 'today' : `last ${DAYS_BACK} days`}) · YCBM × LakbayHub × Meta Ads × Attendance
          </p>
        </div>
        <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
          {PERIODS.map(p => (
            <button
              key={p.id}
              onClick={() => setPeriodId(p.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                periodId === p.id
                  ? 'bg-white text-[#1B4F4F] shadow-sm font-semibold'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Section 1: Marketing Funnel KPIs (combined Meta + YCBM + Attendance) */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="w-1.5 h-5 rounded-full" style={{ backgroundColor: PRIMARY }} />
          <h2 className="text-sm font-semibold text-gray-700">Marketing Funnel · Leads → Bookings → Attendance</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <KpiCard icon={Users}        label="Leads (Meta)"  value={String(totals.leads)}     accent="#dbeafe" delta={delta.leads}    compareLabel={period.compareLabel} />
          <KpiCard icon={Calendar}     label="Bookings"      value={String(totals.bookings)}  accent="#E8F4F4" delta={delta.bookings} compareLabel={period.compareLabel}
                   sub={overallLeadToBook === null ? '' : `Lead→Book ${overallLeadToBook}%`} />
          <KpiCard icon={CheckCircle2} label="Showed Up"     value={String(totals.showed)}    accent="#dcfce7"
                   sub={overallShowUpRate === null ? 'untracked' : `${overallShowUpRate}% show-up`} />
          <KpiCard icon={XCircle}      label="No-Show"       value={String(totals.noShow)}    accent="#fee2e2"
                   sub={overallNoShowRate === null ? '' : `${overallNoShowRate}% no-show`} />
          <KpiCard icon={AlertCircle}  label="Cancelled"     value={String(totals.cancelled)} accent="#fef3c7"
                   sub={`${overallCancellationRate}% cancellation`} />
          <KpiCard icon={TrendingUp}   label="Show-Up Rate"
                   value={overallShowUpRate === null ? '—' : `${overallShowUpRate}%`}
                   sub={overallShowUpRate === null ? 'mark in Bookings tab' : `${totals.showed} / ${totalAttendance}`} />
          <KpiCard icon={Activity}     label="Unmarked"
                   value={String(totals.bookings - totalAttendance)}
                   sub="need attendance status" />
        </div>
      </div>

      {/* Section 2: Sales KPIs (LakbayHub only, separate) */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="w-1.5 h-5 rounded-full" style={{ backgroundColor: '#F5A623' }} />
          <h2 className="text-sm font-semibold text-gray-700">Sales · LakbayHub Revenue & Conversion</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
          <KpiCard icon={DollarSign} label="Gross Revenue" value={formatPHPCompact(totals.sales)} sub={`${totals.salesCount} sales`} accent="#FFF4E0" delta={delta.sales} compareLabel={period.compareLabel} />
          <KpiCard icon={Users}      label="# of Sales"    value={String(totals.salesCount)} accent="#FFF4E0" delta={delta.salesCount} compareLabel={period.compareLabel} />
          <KpiCard icon={TrendingUp} label="Book → Sale %" value={`${overallBookToSale}%`} sub="bookings → sales" />
          <KpiCard icon={TrendingUp} label="Show → Sale %" value={overallShowToSale === null ? '—' : `${overallShowToSale}%`} sub="showed-up → sales" />
          <KpiCard icon={DollarSign} label="Avg Order"     value={totals.salesCount === 0 ? '—' : formatPHPCompact(totals.sales / totals.salesCount)} sub="per sale" />
        </div>
      </div>

      {/* Visual funnel: Leads → Bookings → Showed → Sales */}
      <FunnelVisualization
        leads={totals.leads}
        bookings={totals.bookings}
        showed={totals.showed}
        unmarked={totals.bookings - totalAttendance}
        salesCount={totals.salesCount}
        revenue={totals.sales}
      />

      {/* The spreadsheet-style matrix */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-semibold text-gray-900">Daily Performance Matrix</h2>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Each column = one day · attendance: <span className="font-bold">{totals.showed}</span> showed, <span className="font-bold">{totals.noShow}</span> no-show, <span className="font-bold">{totals.bookings - totalAttendance}</span> unmarked
              {totalAttendance === 0 && <> · go to <b>Bookings → Auto-fill</b> to populate</>}
            </p>
          </div>
          <span className="text-[11px] text-gray-500">
            Color legend:
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 mx-1.5"></span> ≥70%
            <span className="inline-block w-2 h-2 rounded-full bg-amber-400 mx-1.5"></span> 40-69%
            <span className="inline-block w-2 h-2 rounded-full bg-red-400 mx-1.5"></span> &lt;40%
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-700 uppercase tracking-wide whitespace-nowrap sticky left-0 bg-gray-50 z-10">Metric</th>
                {days.map((d, i) => (
                  <th key={i} className="px-3 py-2 text-center text-[11px] font-semibold text-gray-600 whitespace-nowrap">
                    {formatDayLabel(d)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* MARKETING FUNNEL — combined Meta + YCBM + attendance */}
              <SectionHeaderRow label="MARKETING FUNNEL · Leads → Bookings → Attendance" span={days.length + 1} color="#1B4F4F" />
              <MetricRow label="Leads (Meta)"
                values={perDay.map(d => d.leads)}
                formatter={v => v === 0 ? '—' : String(v)} bold />
              <MetricRow label="Bookings (YCBM)"
                values={perDay.map(d => d.totalBookings)} bold />
              <MetricRow label="Lead → Book %"
                values={perDay.map(d => d.leadToBookPct)}
                formatter={v => v === null ? '—' : `${v}%`} accent />
              <MetricRow label="Showed Up ✓"
                values={perDay.map(d => d.showed)} />
              <MetricRow label="No-Show ✕"
                values={perDay.map(d => d.noShow)} />
              <MetricRow label="Show-Up Rate"
                values={perDay.map(d => d.showUpPct)}
                formatter={v => v === null ? '—' : `${v}%`}
                accent bold />
              <MetricRow label="No-Show Rate"
                values={perDay.map(d => d.noShowPct)}
                formatter={v => v === null ? '—' : `${v}%`}
                accent />
              <MetricRow label="Cancelled"
                values={perDay.map(d => d.cancelled)} />
              <MetricRow label="Cancellation %"
                values={perDay.map(d => d.cancellationPct)}
                formatter={v => v === null ? '—' : `${v}%`}
                accent />

              {/* SALES — LakbayHub only, with conversion rates */}
              <SectionHeaderRow label="SALES · LakbayHub Conversions" span={days.length + 1} color="#F5A623" />
              <MetricRow label="# of Sales"
                values={perDay.map(d => d.salesCount)} bold />
              <MetricRow label="Gross Revenue"
                values={perDay.map(d => d.salesAmount)}
                formatter={v => v === 0 ? '—' : formatPHPCompact(v)} bold />
              <MetricRow label="Booking → Sale %"
                values={perDay.map(d => d.bookToSalePct)}
                formatter={v => v === null ? '—' : `${v}%`} accent />
              <MetricRow label="Show-Up → Sale %"
                values={perDay.map(d => d.showToSalePct)}
                formatter={v => v === null ? '—' : `${v}%`} accent />
              <MetricRow label="Avg Order Value"
                values={perDay.map(d => d.avgOrderValue)}
                formatter={v => v === null ? '—' : formatPHPCompact(v)} />

              {/* AD SPEND — Meta financial metrics */}
              <SectionHeaderRow label="AD SPEND · Meta Ads Efficiency" span={days.length + 1} color="#3B82F6" />
              <MetricRow label="Ads Spent"
                values={perDay.map(d => d.spend)}
                formatter={v => v === 0 ? '—' : formatPHPCompact(v)} bold />
              <MetricRow label="CPL (Cost per Lead)"
                values={perDay.map(d => d.cpl)}
                formatter={v => v === null ? '—' : formatPHPCompact(v)} accent />
              <MetricRow label="CAC (Cost per Sale)"
                values={perDay.map(d => d.cac)}
                formatter={v => v === null ? '—' : formatPHPCompact(v)} accent />
              <MetricRow label="ROAS"
                values={perDay.map(d => d.roas)}
                formatter={v => v === null ? '—' : `${v}x`} bold />
              <MetricRow label="AR% (cost / revenue)"
                values={perDay.map(d => d.arPct)}
                formatter={v => v === null ? '—' : `${v}%`} accent />

              <SectionHeaderRow label="TIME SLOTS (attendees / bookings)" span={days.length + 1} color="#4ECDC4" />
              {TIME_SLOTS.map((h, slotIdx) => (
                <tr key={h}>
                  <th className="px-3 py-1.5 text-left text-xs font-semibold text-gray-700 whitespace-nowrap sticky left-0 bg-white z-10">
                    <span className="inline-flex items-center gap-1">
                      <Clock size={11} />
                      {hourLabel(h)}
                    </span>
                  </th>
                  {perDay.map((d, i) => {
                    const slot = d.bySlot[slotIdx]
                    return <HeatCell key={i} attendees={slot.attendees} bookings={slot.bookings} />
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Sales summary — LakbayHub only, focused on revenue + conversion */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-5 rounded-full" style={{ backgroundColor: '#F5A623' }} />
            <div>
              <h2 className="font-semibold text-gray-900">Sales Summary · {period.label}</h2>
              <p className="text-[11px] text-gray-500 mt-0.5">LakbayHub closed sign-ups · independent from ad spend</p>
            </div>
          </div>
          <span className="text-[11px] px-2 py-1 rounded-md bg-amber-50 text-amber-700 font-semibold flex items-center gap-1">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75 animate-ping" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-500" />
            </span>
            LakbayHub live
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 p-4">
          <KpiCard icon={DollarSign} label="Gross Revenue" value={formatPHPCompact(totals.sales)} sub={`${totals.salesCount} closed sales`} accent="#FFF4E0" delta={delta.sales} compareLabel={period.compareLabel} />
          <KpiCard icon={Users}      label="# of Sales"    value={String(totals.salesCount)}     accent="#FFF4E0" delta={delta.salesCount} compareLabel={period.compareLabel} />
          <KpiCard icon={TrendingUp} label="Book → Sale"   value={`${overallBookToSale}%`}       sub={`${totals.salesCount} sales of ${totals.bookings} bookings`} />
          <KpiCard icon={TrendingUp} label="Show → Sale"   value={overallShowToSale === null ? '—' : `${overallShowToSale}%`} sub={overallShowToSale === null ? 'mark show-ups first' : `${totals.salesCount} sales of ${totals.showed} attendees`} />
          <KpiCard icon={DollarSign} label="Avg Order"     value={totals.salesCount === 0 ? '—' : formatPHPCompact(totals.sales / totals.salesCount)} sub="per closed sale" />
        </div>
      </section>

      {/* Meta Ads efficiency summary — ad cost metrics only */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="font-semibold text-gray-900">Ad Efficiency · {period.label}</h2>
            <p className="text-[11px] text-gray-500 mt-0.5">Meta Ads spend metrics (combined with LakbayHub revenue for ROAS & CAC)</p>
          </div>
          {metaError ? (
            <span className="text-[11px] px-2 py-1 rounded-md bg-red-50 text-red-700 font-semibold" title={metaError.message}>
              ⚠ Meta error — check token
            </span>
          ) : (
            <span className="text-[11px] px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 font-semibold flex items-center gap-1">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              Connected
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 p-4">
          <KpiCard icon={DollarSign} label="Total Ads Spent"  value={formatPHPCompact(totals.spend)} accent="#dbeafe" delta={delta.spend} compareLabel={period.compareLabel} />
          <KpiCard icon={DollarSign} label="Gross Revenue"    value={formatPHPCompact(totals.sales)} sub={`${totals.salesCount} sales`} accent="#dcfce7" delta={delta.sales} compareLabel={period.compareLabel} />
          <KpiCard icon={TrendingUp} label="ROAS"             value={totalROAS === null ? '—' : `${totalROAS}x`} sub="revenue / spend" accent="#fef3c7" />
          <KpiCard icon={TrendingUp} label="AR%"              value={totalARPct === null ? '—' : `${totalARPct}%`} sub="ad cost / revenue" />
          <KpiCard icon={Users}      label="Total Leads"      value={String(totals.leads)} sub="from Meta" delta={delta.leads} compareLabel={period.compareLabel} />
          <KpiCard icon={Users}      label="CPL"              value={totalCPL === null ? '—' : formatPHPCompact(totalCPL)} sub="cost per lead" />
          <KpiCard icon={Users}      label="CAC"              value={totalCAC === null ? '—' : formatPHPCompact(totalCAC)} sub="cost per sale" />
        </div>
      </section>
    </div>
  )
}

// Visual funnel — horizontal bars showing progression
function FunnelVisualization({ leads, bookings, showed, unmarked, salesCount, revenue }) {
  // Use leads as 100% baseline if available, otherwise bookings
  const baseline = leads > 0 ? leads : bookings
  if (baseline === 0) {
    return (
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center text-gray-400">
        No funnel data yet for this period.
      </section>
    )
  }

  const stages = [
    { label: 'Leads',     count: leads,      color: '#3B82F6', desc: 'from Meta Ads' },
    { label: 'Bookings',  count: bookings,   color: '#1B4F4F', desc: 'YCBM (excl. cancelled)' },
    { label: 'Showed Up', count: showed,     color: '#10B981', desc: unmarked > 0 ? `${unmarked} unmarked` : 'attended sessions' },
    { label: 'Sales',     count: salesCount, color: '#F5A623', desc: 'LakbayHub closed' },
  ].filter(s => s.count >= 0)

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <Activity size={16} style={{ color: PRIMARY }} />
          Conversion Funnel
        </h2>
        <span className="text-[11px] text-gray-500">
          Total revenue from this funnel: <span className="font-bold text-gray-900">{formatPHP(revenue)}</span>
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {stages.map((s, i) => {
          const pct = baseline > 0 ? (s.count / baseline) * 100 : 0
          const prev = i > 0 ? stages[i - 1].count : null
          const stageConvPct = prev !== null && prev > 0 ? Math.round((s.count / prev) * 100) : null
          return (
            <div key={s.label}>
              <div className="flex items-center justify-between text-xs mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                  <span className="font-semibold text-gray-900">{s.label}</span>
                  <span className="text-gray-400 text-[10px]">· {s.desc}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="font-bold text-gray-900">{s.count.toLocaleString()}</span>
                  <span className="text-gray-400 text-[10px]">({Math.round(pct)}%)</span>
                  {stageConvPct !== null && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-700">
                      {stageConvPct}% from prev
                    </span>
                  )}
                </div>
              </div>
              <div className="relative h-5 bg-gray-50 rounded-md overflow-hidden">
                <div className="h-full rounded-md transition-all duration-500"
                     style={{ width: `${Math.max(pct, 1)}%`, backgroundColor: s.color, opacity: 0.85 }} />
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function KpiCard({ icon: Icon, label, value, sub, accent, delta, compareLabel }) {
  const showDelta = delta !== undefined && delta !== null && !Number.isNaN(delta)
  const DeltaIcon = !showDelta ? null : delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus
  const deltaTone = !showDelta ? '' :
    delta > 0 ? 'text-emerald-600 bg-emerald-50' :
    delta < 0 ? 'text-red-600 bg-red-50' :
                'text-gray-500 bg-gray-50'
  return (
    <div className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100 flex flex-col gap-1">
      <div className="flex items-start justify-between gap-1">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
             style={{ backgroundColor: accent || '#E8F4F4' }}>
          <Icon size={15} style={{ color: PRIMARY }} />
        </div>
        {showDelta && (
          <span className={`inline-flex items-center gap-0.5 rounded-md font-semibold text-[10px] px-1.5 py-0.5 ${deltaTone}`}
                title={compareLabel}>
            <DeltaIcon size={10} />
            {Math.abs(delta)}%
          </span>
        )}
      </div>
      <p className="text-lg font-bold text-gray-900 truncate" title={value}>{value}</p>
      <p className="text-[11px] text-gray-500 leading-tight">{label}</p>
      {sub && <p className="text-[10px] text-gray-400 leading-tight">{sub}</p>}
    </div>
  )
}
