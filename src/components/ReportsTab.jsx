// Reports tab — sales report view backed by LakbayHub signups data.
// Distinct from the Sales tab (analytics/insights) and Dashboard tab
// (operations matrix). This is the "raw report" view a manager would
// hand to finance or copy into a weekly slide.

import { useMemo, useState, useEffect } from 'react'
import {
  FileText, Download, Search, ChevronUp, ChevronDown,
  Calendar, DollarSign, ExternalLink, Users, Package, Briefcase, Loader2,
} from 'lucide-react'
import useSalesData from '../hooks/useSalesData'
import LiveIndicator from './LiveIndicator'
import DataSourceBanner from './ui/DataSourceBanner'
import DateRangePicker from './DateRangePicker'
import { keyForRecord, setOverride, subscribeSaleOverrides } from '../lib/saleDateOverrides'
import { CalendarClock, Check, X as XIcon } from 'lucide-react'
import {
  formatPHP, formatPHPCompact, parseDate, sum,
  filterByRange, rangeFor, startOfWeek, startOfMonth,
  endOfMonth, endOfWeek, getSalesSource,
} from '../api/lakbay'
import { fetchAllBookingTransactions, mapBookingTransaction } from '../api/fusioo'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from 'recharts'

const PRIMARY = '#1B4F4F'
const ACCENT  = '#F5A623'
const CHART_COLORS = [PRIMARY, ACCENT, '#4ECDC4', '#7FB069', '#C26DBC', '#6D9EEB', '#E8945A', '#9B8Bd4']

// Daily revenue + sign-up series from records (oldest → newest), for trend charts
function dailySeries(records) {
  const m = new Map()
  for (const r of records) {
    if (!r.date) continue
    if (!m.has(r.date)) m.set(r.date, { date: r.date, revenue: 0, signups: 0 })
    const g = m.get(r.date)
    g.revenue += r.sales_amount || 0
    g.signups += 1
  }
  return [...m.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(d => ({ ...d, label: parseDate(d.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) }))
}

const PERIODS = [
  { id: 'daily',   label: 'Daily'   },
  { id: 'weekly',  label: 'Weekly'  },
  { id: 'monthly', label: 'Monthly' },
  { id: 'all',     label: 'All'     },
]

// Report categories (top-level selector)
const REPORTS = [
  { id: 'signups',  label: 'Sign-ups',   Icon: FileText },
  { id: 'closer',   label: 'By Closer',  Icon: Users },
  { id: 'package',  label: 'By Package', Icon: Package },
  { id: 'officers', label: 'Officers',   Icon: Briefcase },
]

// Range-filter periods (used by the breakdown + officers reports)
const RANGES = [
  { id: 'today', label: 'Today',      rf: 'daily'   },
  { id: 'week',  label: 'This Week',  rf: 'weekly'  },
  { id: 'month', label: 'This Month', rf: 'monthly' },
  { id: 'all',   label: 'All-Time' },
]

// Filter records to a selected range (or custom date set). Works for both
// LakbayHub and Fusioo records (both expose `date` as YYYY-MM-DD).
function filterByPeriod(records, rangeId, customSet, isCustom) {
  if (rangeId === 'custom') return isCustom ? records.filter(r => customSet.has(r.date)) : []
  if (rangeId === 'all') return records
  const rf = RANGES.find(r => r.id === rangeId)?.rf
  if (!rf) return records
  const { start, end } = rangeFor(rf, new Date())
  return filterByRange(records, start, end)
}

// ---------------------------------------------------------------------------
// Helpers

function fmtDateISO(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function fmtDayLabel(d) {
  return d.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

function groupRecordsByDate(records) {
  const map = new Map()
  for (const r of records) {
    if (!r.date) continue
    if (!map.has(r.date)) map.set(r.date, [])
    map.get(r.date).push(r)
  }
  return map
}

// Group records by ISO week (Mon-Sun)
function groupByWeek(records) {
  const map = new Map()
  for (const r of records) {
    if (!r.date) continue
    const d = parseDate(r.date)
    const ws = startOfWeek(d)
    const key = fmtDateISO(ws)
    if (!map.has(key)) map.set(key, { weekStart: ws, weekEnd: endOfWeek(ws), records: [] })
    map.get(key).records.push(r)
  }
  return [...map.values()].sort((a, b) => b.weekStart - a.weekStart)
}

// Group records by month
function groupByMonth(records) {
  const map = new Map()
  for (const r of records) {
    if (!r.date) continue
    const d = parseDate(r.date)
    const ms = startOfMonth(d)
    const key = fmtDateISO(ms)
    if (!map.has(key)) map.set(key, { monthStart: ms, monthEnd: endOfMonth(ms), records: [] })
    map.get(key).records.push(r)
  }
  return [...map.values()].sort((a, b) => b.monthStart - a.monthStart)
}

function downloadCSV(filename, rows) {
  const csv = rows.map(row => row.map(cell => {
    if (cell == null) return ''
    const s = String(cell)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------------------
// Summary KPI card

function KpiCard({ icon: Icon, label, value, sub, tone = '#E8F4F4' }) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-col gap-2">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: tone }}>
        <Icon size={16} style={{ color: PRIMARY }} />
      </div>
      <p className="text-xl font-bold text-gray-900 truncate" title={value}>{value}</p>
      <p className="text-xs text-gray-500 leading-tight">{label}</p>
      {sub && <p className="text-[11px] text-gray-400 leading-tight">{sub}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Daily summary table

function DailyReport({ records }) {
  const byDate = useMemo(() => groupRecordsByDate(records), [records])
  const rows = useMemo(() => {
    return [...byDate.entries()]
      .map(([date, recs]) => {
        const paid = recs.filter(r => r.meta?.payment_status === 'PAID').length
        const activated = recs.filter(r => r.meta?.account_status === 'ACTIVATED').length
        return {
          date,
          signups: recs.length,
          revenue: sum(recs, 'sales_amount'),
          paid,
          pending: recs.length - paid,
          activated,
          avg: Math.round(sum(recs, 'sales_amount') / recs.length),
        }
      })
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [byDate])

  return <SummaryTable rows={rows.map(r => ({
    period: r.date,
    label: fmtDayLabel(parseDate(r.date)),
    ...r,
  }))} periodLabel="Date" />
}

function WeeklyReport({ records }) {
  const grouped = useMemo(() => groupByWeek(records), [records])
  const rows = grouped.map(g => {
    const paid = g.records.filter(r => r.meta?.payment_status === 'PAID').length
    return {
      period: fmtDateISO(g.weekStart),
      label: `${g.weekStart.toLocaleDateString('en-PH', { month:'short', day:'numeric' })} – ${g.weekEnd.toLocaleDateString('en-PH', { month:'short', day:'numeric', year:'numeric' })}`,
      signups: g.records.length,
      revenue: sum(g.records, 'sales_amount'),
      paid,
      pending: g.records.length - paid,
      activated: g.records.filter(r => r.meta?.account_status === 'ACTIVATED').length,
      avg: Math.round(sum(g.records, 'sales_amount') / g.records.length),
    }
  })
  return <SummaryTable rows={rows} periodLabel="Week (Mon–Sun)" />
}

function MonthlyReport({ records }) {
  const grouped = useMemo(() => groupByMonth(records), [records])
  const rows = grouped.map(g => {
    const paid = g.records.filter(r => r.meta?.payment_status === 'PAID').length
    return {
      period: fmtDateISO(g.monthStart),
      label: g.monthStart.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }),
      signups: g.records.length,
      revenue: sum(g.records, 'sales_amount'),
      paid,
      pending: g.records.length - paid,
      activated: g.records.filter(r => r.meta?.account_status === 'ACTIVATED').length,
      avg: Math.round(sum(g.records, 'sales_amount') / g.records.length),
    }
  })
  return <SummaryTable rows={rows} periodLabel="Month" />
}

function SummaryTable({ rows, periodLabel }) {
  if (rows.length === 0) {
    return <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-400">No records</div>
  }
  const totals = rows.reduce((a, r) => ({
    signups: a.signups + r.signups,
    revenue: a.revenue + r.revenue,
    paid:    a.paid    + r.paid,
    pending: a.pending + r.pending,
  }), { signups: 0, revenue: 0, paid: 0, pending: 0 })

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              {[periodLabel, 'Sign-ups', 'Revenue', 'Paid', 'Pending', 'Activated', 'Avg / Sign-up'].map(h => (
                <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map(r => (
              <tr key={r.period} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-2.5 font-medium text-gray-900 whitespace-nowrap">{r.label}</td>
                <td className="px-4 py-2.5 text-gray-800">{r.signups}</td>
                <td className="px-4 py-2.5 font-semibold text-gray-900">{formatPHP(r.revenue)}</td>
                <td className="px-4 py-2.5">
                  <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-md text-[11px] font-semibold">
                    {r.paid}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded-md text-[11px] font-semibold">
                    {r.pending}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-gray-600">{r.activated}</td>
                <td className="px-4 py-2.5 text-gray-500">{formatPHPCompact(r.avg)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 border-t-2 border-gray-200 font-bold">
              <td className="px-4 py-2.5 text-gray-900">Total ({rows.length} periods)</td>
              <td className="px-4 py-2.5 text-gray-900">{totals.signups}</td>
              <td className="px-4 py-2.5 text-gray-900">{formatPHP(totals.revenue)}</td>
              <td className="px-4 py-2.5 text-emerald-700">{totals.paid}</td>
              <td className="px-4 py-2.5 text-amber-700">{totals.pending}</td>
              <td className="px-4 py-2.5"></td>
              <td className="px-4 py-2.5 text-gray-500">{totals.signups > 0 ? formatPHPCompact(totals.revenue / totals.signups) : '—'}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Detailed signups list (sortable, filterable)

const PAYMENT_FILTERS = ['All', 'PAID', 'PENDING']
const ACCOUNT_FILTERS = ['All', 'ACTIVATED', 'PENDING']

function statusTone(s) {
  if (s === 'PAID' || s === 'ACTIVATED') return 'bg-emerald-50 text-emerald-700'
  if (s === 'PENDING')                   return 'bg-amber-50 text-amber-700'
  if (s === 'REFUNDED')                  return 'bg-red-50 text-red-700'
  return 'bg-gray-100 text-gray-600'
}

// Date cell with inline sale-date correction (for late-posted manual payments).
function DateCell({ r }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(r.date)

  const save = () => {
    if (val && val !== r.date) {
      setOverride(keyForRecord(r), val, { originalDate: r.originalDate || r.date, note: 'manual correction' })
    }
    setEditing(false)
  }
  const clear = () => { setOverride(keyForRecord(r), null); setEditing(false) }

  if (editing) {
    return (
      <td className="px-3 py-2 whitespace-nowrap">
        <div className="flex items-center gap-1">
          <input
            type="date"
            value={val}
            onChange={e => setVal(e.target.value)}
            className="border border-gray-200 rounded-md px-1.5 py-0.5 text-xs focus:outline-none focus:border-[#1B4F4F]"
          />
          <button onClick={save} title="Save corrected date" className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"><Check size={13} /></button>
          {r.corrected && (
            <button onClick={clear} title="Remove correction" className="p-1 text-red-500 hover:bg-red-50 rounded"><XIcon size={13} /></button>
          )}
          <button onClick={() => setEditing(false)} title="Cancel" className="p-1 text-gray-400 hover:bg-gray-100 rounded"><XIcon size={13} /></button>
        </div>
      </td>
    )
  }

  return (
    <td className="px-3 py-2 whitespace-nowrap">
      <div className="flex items-center gap-1.5 group">
        <span className="text-gray-700 font-medium">{r.date}</span>
        {r.corrected && (
          <span title={`Corrected from ${r.originalDate}`}
                className="px-1.5 py-0.5 rounded bg-teal-50 text-teal-700 text-[9px] font-semibold whitespace-nowrap">
            ✎ was {r.originalDate}
          </span>
        )}
        <button
          onClick={() => { setVal(r.date); setEditing(true) }}
          title="Correct sale date (for late-posted manual payments)"
          className="p-0.5 text-gray-300 hover:text-[#1B4F4F] transition-colors"
        >
          <CalendarClock size={13} />
        </button>
      </div>
    </td>
  )
}

function SortTh({ sortKey, sortDir, onToggle, k, children, w }) {
  return (
    <th
      onClick={() => onToggle(k)}
      className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap cursor-pointer hover:text-gray-900 select-none"
      style={w ? { minWidth: w } : undefined}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {sortKey === k && (sortDir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}
      </span>
    </th>
  )
}

function DetailedList({ records }) {
  const [search, setSearch] = useState('')
  const [payment, setPayment] = useState('All')
  const [account, setAccount] = useState('All')
  const [sortKey, setSortKey] = useState('date')
  const [sortDir, setSortDir] = useState('desc')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return records.filter(r => {
      if (payment !== 'All' && r.meta?.payment_status !== payment) return false
      if (account !== 'All' && r.meta?.account_status !== account) return false
      if (!q) return true
      return (r.customer_name || '').toLowerCase().includes(q)
          || (r.meta?.email || '').toLowerCase().includes(q)
          || (r.team || '').toLowerCase().includes(q)
          || (r.meta?.package || '').toLowerCase().includes(q)
    })
  }, [records, search, payment, account])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    arr.sort((a, b) => {
      let av, bv
      switch (sortKey) {
        case 'date':     av = a.date; bv = b.date; break
        case 'name':     av = a.customer_name || ''; bv = b.customer_name || ''; break
        case 'team':     av = a.team || ''; bv = b.team || ''; break
        case 'package':  av = a.meta?.package || ''; bv = b.meta?.package || ''; break
        case 'amount':   av = a.sales_amount; bv = b.sales_amount; break
        case 'status':   av = a.meta?.payment_status || ''; bv = b.meta?.payment_status || ''; break
        default: return 0
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ?  1 : -1
      return 0
    })
    return arr
  }, [filtered, sortKey, sortDir])

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  function exportCSV() {
    const header = ['Date', 'Customer', 'Email', 'Package', 'Team', 'Amount (PHP)', 'Payment Status', 'Account Status', 'Facebook', 'Transaction ID']
    const rows = [header, ...sorted.map(r => [
      r.date,
      r.customer_name,
      r.meta?.email || '',
      r.meta?.package || '',
      r.team,
      r.sales_amount,
      r.meta?.payment_status || '',
      r.meta?.account_status || '',
      r.meta?.facebook || '',
      r.transaction_id,
    ])]
    downloadCSV(`signups-report-${fmtDateISO(new Date())}.csv`, rows)
  }


  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-semibold text-gray-900">All Sign-ups</h3>
          <p className="text-[11px] text-gray-500 mt-0.5">
            {sorted.length} of {records.length} · {payment !== 'All' || account !== 'All' || search ? 'filtered' : 'all records'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name, email, team…"
              className="pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-xl focus:outline-none focus:border-[#1B4F4F]"
            />
          </div>
          <select value={payment} onChange={e => setPayment(e.target.value)}
                  className="px-2 py-1.5 text-xs border border-gray-200 rounded-xl focus:outline-none focus:border-[#1B4F4F]">
            {PAYMENT_FILTERS.map(f => <option key={f} value={f}>Payment: {f}</option>)}
          </select>
          <select value={account} onChange={e => setAccount(e.target.value)}
                  className="px-2 py-1.5 text-xs border border-gray-200 rounded-xl focus:outline-none focus:border-[#1B4F4F]">
            {ACCOUNT_FILTERS.map(f => <option key={f} value={f}>Account: {f}</option>)}
          </select>
          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-white transition-colors"
            style={{ backgroundColor: PRIMARY }}
          >
            <Download size={13} /> Export CSV
          </button>
        </div>
      </div>
      <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-50 z-10">
            <tr className="border-b border-gray-100">
              <SortTh sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} k="date">Date</SortTh>
              <SortTh sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} k="name" w={150}>Customer</SortTh>
              <SortTh sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} k="package">Package</SortTh>
              <SortTh sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} k="team">Cluster</SortTh>
              <SortTh sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} k="amount">Amount</SortTh>
              <SortTh sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} k="status">Payment</SortTh>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">Account</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">Email</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">Payment Link</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {sorted.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400">No records match filters</td></tr>
            ) : sorted.map(r => (
              <tr key={r.transaction_id} className="hover:bg-gray-50 transition-colors">
                <DateCell r={r} />
                <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{r.customer_name}</td>
                <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.meta?.package || '—'}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span className="px-2 py-0.5 bg-teal-50 text-teal-700 rounded-md text-[11px]">{r.team}</span>
                </td>
                <td className="px-3 py-2 font-semibold text-gray-900 whitespace-nowrap">{formatPHP(r.sales_amount)}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {r.meta?.payment_status && (
                    <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${statusTone(r.meta.payment_status)}`}>
                      {r.meta.payment_status}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {r.meta?.account_status && (
                    <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${statusTone(r.meta.account_status)}`}>
                      {r.meta.account_status}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-gray-500 text-xs max-w-[200px] truncate" title={r.meta?.email}>
                  {r.meta?.email || '—'}
                </td>
                <td className="px-3 py-2 text-xs">
                  {r.meta?.payment_link ? (
                    <a href={r.meta.payment_link} target="_blank" rel="noopener noreferrer"
                       className="text-[#1B4F4F] hover:underline inline-flex items-center gap-0.5">
                      Open <ExternalLink size={10} />
                    </a>
                  ) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Reusable range filter (pills + custom date picker)

function PeriodFilter({ rangeId, onRange, customDates, isCustom, onApplyCustom }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
        {RANGES.map(r => (
          <button key={r.id} onClick={() => onRange(r.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              rangeId === r.id ? 'bg-white text-[#1B4F4F] shadow-sm font-semibold' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {r.label}
          </button>
        ))}
      </div>
      <DateRangePicker value={customDates} active={isCustom} onApply={onApplyCustom} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Generic breakdown report: group records by a dimension → ranked table + CSV

function BreakdownReport({ records, dimension, label, filename, periodLabel }) {
  const rows = useMemo(() => {
    const m = new Map()
    for (const r of records) {
      const k = (dimension(r) || '—')
      if (!m.has(k)) m.set(k, { name: k, revenue: 0, count: 0 })
      const g = m.get(k)
      g.revenue += r.sales_amount || 0
      g.count += 1
    }
    return [...m.values()]
      .map(g => ({ ...g, avg: g.count ? Math.round(g.revenue / g.count) : 0 }))
      .sort((a, b) => b.revenue - a.revenue)
  }, [records, dimension])

  const total = rows.reduce((a, r) => a + r.revenue, 0)
  const totalCount = records.length
  const maxRev = Math.max(1, ...rows.map(r => r.revenue))

  // Chart data: top 12 for the bar, top 6 + "Others" for the donut
  const barData = rows.slice(0, 12).map(r => ({
    name: r.name.length > 16 ? r.name.slice(0, 15) + '…' : r.name, revenue: r.revenue,
  }))
  const donutData = [
    ...rows.slice(0, 6).map(r => ({ name: r.name, value: r.revenue })),
    ...(rows.length > 6 ? [{ name: 'Others', value: rows.slice(6).reduce((a, r) => a + r.revenue, 0) }] : []),
  ]

  function exportCSV() {
    const header = [label, 'Revenue (PHP)', '# Sales', 'Avg (PHP)', 'Share %']
    const body = rows.map(r => [r.name, r.revenue, r.count, r.avg, total ? Math.round(r.revenue / total * 100) : 0])
    downloadCSV(`${filename}-${fmtDateISO(new Date())}.csv`,
      [header, ...body, [], ['TOTAL', total, totalCount, totalCount ? Math.round(total / totalCount) : 0, 100]])
  }

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-semibold text-gray-900">{label} {periodLabel ? `· ${periodLabel}` : ''}</h3>
          <p className="text-[11px] text-gray-500 mt-0.5">Overall {formatPHP(total)} · {totalCount} sales</p>
        </div>
        <button onClick={exportCSV} disabled={rows.length === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-white disabled:opacity-40"
          style={{ backgroundColor: PRIMARY }}>
          <Download size={13} /> Export CSV
        </button>
      </div>
      {rows.length > 0 && (
        <div className="grid lg:grid-cols-2 gap-4 p-5 pb-1">
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2">Revenue by {label.toLowerCase()} (top 12)</p>
            <ResponsiveContainer width="100%" height={Math.max(180, barData.length * 30)}>
              <BarChart data={barData} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={formatPHPCompact} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={96} />
                <Tooltip formatter={(v) => formatPHP(v)} />
                <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
                  {barData.map((e, i) => <Cell key={i} fill={i === 0 ? ACCENT : PRIMARY} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2">Revenue share</p>
            <ResponsiveContainer width="100%" height={Math.max(180, barData.length * 30)}>
              <PieChart>
                <Pie data={donutData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2} dataKey="value">
                  {donutData.map((e, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => formatPHP(v)} />
                <Legend iconType="circle" iconSize={8} formatter={(v) => <span style={{ fontSize: 10 }}>{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>{['#', label, 'Revenue', '# Sales', 'Avg', 'Share'].map(h => (
              <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
            ))}</tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400">No sales in this period</td></tr>
            ) : rows.map((r, i) => {
              const share = total ? Math.round(r.revenue / total * 100) : 0
              return (
                <tr key={r.name} className="hover:bg-gray-50">
                  <td className="px-3 py-2.5">
                    <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${
                      i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-gray-200 text-gray-700' : i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'
                    }`}>{i + 1}</span>
                  </td>
                  <td className="px-3 py-2.5 font-medium text-gray-900">{r.name}</td>
                  <td className="px-3 py-2.5 font-bold text-gray-900 whitespace-nowrap">{formatPHP(r.revenue)}</td>
                  <td className="px-3 py-2.5 text-gray-600">{r.count}</td>
                  <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{formatPHPCompact(r.avg)}</td>
                  <td className="px-3 py-2.5 w-40">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${Math.max(4, r.revenue / maxRev * 100)}%`, backgroundColor: i === 0 ? '#F5A623' : PRIMARY }} />
                      </div>
                      <span className="text-xs text-gray-500 w-9 text-right">{share}%</span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Officers report (Fusioo Booking Transactions) — per-agent totals + detail

function OfficersReport({ rangeId, isCustom, customSet }) {
  const [txs, setTxs] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    let alive = true
    fetchAllBookingTransactions()
      .then(raw => { if (alive) setTxs(raw.map(mapBookingTransaction)) })
      .catch(e => { if (alive) { setErr(e.message); setTxs([]) } })
    return () => { alive = false }
  }, [])

  const scoped = useMemo(
    () => (txs ? filterByPeriod(txs.filter(t => t.date), rangeId, customSet, isCustom) : []),
    [txs, rangeId, customSet, isCustom],
  )
  const byAgent = useMemo(() => {
    const m = new Map()
    for (const r of scoped) {
      const k = r.sales_agent || 'Unassigned'
      if (!m.has(k)) m.set(k, { name: k, team: r.team, revenue: 0, profit: 0, count: 0 })
      const g = m.get(k); g.revenue += r.sales_amount || 0; g.profit += r.profit || 0; g.count += 1
    }
    return [...m.values()].map(g => ({ ...g, avg: g.count ? Math.round(g.revenue / g.count) : 0 })).sort((a, b) => b.revenue - a.revenue)
  }, [scoped])

  const totalRev = byAgent.reduce((a, r) => a + r.revenue, 0)
  const totalProfit = byAgent.reduce((a, r) => a + r.profit, 0)

  function exportAgents() {
    const header = ['Officer', 'Team', 'Revenue (PHP)', 'Profit (PHP)', '# Transactions', 'Avg (PHP)']
    const body = byAgent.map(a => [a.name, a.team, a.revenue, a.profit, a.count, a.avg])
    downloadCSV(`officers-summary-${fmtDateISO(new Date())}.csv`,
      [header, ...body, [], ['TOTAL', '', totalRev, totalProfit, scoped.length, scoped.length ? Math.round(totalRev / scoped.length) : 0]])
  }
  function exportDetail() {
    const header = ['Date', 'Officer', 'Team', 'Type', 'Package', 'Status', 'Revenue (PHP)', 'Profit (PHP)', 'Transaction ID']
    const body = scoped.map(t => [t.date, t.sales_agent, t.team, t.meta?.transaction_type || '', t.meta?.type_of_package || '', t.meta?.status || '', t.sales_amount, t.profit, t.transaction_id])
    downloadCSV(`officers-transactions-${fmtDateISO(new Date())}.csv`, [header, ...body])
  }

  if (txs === null) return <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-400"><Loader2 className="inline animate-spin mr-2" size={15} />Loading Fusioo transactions…</div>
  if (err) return <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center text-red-600">Fusioo error: {err}</div>

  return (
    <div className="flex flex-col gap-4">
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-semibold text-gray-900">Account Officers — per agent</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">Revenue {formatPHP(totalRev)} · Profit {formatPHP(totalProfit)} · {scoped.length} transactions (Fusioo)</p>
          </div>
          <button onClick={exportAgents} disabled={byAgent.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-white disabled:opacity-40" style={{ backgroundColor: PRIMARY }}>
            <Download size={13} /> Export CSV
          </button>
        </div>
        {byAgent.length > 0 && (
          <div className="p-5 pb-1">
            <p className="text-xs font-semibold text-gray-500 mb-2">Revenue vs Profit by officer</p>
            <ResponsiveContainer width="100%" height={Math.max(200, byAgent.length * 34)}>
              <BarChart data={byAgent.slice(0, 12).map(a => ({ name: a.name.length > 16 ? a.name.slice(0, 15) + '…' : a.name, revenue: a.revenue, profit: a.profit }))}
                        layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={formatPHPCompact} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                <Tooltip formatter={(v) => formatPHP(v)} />
                <Legend iconType="circle" iconSize={8} formatter={(v) => <span style={{ fontSize: 11 }}>{v}</span>} />
                <Bar dataKey="revenue" name="Revenue" fill={PRIMARY} radius={[0, 4, 4, 0]} />
                <Bar dataKey="profit" name="Profit" fill={ACCENT} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>{['#', 'Officer', 'Team', 'Revenue', 'Profit', '# Txns', 'Avg'].map(h => (
                <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {byAgent.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400">No transactions in this period</td></tr>
              ) : byAgent.map((a, i) => (
                <tr key={a.name} className="hover:bg-gray-50">
                  <td className="px-3 py-2.5"><span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${i === 0 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>{i + 1}</span></td>
                  <td className="px-3 py-2.5 font-medium text-gray-900 whitespace-nowrap">{a.name}</td>
                  <td className="px-3 py-2.5 text-gray-500 text-xs">{a.team}</td>
                  <td className="px-3 py-2.5 font-bold text-gray-900 whitespace-nowrap">{formatPHP(a.revenue)}</td>
                  <td className="px-3 py-2.5 text-emerald-700 whitespace-nowrap">{formatPHPCompact(a.profit)}</td>
                  <td className="px-3 py-2.5 text-gray-600">{a.count}</td>
                  <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{formatPHPCompact(a.avg)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
          <h3 className="font-semibold text-gray-900">Transaction detail ({scoped.length})</h3>
          <button onClick={exportDetail} disabled={scoped.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-white disabled:opacity-40" style={{ backgroundColor: PRIMARY }}>
            <Download size={13} /> Export CSV
          </button>
        </div>
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 z-10">
              <tr>{['Date', 'Officer', 'Team', 'Type', 'Package', 'Status', 'Revenue'].map(h => (
                <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {scoped.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400">No transactions</td></tr>
              ) : scoped.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(t => (
                <tr key={t.transaction_id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{t.date}</td>
                  <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{t.sales_agent}</td>
                  <td className="px-3 py-2 text-gray-500 text-xs">{t.team}</td>
                  <td className="px-3 py-2 text-gray-600 text-xs">{t.meta?.transaction_type || '—'}</td>
                  <td className="px-3 py-2 text-gray-600 text-xs">{t.meta?.type_of_package || '—'}</td>
                  <td className="px-3 py-2 text-xs">{t.meta?.status || '—'}</td>
                  <td className="px-3 py-2 font-semibold text-gray-900 whitespace-nowrap">{formatPHP(t.sales_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

// ---------------------------------------------------------------------------

export default function ReportsTab() {
  const { records, loading, refreshing, error, lastFetched, refresh } = useSalesData()
  const [report, setReport] = useState('signups')  // signups | closer | package | officers
  const [periodId, setPeriodId] = useState('daily')
  const [customDates, setCustomDates] = useState([])  // YYYY-MM-DD[] when periodId === 'custom'
  const isCustom = periodId === 'custom' && customDates.length > 0
  const customSet = useMemo(() => new Set(customDates), [customDates])

  // Separate range filter for the breakdown / officers reports
  const [rangeId, setRangeId] = useState('all')
  const [rangeCustom, setRangeCustom] = useState([])
  const isRangeCustom = rangeId === 'custom' && rangeCustom.length > 0
  const rangeCustomSet = useMemo(() => new Set(rangeCustom), [rangeCustom])
  const scoped = useMemo(
    () => filterByPeriod(records, rangeId, rangeCustomSet, isRangeCustom),
    [records, rangeId, rangeCustomSet, isRangeCustom],
  )
  const rangeLabel = isRangeCustom
    ? (rangeCustom.length === 1 ? '1 day' : `${rangeCustom.length} days`)
    : (RANGES.find(r => r.id === rangeId)?.label || '')
  const applyRangeCustom = (dates) => { setRangeCustom(dates); setRangeId('custom') }
  const customRecords = useMemo(
    () => (isCustom ? records.filter(r => customSet.has(r.date)) : records),
    [isCustom, records, customSet],
  )

  // Re-fetch (which re-applies sale-date corrections) when a correction changes
  useEffect(() => subscribeSaleOverrides(() => refresh()), [refresh])

  if (loading) return <div className="text-center py-12 text-gray-400">Loading sales report…</div>
  if (error)   return <div className="text-center py-12 text-red-500">{error.message}</div>

  // Window totals for KPI strip
  const now = new Date()
  const today    = rangeFor('daily',   now)
  const thisWeek = rangeFor('weekly',  now)
  const thisMth  = rangeFor('monthly', now)

  const todayRecs    = filterByRange(records, today.start,   today.end)
  const weekRecs     = filterByRange(records, thisWeek.start, thisWeek.end)
  const mthRecs      = filterByRange(records, thisMth.start,  thisMth.end)

  return (
    <div className="flex flex-col gap-5 pb-24 sm:pb-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <FileText size={20} style={{ color: PRIMARY }} />
            Reports
          </h1>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <p className="text-sm text-gray-500">Sign-ups, sales by closer/package, and officer performance — all downloadable.</p>
            <LiveIndicator lastFetched={lastFetched} refreshing={refreshing} onRefresh={refresh} label="LakbayHub" />
          </div>
        </div>
      </div>

      <DataSourceBanner source={getSalesSource()} />

      {/* At-a-glance KPI strip — Today, Week (Mon-Sun), Month, All-time */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard icon={Calendar}    label="Today"
                 value={formatPHP(sum(todayRecs, 'sales_amount'))}
                 sub={`${todayRecs.length} sign-up${todayRecs.length === 1 ? '' : 's'}`} />
        <KpiCard icon={Calendar}    label="This Week (Mon–Sun)"
                 value={formatPHPCompact(sum(weekRecs, 'sales_amount'))}
                 sub={`${weekRecs.length} sign-ups`} />
        <KpiCard icon={Calendar}    label="This Month"
                 value={formatPHPCompact(sum(mthRecs, 'sales_amount'))}
                 sub={`${mthRecs.length} sign-ups`} tone="#FFF4E0" />
        <KpiCard icon={DollarSign}  label="All-Time"
                 value={formatPHPCompact(sum(records, 'sales_amount'))}
                 sub={`${records.length} total records`} tone="#dcfce7" />
      </div>

      {/* Report category selector */}
      <div className="flex bg-gray-100 rounded-xl p-1 gap-1 overflow-x-auto w-fit max-w-full">
        {REPORTS.map(({ id, label, Icon }) => (
          <button key={id} onClick={() => setReport(id)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              report === id ? 'bg-white text-[#1B4F4F] shadow-sm font-semibold' : 'text-gray-500 hover:text-gray-700'
            }`}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* Range filter — for By Closer / By Package / Officers */}
      {report !== 'signups' && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-base font-semibold text-gray-800">
            {REPORTS.find(r => r.id === report)?.label} report
          </h2>
          <PeriodFilter rangeId={rangeId} onRange={setRangeId}
            customDates={rangeCustom} isCustom={isRangeCustom} onApplyCustom={applyRangeCustom} />
        </div>
      )}

      {report === 'closer' && (
        <BreakdownReport records={scoped} dimension={r => r.team} label="Closer / Cluster"
          filename="sales-by-closer" periodLabel={rangeLabel} />
      )}
      {report === 'package' && (
        <BreakdownReport records={scoped} dimension={r => r.meta?.package} label="Package"
          filename="sales-by-package" periodLabel={rangeLabel} />
      )}
      {report === 'officers' && (
        <OfficersReport rangeId={rangeId} isCustom={isRangeCustom} customSet={rangeCustomSet} />
      )}

      {/* ── Sign-ups report (existing) ── */}
      {report === 'signups' && (<>
      {/* Revenue trend chart */}
      {(() => {
        const series = dailySeries(records)
        if (series.length < 2) return null
        return (
          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <p className="text-sm font-semibold text-gray-700 mb-3">Revenue trend (all sign-ups)</p>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={series} margin={{ left: 4, right: 12, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} minTickGap={24} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={formatPHPCompact} />
                <Tooltip formatter={(v) => formatPHP(v)} />
                <Line type="monotone" dataKey="revenue" stroke={PRIMARY} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </section>
        )
      })()}
      {/* Period selector + summary table */}
      <section>
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <h2 className="text-base font-semibold text-gray-800">Sign-ups Summary</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
              {PERIODS.map(p => (
                <button
                  key={p.id}
                  onClick={() => setPeriodId(p.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    periodId === p.id
                      ? 'bg-white text-[#1B4F4F] shadow-sm font-semibold'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <DateRangePicker
              value={customDates}
              active={isCustom}
              onApply={(dates) => { setCustomDates(dates); setPeriodId('custom') }}
            />
          </div>
        </div>
        {periodId === 'daily'   && <DailyReport   records={records} />}
        {periodId === 'weekly'  && <WeeklyReport  records={records} />}
        {periodId === 'monthly' && <MonthlyReport records={records} />}
        {periodId === 'custom'  && (
          isCustom
            ? <DailyReport records={customRecords} />
            : <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center text-sm text-gray-500">
                Pumili ng petsa sa <strong>Custom</strong> calendar para makita ang sales ng mga araw na yun.
              </div>
        )}
        {periodId === 'all'     && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center">
            <p className="text-3xl font-bold text-gray-900">{formatPHP(sum(records, 'sales_amount'))}</p>
            <p className="text-sm text-gray-500 mt-1">{records.length} total sign-ups across all time</p>
          </div>
        )}
      </section>

      {/* Detailed signups list — filtered to the picked days when in custom mode */}
      <DetailedList records={isCustom ? customRecords : records} />
      </>)}
    </div>
  )
}
