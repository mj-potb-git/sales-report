import { useMemo, useState, useEffect } from 'react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, Cell,
} from 'recharts'
import {
  CalendarCheck, TrendingUp, Clock, XCircle, Download, Users, CalendarRange,
  Wallet, Receipt, BadgeDollarSign,
} from 'lucide-react'
import useAacioData from '../hooks/useAacioData'
import { dateKey } from '../api/ycbmAacio'
import {
  fetchSalesRecords, filterByRange, sum, formatPHP, formatPHPCompact,
  totalsByAgent, totalsByTeam,
} from '../api/lakbay'
import LiveIndicator from './LiveIndicator'

// AACIO external-team sales live in LakbayHub under "EXTERNAL COACH - ..."
// clusters. Match by keyword so any future external coach is auto-included.
const isExternalCluster = (team) => /external/i.test(team || '')

const TEAL = '#1B4F4F'
const GOLD = '#F5A623'

// ── Calendar-aligned period ranges (PHT-local) ──────────────────────────────
function startOfDay(d)  { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
function endOfDay(d)    { const x = new Date(d); x.setHours(23, 59, 59, 999); return x }
function startOfWeek(d) { // Monday
  const x = startOfDay(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); return x
}
function startOfMonth(d){ const x = startOfDay(d); x.setDate(1); return x }

function rangeForPeriod(period) {
  const now = new Date()
  switch (period) {
    case 'today': return [startOfDay(now), endOfDay(now)]
    case 'week':  return [startOfWeek(now), endOfDay(now)]
    case 'month': return [startOfMonth(now), endOfDay(now)]
    case '60d':   return [startOfDay(new Date(now.getTime() - 59 * 86400000)), endOfDay(now)]
    case '90d':   return [startOfDay(new Date(now.getTime() - 89 * 86400000)), endOfDay(now)]
    case 'all':   return [new Date(0), endOfDay(now)]
    default:      return [startOfWeek(now), endOfDay(now)]
  }
}

const PERIODS = [
  { id: 'today', label: 'Today' },
  { id: 'week',  label: 'This Week' },
  { id: 'month', label: 'This Month' },
  { id: '60d',   label: 'Last 60d' },
  { id: '90d',   label: 'Last 90d' },
  { id: 'all',   label: 'All Time' },
]

const SLOTS = [10, 15, 19, 20, 21] // 10AM, 3PM, 7PM, 8PM, 9PM (POTB session slots)
function slotLabel(h) {
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hr   = h % 12 === 0 ? 12 : h % 12
  return `${hr}${ampm}`
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

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}
function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

export default function AacioReportTab() {
  const { bookings, loading, refreshing, error, lastFetched, refresh } = useAacioData()
  const [period, setPeriod] = useState('month')

  // LakbayHub sales tagged to AACIO external clusters (polled, shared cache)
  const [extSales, setExtSales] = useState([])
  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const recs = await fetchSalesRecords()
        if (alive) setExtSales(recs.filter(r => isExternalCluster(r.team)))
      } catch { /* shared cache layer logs failures */ }
    }
    load()
    const id = setInterval(load, 30_000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  const [from, to] = useMemo(() => rangeForPeriod(period), [period])

  // External sales within the selected period (by date_paid)
  const salesInRange = useMemo(
    () => filterByRange(extSales, from, to).sort((a, b) => new Date(b.date) - new Date(a.date)),
    [extSales, from, to],
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
      .filter(bk => { const t = new Date(bk.startsAt).getTime(); return t >= a && t <= b })
      .sort((x, y) => new Date(y.startsAt) - new Date(x.startsAt))
  }, [bookings, from, to])

  const stats = useMemo(() => {
    const total     = inRange.length
    const cancelled = inRange.filter(b => b.cancelled).length
    const active    = total - cancelled
    const names     = new Set(inRange.map(b => b.name.toLowerCase()))
    const daysSpan  = Math.max(1, Math.round((to - from) / 86400000))
    const perDay    = (active / daysSpan)
    return { total, cancelled, active, unique: names.size, perDay }
  }, [inRange, from, to])

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
    a.download = `aacio-sales-report-${period}-${dateKey(new Date())}.csv`
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
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit flex-wrap">
        {PERIODS.map(p => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              period === p.id ? 'bg-white shadow-sm font-semibold' : 'text-gray-500 hover:text-gray-700'
            }`}
            style={period === p.id ? { color: TEAL } : undefined}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard icon={CalendarCheck} label="Total Bookings" value={stats.total}
          sub={`${stats.active} active · ${stats.cancelled} cancelled`} />
        <KpiCard icon={TrendingUp} label="Active Sales" value={stats.active}
          sub="confirmed coaching sessions" accent={GOLD} />
        <KpiCard icon={Users} label="Unique Leads" value={stats.unique}
          sub="distinct prospects" />
        <KpiCard icon={CalendarRange} label="Avg / Day" value={stats.perDay.toFixed(1)}
          sub="active bookings per day" accent={GOLD} />
      </div>

      {/* External-team SALES (LakbayHub, cluster-tagged) */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <BadgeDollarSign size={16} style={{ color: GOLD }} />
          <h3 className="text-sm font-semibold text-gray-700">Sales from LakbayHub — External Coach clusters</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <KpiCard icon={Wallet} label="Total Revenue" value={formatPHPCompact(salesStats.revenue)}
            sub={formatPHP(salesStats.revenue)} accent={GOLD} />
          <KpiCard icon={Receipt} label="# of Sales" value={salesStats.count}
            sub="paid records tagged external" />
          <KpiCard icon={TrendingUp} label="Avg Deal" value={formatPHPCompact(salesStats.avg)}
            sub="revenue ÷ sales" accent={GOLD} />
        </div>

        {/* Sales revenue trend */}
        {salesTrend.length > 0 && (
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Revenue Trend</p>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={salesTrend} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#999' }} />
                <YAxis tick={{ fontSize: 11, fill: '#999' }} tickFormatter={formatPHPCompact} />
                <Tooltip formatter={v => formatPHP(v)} />
                <Line type="monotone" dataKey="revenue" stroke={GOLD} strokeWidth={2.5}
                  dot={{ r: 3, fill: GOLD }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* By Closer + By Cluster breakdowns */}
        {salesInRange.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 border-t border-gray-100 pt-4">
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
                {byCluster.map((t, i) => {
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 text-xs uppercase tracking-wide border-b border-gray-100">
                  <th className="px-3 py-2 font-semibold">Customer</th>
                  <th className="px-3 py-2 font-semibold">Closer</th>
                  <th className="px-3 py-2 font-semibold">Cluster</th>
                  <th className="px-3 py-2 font-semibold">Package</th>
                  <th className="px-3 py-2 font-semibold text-right">Amount</th>
                  <th className="px-3 py-2 font-semibold">Date Paid</th>
                </tr>
              </thead>
              <tbody>
                {salesInRange.slice(0, 100).map(r => (
                  <tr key={r.transaction_id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-3 py-2.5 font-medium text-gray-800">{r.customer_name}</td>
                    <td className="px-3 py-2.5 text-gray-600">{r.sales_agent}</td>
                    <td className="px-3 py-2.5 text-gray-500">{r.team}</td>
                    <td className="px-3 py-2.5 text-gray-500">{r.meta?.package || '—'}</td>
                    <td className="px-3 py-2.5 text-right font-semibold" style={{ color: TEAL }}>
                      {formatPHP(r.sales_amount)}
                    </td>
                    <td className="px-3 py-2.5 text-gray-600">{r.date ? fmtDate(r.date) : '—'}</td>
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

      {/* Daily trend */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <TrendingUp size={16} style={{ color: TEAL }} /> Daily Bookings Trend
        </h3>
        {trend.length === 0 ? (
          <p className="text-sm text-gray-400 py-10 text-center">No bookings in this period.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trend} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#999' }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#999' }} />
              <Tooltip />
              <Line type="monotone" dataKey="bookings" stroke={TEAL} strokeWidth={2.5}
                dot={{ r: 3, fill: TEAL }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Time slots */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <Clock size={16} style={{ color: TEAL }} /> Bookings by Time Slot
        </h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={slotData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="slot" tick={{ fontSize: 11, fill: '#999' }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#999' }} />
            <Tooltip />
            <Bar dataKey="count" radius={[6, 6, 0, 0]}>
              {slotData.map((_, i) => <Cell key={i} fill={i % 2 === 0 ? TEAL : GOLD} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Bookings table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">Bookings ({inRange.length})</h3>
        </div>
        {inRange.length === 0 ? (
          <p className="text-sm text-gray-400 py-10 text-center">No bookings in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 text-xs uppercase tracking-wide border-b border-gray-100">
                  <th className="px-4 py-2 font-semibold">Name</th>
                  <th className="px-4 py-2 font-semibold">Date</th>
                  <th className="px-4 py-2 font-semibold">Time</th>
                  <th className="px-4 py-2 font-semibold">Type</th>
                  <th className="px-4 py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {inRange.slice(0, 200).map(b => (
                  <tr key={b.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-2.5 font-medium text-gray-800">{b.name}</td>
                    <td className="px-4 py-2.5 text-gray-600">{fmtDate(b.startsAt)}</td>
                    <td className="px-4 py-2.5 text-gray-600">{fmtTime(b.startsAt)}</td>
                    <td className="px-4 py-2.5 text-gray-500">{b.appointmentType}</td>
                    <td className="px-4 py-2.5">
                      {b.cancelled ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600">
                          <XCircle size={13} /> Cancelled
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-600">
                          <CalendarCheck size={13} /> Active
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {inRange.length > 200 && (
              <p className="text-xs text-gray-400 text-center py-3">
                Showing first 200 of {inRange.length}. Export CSV for the full list.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
