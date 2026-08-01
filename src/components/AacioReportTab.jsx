import { useMemo, useState, useEffect } from 'react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, Cell,
} from 'recharts'
import {
  CalendarCheck, TrendingUp, Clock, XCircle, Download, Users, CalendarRange,
  Wallet, Receipt, BadgeDollarSign, ExternalLink, ChevronUp, ChevronDown,
} from 'lucide-react'
import useAacioData from '../hooks/useAacioData'
import { dateKey } from '../api/ycbmAacio'
import {
  fetchSalesRecords, getExternalSalesRecords, getSalesSource, getExternalInvoiceCustomers,
  filterByRange, sum, formatPHP, formatPHPCompact,
  totalsByAgent, totalsByTeam,
} from '../api/lakbay'
import { subscribeSaleOverrides } from '../lib/saleDateOverrides'
import { subscribeAttendance } from '../lib/attendance'
import DataSourceBanner from './ui/DataSourceBanner'
import LiveIndicator from './LiveIndicator'
import PeriodBar from './PeriodBar'
import HeroBand from './ui/HeroBand'
// Acquisition-style monitoring blocks (same presentational components the
// Acquisition tab uses), scoped here to external-cluster records only.
// TargetProgress/SmartInsights are intentionally NOT included — they pace
// against the global POTB monthly target, which doesn't apply to AACIO.
import TodaySnapshot from './sales/TodaySnapshot'
import FunnelHealth from './sales/FunnelHealth'
import PackagePerformance from './sales/PackagePerformance'
import LiveActivityFeed from './sales/LiveActivityFeed'
import ClusterHealth from './sales/ClusterHealth'
import NeedsReview from './sales/NeedsReview'
import SalesReportPanel from './sales/SalesReportPanel'
import CoachPivot from './CoachPivot'
import RevenueTrend from './RevenueTrend'
import SalesPerformanceCards from './SalesPerformanceCards'
import AgentLeaderboard from './AgentLeaderboard'
import SalesBreakdown from './sales/SalesBreakdown'
import DownPaymentsTracker from './DownPaymentsTracker'
import YcbmReportUpload from './YcbmReportUpload'
import { mergeWithReport, subscribeReport } from '../lib/ycbmReport'
import { periodRange, periodLabelFor, currentMonthKey, PERIODS_WITH_ALL } from '../lib/periods'

// Parse a YYYY-MM-DD key into a local Date (for custom date selections)
function dateFromKey(k) {
  const [y, m, d] = k.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// Same AACIO coach under different names across LakbayHub clusters vs YCBM
// teamMember → one canonical card. Keyed by first-name (uppercase).
const AACIO_COACH_ALIASES = {
  ANGEL: 'JAS', ANGELYN: 'JAS',                    // AACIO ANGEL / Coach Angelyn = "JAS" (per MJ)
  PRINCESS: 'Princess Romelyn', ROMELYN: 'Princess Romelyn',
  SHEILA: 'Sheila', SHIELA: 'Sheila',              // spelling variants
}

const TEAL = '#1B4F4F'
const GOLD = '#F5A623'

// ── Calendar-aligned period ranges (PHT-local) ──────────────────────────────
function startOfDay(d)  { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
function endOfDay(d)    { const x = new Date(d); x.setHours(23, 59, 59, 999); return x }


const SLOTS = [10, 15, 19, 20, 21] // 10AM, 3PM, 7PM, 8PM, 9PM (POTB session slots)
function slotLabel(h) {
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hr   = h % 12 === 0 ? 12 : h % 12
  return `${hr}${ampm}`
}

// ── Daily-matrix helpers (mirror the Operations tab layout) ─────────────────
function dayLabel(d) {
  return d.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })
}
// Enumerate day-start Dates from `from`→`to`, capped at `cap` most-recent days
// (guards against the "All Time" range producing thousands of columns).
function enumerateDays(from, to, cap = 92) {
  const end   = startOfDay(to)
  let   start = startOfDay(from)
  const maxStart = new Date(end.getTime() - (cap - 1) * 86400000)
  if (start.getTime() < maxStart.getTime()) start = maxStart
  const days = []
  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) days.push(new Date(t))
  return days
}

function MatrixRow({ label, values, formatter = String, accent = false, bold = false }) {
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

function MatrixSectionRow({ label, span, color }) {
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
  if (bookings === 0) return <td className="px-2 py-1.5 text-center text-gray-300 text-xs">—</td>
  const ratio = attendees / bookings
  const pct   = Math.round(ratio * 100)
  const tone =
    ratio >= 0.7 ? 'bg-emerald-100 text-emerald-800'
  : ratio >= 0.4 ? 'bg-amber-100 text-amber-800'
  :                'bg-red-100 text-red-800'
  return (
    <td className="px-2 py-1.5 text-center">
      <span className={`inline-flex flex-col items-center min-w-[56px] px-2 py-0.5 rounded-md font-semibold ${tone}`}>
        <span className="text-[11px] leading-tight">{attendees}/{bookings}</span>
        <span className="text-[9px] leading-tight opacity-80">{pct}%</span>
      </span>
    </td>
  )
}

function KpiCard({ icon: Icon, label, value, sub, accent = TEAL }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-1">
      <div className="flex items-center gap-2 text-gray-400">
        <Icon size={16} style={{ color: accent }} />
        <span className="text-[11px] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <span className="text-2xl font-bold" style={{ color: accent }}>{value}</span>
      {sub && <span className="text-xs text-gray-400">{sub}</span>}
    </div>
  )
}

function PaymentBadge({ status }) {
  if (!status) return <span className="text-gray-300 text-xs">—</span>
  const styles =
    status === 'PAID'    ? 'bg-emerald-100 text-emerald-700' :
    status === 'PENDING' ? 'bg-amber-100 text-amber-700'    :
                           'bg-gray-100 text-gray-600'
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${styles}`}>
      {status}
    </span>
  )
}

function AccountBadge({ status }) {
  if (!status) return <span className="text-gray-300 text-xs">—</span>
  const styles =
    status === 'ACTIVATED'    ? 'bg-blue-100 text-blue-700'    :
    status === 'PENDING'      ? 'bg-amber-100 text-amber-700'  :
    status === 'FOR APPROVAL' ? 'bg-purple-100 text-purple-700':
                                'bg-gray-100 text-gray-600'
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${styles}`}>
      {status}
    </span>
  )
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}
function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

export default function AacioReportTab() {
  const { bookings: apiBookings, loading, refreshing, error, lastFetched, refresh } = useAacioData()
  // Merge live AACIO API bookings with the accumulated uploaded report (report wins = exact).
  const [repBump, setRepBump] = useState(0)
  useEffect(() => subscribeReport(() => setRepBump(n => n + 1)), [])
  const bookings = useMemo(() => mergeWithReport(apiBookings, 'aacio'), [apiBookings, repBump])
  const [showMore, setShowMore] = useState(false)   // collapse deep analytics (mirrors Acquisition)
  const [periodId, setPeriodId] = useState('all')   // default: show ALL AACIO sales across months
  const [monthKey, setMonthKey] = useState(currentMonthKey())
  const [customDates, setCustomDates] = useState([])  // YYYY-MM-DD[] when periodId === 'custom'
  const isCustom = periodId === 'custom' && customDates.length > 0
  const customSet = useMemo(() => new Set(customDates), [customDates])
  // Stable "now" for past/future attendance derivation (set once on mount)
  const [nowMs] = useState(() => Date.now())

  // LakbayHub sales — rides the shared lakbay.js pipeline (one API hit serves
  // both audiences): fetchSalesRecords() warms the cache (TTL + dedup + 429
  // backoff + Supabase/mock fallbacks), then getExternalSalesRecords() reads
  // the EXTERNAL COACH split. Dated records feed the aggregations; flagged
  // ones (no date / zero amount) surface in NeedsReview instead of being
  // silently dropped.
  const [extSales, setExtSales] = useState([])
  const [extReview, setExtReview] = useState([])
  const [salesLoading, setSalesLoading] = useState(true)
  const [salesError, setSalesError] = useState(null)
  useEffect(() => {
    let alive = true
    const readExternal = () => {
      const ext = getExternalSalesRecords()
      setExtSales(ext.filter(r => r.date))
      setExtReview(ext.filter(r => r.needsReview))
    }
    const load = async () => {
      try {
        await fetchSalesRecords()       // warm/refresh the shared cache
        if (!alive) return
        readExternal()
        setSalesError(null)
      } catch (err) {
        if (alive) setSalesError(err)
      } finally {
        if (alive) setSalesLoading(false)
      }
    }
    load()
    // Pause polling while the browser tab is hidden (matches usePolling.js)
    const id = setInterval(() => { if (!document.hidden) load() }, 30_000)
    // Manager date corrections re-apply on read — refresh the split right away
    const unsub = subscribeSaleOverrides(() => { if (alive) readExternal() })
    return () => { alive = false; clearInterval(id); unsub() }
  }, [])

  // Re-render when attendance markings change (shared with POTB Bookings tab)
  const [, bumpAttendance] = useState(0)
  useEffect(() => subscribeAttendance(() => bumpAttendance(n => n + 1)), [])

  const [from, to] = useMemo(() => {
    if (isCustom) {
      const sorted = [...customDates].sort()
      return [startOfDay(dateFromKey(sorted[0])), endOfDay(dateFromKey(sorted[sorted.length - 1]))]
    }
    const { start, end } = periodRange(periodId, monthKey)
    return [start, end]
  }, [isCustom, customDates, periodId, monthKey])

  const periodLabel = isCustom ? `${customDates.length} custom days` : periodLabelFor(periodId, monthKey)

  // For multi-select custom dates, also require the record's day to be one of
  // the picked days (a plain from–to range would include in-between days).
  const inCustom = (key) => !isCustom || customSet.has(key)

  // External sales within the selected period (by date_paid)
  const salesInRange = useMemo(
    () => filterByRange(extSales, from, to)
      .filter(r => inCustom(r.date))
      .sort((a, b) => new Date(b.date) - new Date(a.date)),
    [extSales, from, to, isCustom, customSet], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const salesStats = useMemo(() => {
    const revenue = sum(salesInRange, 'sales_amount')
    const count   = salesInRange.length
    return { revenue, count, avg: count ? revenue / count : 0 }
  }, [salesInRange])

  // Detailed breakdowns (same shape as the main Sales tab)
  const byCloser  = useMemo(() => totalsByAgent(salesInRange), [salesInRange])
  const byCluster = useMemo(() => totalsByTeam(salesInRange),  [salesInRange])
  const salesTrend = useMemo(() => {
    const map = new Map()
    for (const r of salesInRange) {
      const k = r.date
      if (!k) continue
      map.set(k, (map.get(k) || 0) + (r.sales_amount || 0))
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => ({
        label: new Date(k + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        revenue: v,
      }))
  }, [salesInRange])

  // Filter bookings by SCHEDULED date (startsAt) within the selected period
  const inRange = useMemo(() => {
    const a = from.getTime(), b = to.getTime()
    return bookings
      .filter(bk => {
        const t = new Date(bk.startsAt).getTime()
        if (t < a || t > b) return false
        return inCustom(dateKey(bk.startsAt))
      })
      .sort((x, y) => new Date(y.startsAt) - new Date(x.startsAt))
  }, [bookings, from, to, isCustom, customSet]) // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useMemo(() => {
    const total     = inRange.length
    const cancelled = inRange.filter(b => b.cancelled).length
    const active    = total - cancelled
    const names     = new Set(inRange.map(b => b.name.toLowerCase()))
    // For 'All Time', the from→to window is decades wide, so base the per-day
    // average on the actual activity span (earliest booking → today) instead.
    let spanFrom = from, spanTo = to
    if (periodId === 'all' && inRange.length > 0) {
      const times = inRange.map(b => new Date(b.startsAt).getTime())
      spanFrom = new Date(Math.min(...times))
      spanTo   = new Date(Math.max(Math.max(...times), nowMs))
    }
    const daysSpan = Math.max(1, Math.round((spanTo - spanFrom) / 86400000))
    const perDay   = (active / daysSpan)
    return { total, cancelled, active, unique: names.size, perDay }
  }, [inRange, from, to, periodId, nowMs])

  // Sales funnel: Booked (appointments) → Showed up → Closed (sales)
  const funnel = useMemo(() => {
    // Booked = all active scheduled appointments in range (inRange = startsAt-filtered)
    const active = inRange.filter(bk => !bk.cancelled)
    // Per MJ's YCBM workflow: no-show is explicitly marked (true), a show is
    // marked "finished". Only noShow===true is reliable → a PAST appointment not
    // flagged no-show was finished = showed. Future unmarked = upcoming (excluded).
    let showed = 0, noShow = 0
    for (const bk of active) {
      if (bk.noShow === true) noShow++
      else if (bk.noShow === false) showed++
      else if (new Date(bk.startsAt).getTime() < nowMs) showed++
    }
    const concluded = showed + noShow
    const booked = active.length
    const closed = salesStats.count
    return {
      revenue: salesStats.revenue, closed, booked,
      cancelled: stats.cancelled, showed, noShow,
      // Show-up rate vs CONCLUDED appointments (excludes upcoming) → "—" if none done yet.
      showUpRate:  concluded > 0 ? Math.round((showed / concluded) * 100) : null,
      closingRate: showed > 0 ? Math.round((closed / showed) * 100) : null,
    }
  }, [inRange, nowMs, salesStats, stats.cancelled]) // eslint-disable-line react-hooks/exhaustive-deps

  // Daily trend (active bookings per day)
  const trend = useMemo(() => {
    const map = new Map()
    for (const b of inRange) {
      if (b.cancelled) continue
      const k = dateKey(b.startsAt)
      map.set(k, (map.get(k) || 0) + 1)
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => ({
        date: new Date(k + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        bookings: v,
      }))
  }, [inRange])

  // Time-slot distribution
  const slotData = useMemo(() => {
    const counts = Object.fromEntries(SLOTS.map(h => [h, 0]))
    let other = 0
    for (const b of inRange) {
      if (b.cancelled) continue
      if (b.hour in counts) counts[b.hour] += 1
      else other += 1
    }
    const arr = SLOTS.map(h => ({ slot: slotLabel(h), count: counts[h] }))
    if (other > 0) arr.push({ slot: 'Other', count: other })
    return arr
  }, [inRange])

  // ── Daily Performance Matrix (mirrors the Operations tab spreadsheet) ──────
  // Columns = one day each, across the selected period (capped at 92 days).
  // All rows are derived from AACIO YCBM bookings + external LakbayHub sales.
  // For 'All Time', clamp the matrix end to today so we show the most-recent
  // 92 days of real activity, not empty far-future columns from the wide range.
  const matrixDays = useMemo(
    () => {
      if (isCustom) return [...customDates].sort().map(dateFromKey)
      const end = periodId === 'all' ? new Date(nowMs) : to
      return enumerateDays(from, end)
    },
    [isCustom, customDates, from, to, periodId, nowMs],
  )

  // Group AACIO bookings by SCHEDULE date (startsAt) and by CREATED date.
  const schedByDate = useMemo(() => {
    const m = new Map()
    for (const b of bookings) {
      const k = dateKey(b.startsAt)
      if (!m.has(k)) m.set(k, [])
      m.get(k).push(b)
    }
    return m
  }, [bookings])
  const createdByDate = useMemo(() => {
    const m = new Map()
    for (const b of bookings) {
      if (!b.createdAt) continue
      const k = dateKey(b.createdAt)
      if (!m.has(k)) m.set(k, [])
      m.get(k).push(b)
    }
    return m
  }, [bookings])
  const salesByDate = useMemo(() => {
    const m = new Map()
    for (const r of extSales) {
      if (!r.date) continue
      if (!m.has(r.date)) m.set(r.date, [])
      m.get(r.date).push(r)
    }
    return m
  }, [extSales])

  // Per-day metrics. Computed inline (not memoized) so attendance-cache reads
  // stay fresh whenever bumpAttendance fires.
  const matrix = matrixDays.map(day => {
    const k          = dateKey(day)
    const sched      = (schedByDate.get(k) || [])
    const active     = sched.filter(b => !b.cancelled)
    const cancelled  = sched.filter(b => b.cancelled).length
    const leads      = (createdByDate.get(k) || []).filter(b => !b.cancelled).length
    // Attendance — same rule as the per-coach cards & funnel so totals tally:
    //   noShow=true → No-Show · noShow=false (explicit mark) → Showed ·
    //   past & unmarked → Showed (finished; per MJ's workflow) · future → unmarked
    let showed = 0, noShow = 0, unmarked = 0
    for (const b of active) {
      if (b.noShow === true) noShow++
      else if (b.noShow === false) showed++
      else if (new Date(b.startsAt).getTime() < nowMs) showed++
      else unmarked++
    }
    const tracked    = showed + noShow
    const salesCount = (salesByDate.get(k) || []).length
    const sur        = tracked > 0 ? Math.round((showed / tracked) * 100) : null
    const cvr        = active.length > 0 ? Math.round((salesCount / active.length) * 100) : null
    const bySlot     = SLOTS.map(h => {
      const slotBk = active.filter(b => b.hour === h)
      // Attendee = showed: explicitly marked (noShow===false) OR past & not
      // flagged no-show (finished). Matches the show/no-show rows above.
      const att    = slotBk.filter(b => b.noShow !== true && new Date(b.startsAt).getTime() < nowMs).length
      return { hour: h, bookings: slotBk.length, attendees: att }
    })
    return {
      day, leads,
      scheduled: active.length,
      showed, noShow, unmarked,
      cancelled, salesCount, sur, cvr, bySlot,
    }
  })
  const colCount = matrixDays.length + 1

  function exportCSV() {
    const rows = [['Name', 'Date', 'Time', 'Appointment Type', 'Status', 'Booked On']]
    for (const b of inRange) {
      rows.push([
        b.name,
        fmtDate(b.startsAt),
        fmtTime(b.startsAt),
        b.appointmentType,
        b.cancelled ? 'Cancelled' : 'Active',
        b.createdAt ? fmtDate(b.createdAt) : '',
      ])
    }
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = `aacio-sales-report-${periodId}-${dateKey(new Date())}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4 max-w-6xl mx-auto w-full">
        <div className="skeleton h-8 w-64" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-24" />)}
        </div>
        <div className="skeleton h-72" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center max-w-2xl mx-auto">
        <p className="text-red-700 font-semibold">Unable to load AACIO report</p>
        <p className="text-red-500 text-sm mt-1">{error.message}</p>
        <p className="text-gray-500 text-xs mt-2">
          Check <code>YCBM_AACIO_ACCOUNT_ID</code> / <code>YCBM_AACIO_API_KEY</code> in <code>.env</code> and restart the dev server.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 max-w-6xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold" style={{ color: TEAL }}>AACIO Sales Report</h2>
            <LiveIndicator lastFetched={lastFetched} refreshing={refreshing} onRefresh={refresh} label="AACIO" />
          </div>
          <p className="text-sm text-gray-400">External team bookings & sales — support@pinoyonlinebiz.com</p>
        </div>
        <button
          onClick={exportCSV}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: TEAL }}
        >
          <Download size={16} /> Export CSV
        </button>
      </div>

      {/* Period selector */}
      <PeriodBar
        periods={PERIODS_WITH_ALL}
        periodId={periodId} onPeriod={setPeriodId}
        monthKey={monthKey} onMonth={setMonthKey}
        customDates={customDates} isCustom={isCustom}
        onApplyCustom={(dates) => { setCustomDates(dates); setPeriodId('custom') }}
      />

      {/* Warn when LakbayHub sales are coming from a stale fallback source */}
      {!salesLoading && <DataSourceBanner source={getSalesSource()} />}

      {/* Accumulating AACIO YCBM report upload — exact data, merged (dedup) per upload */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">AACIO YCBM Report (exact data · iniipon)</p>
        <YcbmReportUpload account="aacio" label="AACIO YCBM report" />
      </div>

      {/* Hero band — instant read on AACIO external-team activity */}
      <HeroBand
        label={`AACIO Bookings · ${periodLabel}`}
        value={String(stats.active)}
        sub={`${stats.unique} unique leads · ${salesStats.count} sales · ${formatPHPCompact(salesStats.revenue)} revenue`}
        stats={[
          { label: 'Bookings', value: String(stats.active) },
          { label: 'Unique Leads', value: String(stats.unique) },
          { label: 'Sales', value: String(salesStats.count) },
          { label: 'Avg / Day', value: stats.perDay.toFixed(1) },
        ]}
      />

      {/* Sales funnel report — Booked → Presented → Showed → Closed */}
      <SalesReportPanel
        title="AACIO Sales Report"
        periodLabel={periodLabel}
        funnel={funnel}
        note="Show-up galing sa YCBM's own No-Show marks. Closed/Revenue galing sa LakbayHub external-cluster sales."
      />

      {/* Revenue trend (external-cluster LakbayHub sales) — Week/Month/Year */}
      <RevenueTrend records={extSales} />

      {/* Today's live snapshot (AACIO excludes TargetProgress — it paces vs the
          global POTB monthly target, which doesn't apply to the external team) */}
      <TodaySnapshot records={extSales} />

      {/* Period overview — headline AACIO KPIs */}
      <div>
        <h2 className="text-base font-semibold text-gray-800 mb-3">{periodLabel} Overview</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard icon={CalendarCheck} label="Total Bookings" value={stats.total}
            sub={`${stats.active} active · ${stats.cancelled} cancelled`} />
          <KpiCard icon={Wallet} label="Total Revenue" value={formatPHPCompact(salesStats.revenue)}
            sub={formatPHP(salesStats.revenue)} accent={GOLD} />
          <KpiCard icon={Receipt} label="# of Sales" value={salesStats.count}
            sub="paid records tagged external" />
          <KpiCard icon={Users} label="Unique Leads" value={stats.unique}
            sub="distinct prospects" />
          <KpiCard icon={TrendingUp} label="Active Sales" value={stats.active}
            sub="confirmed coaching sessions" accent={GOLD} />
          <KpiCard icon={BadgeDollarSign} label="Avg Deal" value={formatPHPCompact(salesStats.avg)}
            sub="revenue ÷ sales" />
          <KpiCard icon={CalendarRange} label="Avg / Day" value={stats.perDay.toFixed(1)}
            sub="active bookings per day" accent={GOLD} />
          <KpiCard icon={Users} label="Active Closers" value={byCloser.length}
            sub={`${byCluster.length} clusters`} />
        </div>
      </div>

      {/* Per-coach Sales Performance — external LakbayHub sales (Availed/SRP) +
          AACIO YCBM (Appointment/Show Up/No Show) for the selected period. */}
      <SalesPerformanceCards
        salesRecords={salesInRange} bookings={bookings} from={from} to={to}
        aliases={AACIO_COACH_ALIASES} loading={loading} storageKey="aacio"
        periodLabel={periodLabel} />

      {/* Detailed sales breakdown — how much each closer/cluster sold this period */}
      <SalesBreakdown records={salesInRange} periodLabel={periodLabel} />

      {/* Incomplete external records (missing date / amount / closer) */}
      <NeedsReview records={extReview} />

      {/* Per-agent leaderboard + client drill-down (same as Acquisition tab) */}
      <AgentLeaderboard
        records={extSales}
        rangedRecords={salesInRange}
        customers={getExternalInvoiceCustomers()}
        periodId={periodId}
        monthKey={monthKey}
        customDates={customDates}
        periodLabel={periodLabel}
        title="AACIO Per-Agent Leaderboard"
        subtitle="Tap an agent to see their clients for the selected period" />

      {/* Down payments tracker — all outstanding partial AACIO sign-ups, aged, per coach */}
      <DownPaymentsTracker customers={getExternalInvoiceCustomers()} title="AACIO Down Payments" subtitle="External-cluster sign-ups" />

      {/* Deep analytics — collapsed by default to keep the tab scannable (mirrors Acquisition) */}
      <button
        onClick={() => setShowMore(s => !s)}
        className="self-center flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-[#1B4F4F] bg-white border border-gray-200 rounded-full px-4 py-2 shadow-sm transition-colors"
        aria-expanded={showMore}
      >
        {showMore ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        {showMore ? 'Hide analytics & charts' : 'Show more analytics & charts'}
      </button>

      {showMore && (<>
        {/* Expandable per-coach / per-slot pivot — automatic from AACIO YCBM teamMember */}
        <CoachPivot bookings={bookings} from={from} to={to} />

        {/* Acquisition-style monitoring blocks, scoped to external-cluster (AACIO) sales */}
        {(extSales.length > 0 || !salesError) && (<>
          {extSales.length > 0 && <FunnelHealth records={extSales} />}
          <PackagePerformance records={extSales} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <LiveActivityFeed records={extSales} limit={8} />
            <ClusterHealth records={extSales} />
          </div>
        </>)}

        {/* External-team SALES detail (LakbayHub external clusters) — full table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-4">
          <div className="flex items-center gap-2 flex-wrap">
            <BadgeDollarSign size={16} style={{ color: GOLD }} />
            <h3 className="text-sm font-semibold text-gray-700">Sales from LakbayHub — External Coach clusters</h3>
            {salesLoading && <span className="text-xs text-gray-400 ml-auto">Loading...</span>}
            {!salesLoading && salesError && (
              <span className="text-xs text-red-500 ml-auto">Failed to load: {salesError.message}</span>
            )}
          </div>

          {/* By Closer + By Cluster breakdowns */}
          {salesInRange.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">By Closer</p>
                <div className="flex flex-col gap-2">
                  {byCloser.map((a, i) => {
                    const max = byCloser[0]?.sales || 1
                    return (
                      <div key={a.name}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="flex items-center gap-1.5 min-w-0">
                            <span className="w-4 h-4 rounded-full bg-gray-100 text-gray-500 text-[9px] font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                            <span className="font-medium text-gray-800 truncate">{a.name}</span>
                          </span>
                          <span className="text-gray-500 flex-shrink-0">
                            <b className="text-gray-900">{formatPHPCompact(a.sales)}</b> · {a.txnCount}
                          </span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${(a.sales / max) * 100}%`, backgroundColor: TEAL }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">By Cluster</p>
                <div className="flex flex-col gap-2">
                  {byCluster.map((t) => {
                    const max = byCluster[0]?.sales || 1
                    return (
                      <div key={t.name}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-medium text-gray-800 truncate">{t.name}</span>
                          <span className="text-gray-500 flex-shrink-0">
                            <b className="text-gray-900">{formatPHPCompact(t.sales)}</b> · {t.records.length}
                          </span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${(t.sales / max) * 100}%`, backgroundColor: GOLD }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {salesInRange.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">
              No external-team sales tagged in LakbayHub for this period.
            </p>
          ) : (
            <div className="overflow-x-auto border-t border-gray-100 pt-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-400 text-xs uppercase tracking-wide border-b border-gray-100">
                    <th className="px-3 py-2 font-semibold">Customer</th>
                    <th className="px-3 py-2 font-semibold">Email</th>
                    <th className="px-3 py-2 font-semibold">Cluster</th>
                    <th className="px-3 py-2 font-semibold">Package</th>
                    <th className="px-3 py-2 font-semibold text-right">Amount</th>
                    <th className="px-3 py-2 font-semibold">Date Paid</th>
                    <th className="px-3 py-2 font-semibold">Payment</th>
                    <th className="px-3 py-2 font-semibold">Account</th>
                    <th className="px-3 py-2 font-semibold">FB</th>
                  </tr>
                </thead>
                <tbody>
                  {salesInRange.slice(0, 100).map(r => (
                    <tr key={r.transaction_id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-3 py-2.5 font-medium text-gray-800">{r.customer_name}</td>
                      <td className="px-3 py-2.5 text-gray-500 text-xs">{r.meta?.email || '—'}</td>
                      <td className="px-3 py-2.5 text-gray-500">{r.team}</td>
                      <td className="px-3 py-2.5 text-gray-500">{r.meta?.package || '—'}</td>
                      <td className="px-3 py-2.5 text-right font-semibold" style={{ color: TEAL }}>
                        {formatPHP(r.sales_amount)}
                      </td>
                      <td className="px-3 py-2.5 text-gray-600">{r.date ? fmtDate(r.date) : '—'}</td>
                      <td className="px-3 py-2.5">
                        <PaymentBadge status={r.meta?.payment_status} />
                      </td>
                      <td className="px-3 py-2.5">
                        <AccountBadge status={r.meta?.account_status} />
                      </td>
                      <td className="px-3 py-2.5">
                        {r.meta?.facebook
                          ? <a href={r.meta.facebook} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-0.5 text-blue-500 hover:text-blue-700 text-xs">
                              <ExternalLink size={11} /> FB
                            </a>
                          : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {salesInRange.length > 100 && (
                <p className="text-xs text-gray-400 text-center py-3">
                  Showing first 100 of {salesInRange.length} sales.
                </p>
              )}
            </div>
          )}
        </div>
      </>)}

    </div>
  )
}
