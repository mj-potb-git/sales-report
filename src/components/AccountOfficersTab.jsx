// Account Officers tab — designed for the Sales Skills Development Manager
// (MJ's role). Combines company-wide snapshot, agent performance ranking,
// coaching priorities, and individual drill-down.
//
// Data source: LakbayHub today (via useSalesData). Fusioo BookingTransactions
// will augment / replace once credentials are configured.

import { useState, useMemo, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import {
  Award, Users, TrendingUp, TrendingDown, AlertCircle, Search,
  Target, Sparkles, ArrowLeft, ChevronRight, Lightbulb, GraduationCap,
  Briefcase, BarChart3, Trophy, Flame, Download, Wallet,
} from 'lucide-react'

function downloadCSV(filename, rows) {
  const csv = rows.map(r => r.map(c => {
    if (c == null) return ''
    const s = String(c)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}
import LiveIndicator from './LiveIndicator'
import {
  filterByRange, parseDate, sum,
  startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  dailyTrend, formatPHP, formatPHPCompact, timeAgo,
} from '../api/lakbay'
import { fetchAllBookingTransactions, mapBookingTransaction, totalsByAgent, totalsByTeam } from '../api/fusioo'
import OfficerReceivables from './OfficerReceivables'
import PeriodBar from './PeriodBar'
import HeroBand from './ui/HeroBand'
import RevenueTrend from './RevenueTrend'
import { periodRange, periodLabelFor, currentMonthKey, latestMonthKey } from '../lib/periods'

// Normalize a record's date to a local YYYY-MM-DD key (matches DateRangePicker's
// output) so custom-date filtering is exact regardless of source date format.
function recDayKey(dateStr) {
  const d = parseDate(dateStr)
  if (!d || isNaN(d)) return dateStr
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const PRIMARY = '#1B4F4F'
const ACCENT  = '#F5A623'
const PALETTE = [PRIMARY, ACCENT, '#4ECDC4', '#7FB069', '#C26DBC', '#6D9EEB']


// Performance tier thresholds — coaching-friendly labels
function tierFor(agent, teamAvgRevenue) {
  if (agent.sales >= teamAvgRevenue * 1.5) return { label: 'Top Performer', tone: 'bg-emerald-100 text-emerald-800', Icon: Trophy }
  if (agent.sales >= teamAvgRevenue * 0.75) return { label: 'Strong',         tone: 'bg-blue-100 text-blue-800',       Icon: Flame }
  if (agent.sales > 0)                       return { label: 'Average',       tone: 'bg-gray-100 text-gray-700',      Icon: BarChart3 }
  return                                            { label: 'Needs Coaching', tone: 'bg-amber-100 text-amber-800',    Icon: GraduationCap }
}

// ---------------------------------------------------------------------------
// Sub-components

function StatCard({ icon: Icon, label, value, sub, accent }) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-col gap-2">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: accent || '#E8F4F4' }}>
        <Icon size={16} style={{ color: PRIMARY }} />
      </div>
      <p className="text-xl font-bold text-gray-900 truncate">{value}</p>
      <p className="text-xs text-gray-500 leading-tight">{label}</p>
      {sub && <p className="text-[11px] text-gray-400 leading-tight">{sub}</p>}
    </div>
  )
}

function CoachingPriorityCard({ agent, reason, tone = 'warn' }) {
  const tones = {
    warn: 'bg-amber-50 border-amber-200 text-amber-900',
    info: 'bg-blue-50 border-blue-200 text-blue-900',
    good: 'bg-emerald-50 border-emerald-200 text-emerald-900',
  }
  return (
    <div className={`flex items-start gap-2 p-3 rounded-xl border ${tones[tone]}`}>
      <Lightbulb size={15} className="mt-0.5 flex-shrink-0" />
      <div className="min-w-0">
        <p className="font-semibold text-sm">{agent}</p>
        <p className="text-xs mt-0.5 opacity-90">{reason}</p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Individual agent drill-down

function AgentDetail({ agent, allRecords, onBack, teamAvgRevenue }) {
  const tier = tierFor(agent, teamAvgRevenue)
  const recs = allRecords.filter(r => r.sales_agent === agent.name)
  const trend = useMemo(() => dailyTrend(recs, 30), [recs])

  // Drill-down filters
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [periodFilter, setPeriodFilter] = useState('all')

  // Date range for period filter
  const inPeriod = (r) => {
    if (periodFilter === 'all') return true
    const d = parseDate(r.date)
    const now = new Date()
    if (periodFilter === 'thisweek') {
      return d >= startOfWeek(now) && d <= endOfWeek(now)
    }
    if (periodFilter === 'thismonth') {
      return d >= startOfMonth(now) && d <= endOfMonth(now)
    }
    if (periodFilter === 'last30') {
      return (now - d) <= 30 * 86400000
    }
    return true
  }

  const filteredRecs = recs.filter(r =>
    (statusFilter === 'all' || r.meta?.status === statusFilter) &&
    (typeFilter === 'all' || r.meta?.transaction_type === typeFilter) &&
    inPeriod(r)
  )

  // Available options for dropdowns
  const statusOptions = Array.from(new Set(recs.map(r => r.meta?.status).filter(Boolean))).sort()
  const typeOptions   = Array.from(new Set(recs.map(r => r.meta?.transaction_type).filter(Boolean))).sort()

  // Status breakdown
  const statusBreakdown = statusOptions.map(s => ({
    status: s,
    count: recs.filter(r => r.meta?.status === s).length,
    revenue: recs.filter(r => r.meta?.status === s).reduce((sum, r) => sum + (r.sales_amount || 0), 0),
  }))

  // Transaction type breakdown
  const typeBreakdown = typeOptions.map(t => ({
    type: t,
    count: recs.filter(r => r.meta?.transaction_type === t).length,
    revenue: recs.filter(r => r.meta?.transaction_type === t).reduce((sum, r) => sum + (r.sales_amount || 0), 0),
  })).sort((a, b) => b.revenue - a.revenue)

  // Recent (filtered) transactions sorted by date desc
  const recent = useMemo(() =>
    [...filteredRecs]
      .sort((a, b) => parseDate(b.date) - parseDate(a.date))
      .slice(0, 20),
    [filteredRecs]
  )

  const avgDeal = agent.txnCount > 0 ? agent.sales / agent.txnCount : 0
  const totalProfit = recs.reduce((s, r) => s + (r.profit || 0), 0)
  const profitMargin = agent.sales > 0 ? Math.round((totalProfit / agent.sales) * 100) : 0
  const lastActivity = recs.length > 0
    ? recs.reduce((latest, r) => parseDate(r.date) > parseDate(latest.date) ? r : latest, recs[0])
    : null

  // Best and worst deals
  const bestDeal  = recs.length > 0 ? [...recs].sort((a, b) => b.sales_amount - a.sales_amount)[0] : null
  const worstDeal = recs.length > 0 ? [...recs].sort((a, b) => a.sales_amount - b.sales_amount)[0] : null

  // Best day for this agent
  const bestDay = trend.reduce((max, d) => d.sales > max.sales ? d : max, trend[0] ?? { sales: 0 })

  function exportAgentCSV() {
    const today = new Date().toISOString().slice(0, 10)
    const header = ['POTB No.', 'Date', 'Status', 'Transaction Type', 'Customer', 'Package Type', 'Travel Date', 'Duration', 'Sales Amount (PHP)', 'Profit (PHP)', 'Cost (PHP)', 'Payment Type', 'Transaction ID']
    const rows = [header, ...filteredRecs
      .sort((a, b) => parseDate(b.date) - parseDate(a.date))
      .map(r => [
        r.meta?.gdx ?? '',
        r.date,
        r.meta?.status || '',
        r.meta?.transaction_type || '',
        r.customer_name,
        r.meta?.type_of_package || '',
        r.meta?.travel_date || '',
        r.meta?.duration || '',
        r.sales_amount,
        r.profit || 0,
        r.cost || 0,
        r.meta?.payment_type || '',
        r.transaction_id,
      ])
    ]
    downloadCSV(`${agent.name.replace(/\s+/g, '-')}-sales-${today}.csv`, rows)
  }

  return (
    <div className="flex flex-col gap-5">
      <button onClick={onBack} className="self-start flex items-center gap-1 text-sm text-gray-500 hover:text-[#1B4F4F]">
        <ArrowLeft size={14} /> Back to leaderboard
      </button>

      {/* Agent header card */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-lg font-bold"
                 style={{ backgroundColor: PRIMARY }}>
              {agent.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <div>
              <p className="text-lg font-bold text-gray-900">{agent.name}</p>
              <p className="text-sm text-gray-500">{agent.team}</p>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold mt-1 ${tier.tone}`}>
                <tier.Icon size={11} /> {tier.label}
              </span>
            </div>
          </div>
          {lastActivity && (
            <div className="text-right">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Last activity</p>
              <p className="text-sm font-semibold text-gray-700">{timeAgo(parseDate(lastActivity.date))}</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-5">
          <StatCard icon={TrendingUp} label="Total Revenue" value={formatPHP(agent.sales)} />
          <StatCard icon={Briefcase}  label="Deals Closed" value={String(agent.txnCount)} />
          <StatCard icon={Target}     label="Avg Deal Size" value={formatPHPCompact(avgDeal)} accent="#FFF4E0" />
          <StatCard icon={TrendingUp} label="Total Profit" value={formatPHPCompact(totalProfit)} sub={`${profitMargin}% margin`} accent="#dcfce7" />
          <StatCard icon={Trophy}     label="Best Deal" value={bestDeal ? formatPHPCompact(bestDeal.sales_amount) : '—'} sub={bestDeal ? bestDeal.date : ''} accent="#FFF4E0" />
          <StatCard icon={BarChart3}  label="Lowest Deal" value={worstDeal ? formatPHPCompact(worstDeal.sales_amount) : '—'} sub={worstDeal ? worstDeal.date : ''} />
        </div>

        {/* Comparison vs team avg */}
        <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500">vs team average:</span>
            {teamAvgRevenue > 0 && (
              <span className={`font-semibold ${agent.sales >= teamAvgRevenue ? 'text-emerald-700' : 'text-amber-700'}`}>
                {agent.sales >= teamAvgRevenue ? '+' : ''}{Math.round(((agent.sales - teamAvgRevenue) / teamAvgRevenue) * 100)}%
              </span>
            )}
            <span className="text-gray-400 text-xs">(team avg: {formatPHPCompact(teamAvgRevenue)})</span>
          </div>
          {bestDay && bestDay.sales > 0 && (
            <p className="text-xs text-gray-500">
              <span className="font-semibold text-gray-700">Best day:</span> {bestDay.label} ({formatPHP(bestDay.sales)})
            </p>
          )}
        </div>
      </div>

      {/* Trend chart */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <p className="text-sm font-semibold text-gray-700 mb-3">30-Day Performance Trend</p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={trend}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={formatPHPCompact} />
            <Tooltip formatter={v => formatPHP(v)} />
            <Bar dataKey="sales" fill={PRIMARY} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Status + Type breakdowns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <p className="text-sm font-semibold text-gray-700 mb-3">Status Breakdown</p>
          {statusBreakdown.length === 0 ? <p className="text-xs text-gray-400">No data</p> : (
            <div className="flex flex-col gap-2">
              {statusBreakdown.map(s => {
                const pctOfCount = recs.length > 0 ? Math.round((s.count / recs.length) * 100) : 0
                return (
                  <button key={s.status}
                          onClick={() => setStatusFilter(s.status)}
                          className="text-left">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-medium text-gray-900">{s.status}</span>
                      <span className="text-gray-500"><b>{s.count}</b> · {formatPHPCompact(s.revenue)} · {pctOfCount}%</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pctOfCount}%`, backgroundColor: PRIMARY }} />
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <p className="text-sm font-semibold text-gray-700 mb-3">Transaction Type Breakdown</p>
          {typeBreakdown.length === 0 ? <p className="text-xs text-gray-400">No data</p> : (
            <div className="flex flex-col gap-2">
              {typeBreakdown.map((t, i) => {
                const pctOfRev = agent.sales > 0 ? Math.round((t.revenue / agent.sales) * 100) : 0
                return (
                  <button key={t.type}
                          onClick={() => setTypeFilter(t.type)}
                          className="text-left">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-medium text-gray-900">{t.type}</span>
                      <span className="text-gray-500"><b>{t.count}</b> · {formatPHPCompact(t.revenue)} · {pctOfRev}%</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                           style={{ width: `${pctOfRev}%`, backgroundColor: PALETTE[i % PALETTE.length] }} />
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Transactions table with filters + export */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-semibold text-gray-700">Transactions ({recent.length} of {filteredRecs.length})</p>
            <p className="text-[11px] text-gray-500 mt-0.5">Filter + export all {agent.name}'s sales</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select value={periodFilter} onChange={e => setPeriodFilter(e.target.value)}
                    className="px-2 py-1.5 text-xs border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-[#1B4F4F]">
              <option value="all">All time</option>
              <option value="thisweek">This week (Mon–Sun)</option>
              <option value="thismonth">This month</option>
              <option value="last30">Last 30 days</option>
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                    className="px-2 py-1.5 text-xs border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-[#1B4F4F]">
              <option value="all">All statuses</option>
              {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
                    className="px-2 py-1.5 text-xs border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-[#1B4F4F]">
              <option value="all">All types</option>
              {typeOptions.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <button onClick={exportAgentCSV}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white rounded-xl"
                    style={{ backgroundColor: PRIMARY }}>
              <Download size={12} /> Export CSV
            </button>
          </div>
        </div>
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 z-10">
              <tr>
                {['POTB No.', 'Date', 'Status', 'Type', 'Package', 'Travel', 'Sales', 'Profit', 'Cost', 'Payment'].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {recent.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400">No transactions match the filters</td></tr>
              ) : recent.map(r => (
                <tr key={r.transaction_id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-xs font-semibold text-[#1B4F4F] whitespace-nowrap">{r.meta?.gdx ?? '—'}</td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.date}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {r.meta?.status && (
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        /processed|completed|ready/i.test(r.meta.status) ? 'bg-emerald-50 text-emerald-700' :
                        /pending|in progress/i.test(r.meta.status) ? 'bg-amber-50 text-amber-700' :
                                                                       'bg-gray-100 text-gray-600'
                      }`}>{r.meta.status}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap text-xs">{r.meta?.transaction_type || '—'}</td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap text-xs">{r.meta?.type_of_package || '—'}</td>
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap text-xs" title={r.meta?.travel_date}>
                    {r.meta?.duration || '—'}
                  </td>
                  <td className="px-3 py-2 font-semibold text-gray-900 whitespace-nowrap">{formatPHP(r.sales_amount)}</td>
                  <td className="px-3 py-2 text-emerald-700 font-medium whitespace-nowrap">{r.profit == null ? <span className="text-gray-300" title="Walang encoded cost pa sa Fusioo">—</span> : formatPHPCompact(r.profit)}</td>
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{r.cost == null ? <span className="text-gray-300" title="Walang encoded cost pa sa Fusioo">—</span> : formatPHPCompact(r.cost)}</td>
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap text-xs">{r.meta?.payment_type || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main view

export default function AccountOfficersTab() {
  const [periodId, setPeriodId] = useState('month')
  const [monthKey, setMonthKey] = useState(null)  // null = auto (latest month with data)
  const [customDates, setCustomDates] = useState([])  // YYYY-MM-DD[] when periodId === 'custom'
  const [search, setSearch] = useState('')
  const [filterUnassigned, setFilterUnassigned] = useState(true)
  const [filterCluster, setFilterCluster] = useState('all') // cluster name or 'all'
  const [filterTier, setFilterTier] = useState('all')        // 'Top Performer' | 'Strong' | 'Average' | 'Needs Coaching' | 'all'
  const [filterDivision, setFilterDivision] = useState('all') // 'all' | 'domestic' | 'international'
  const [selectedAgent, setSelectedAgent] = useState(null)

  // --- Fusioo data fetch (primary source for agent attribution) ---
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [lastFetched, setLastFetched] = useState(null)

  const load = async ({ background } = {}) => {
    if (background) setRefreshing(true)
    try {
      const raw = await fetchAllBookingTransactions()
      const mapped = raw.map(mapBookingTransaction).filter(r => r.date)
      setRecords(mapped)
      setError(null)
      setLastFetched(new Date())
    } catch (e) {
      setError(e)
    } finally {
      if (background) setRefreshing(false)
      else setLoading(false)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load({ background: false })
    const id = setInterval(() => load({ background: true }), 60_000)
    return () => clearInterval(id)
  }, [])

  const isCustom = periodId === 'custom' && customDates.length > 0
  const customSet = new Set(customDates)
  // Auto-default the month to the latest one with data (avoids empty current month)
  const effMonthKey = monthKey || latestMonthKey(records.map(r => r.date)) || currentMonthKey()
  const periodLabel = isCustom
    ? (customDates.length === 1 ? 'Custom day' : `${customDates.length} custom days`)
    : periodLabelFor(periodId, effMonthKey)

  if (loading) return <div className="text-center py-12 text-gray-400">Loading Booking Transactions from Fusioo…</div>
  if (error)   return <div className="text-center py-12 text-red-500">{error.message}</div>

  // Period filter. Prior = same-length window immediately before the current
  // one. Custom = exactly the picked days; no meaningful prior window.
  const { start, end } = periodRange(periodId, effMonthKey)
  const lenMs = Math.max(86400000, end.getTime() - start.getTime())
  const priorStart = isCustom ? null : new Date(start.getTime() - lenMs - 1)
  const priorEnd   = isCustom ? null : new Date(start.getTime() - 1)
  const rangedRaw = isCustom
    ? records.filter(r => customSet.has(recDayKey(r.date)))
    : filterByRange(records, start, end)
  const priorRangedRaw = isCustom
    ? []
    : (priorStart && priorEnd) ? filterByRange(records, priorStart, priorEnd) : []

  // Domestic vs International — derived from team name. "POTB International"
  // = international; everything else (e.g. "POTB Domestic") = domestic.
  const isInternational = (team) => /international/i.test(team || '')
  const matchesDivision = (r) => {
    if (filterDivision === 'all') return true
    if (filterDivision === 'international') return isInternational(r.team)
    return !isInternational(r.team) // domestic
  }
  const ranged = rangedRaw.filter(matchesDivision)
  const priorRanged = priorRangedRaw.filter(matchesDivision)

  // Compute Domestic + International breakdowns (always vs ALL, ignoring division filter)
  const domesticRecs    = rangedRaw.filter(r => !isInternational(r.team))
  const internationalRecs = rangedRaw.filter(r =>  isInternational(r.team))
  const breakdown = {
    domestic: {
      revenue: domesticRecs.reduce((s, r) => s + (r.sales_amount || 0), 0),
      deals:   domesticRecs.length,
      agents:  new Set(domesticRecs.map(r => r.sales_agent)).size,
    },
    international: {
      revenue: internationalRecs.reduce((s, r) => s + (r.sales_amount || 0), 0),
      deals:   internationalRecs.length,
      agents:  new Set(internationalRecs.map(r => r.sales_agent)).size,
    },
  }

  // Per-agent totals. An officer's displayed cluster = their DOMINANT team
  // across ALL history (hybrid model: they can cross-sell, but their "home"
  // team is where most of their bookings sit). Computing it over the full
  // record set — not the period — keeps it stable (e.g. Mike Jomel stays
  // International even in a month where his lone Domestic deal would tie).
  const globalTeamByName = Object.fromEntries(totalsByAgent(records).map(a => [a.name, a.team]))
  const allAgents = totalsByAgent(ranged).map(a => ({
    ...a,
    periodTeam: a.team,
    team: globalTeamByName[a.name] || a.team,
  }))
  const priorAgents = totalsByAgent(priorRanged)
  const priorByName = Object.fromEntries(priorAgents.map(a => [a.name, a]))

  // Available clusters for the dropdown filter (plain compute — not memoized
  // because this component has early returns; hooks must be unconditional)
  const clusterOptions = Array.from(new Set(allAgents.map(a => a.team))).filter(Boolean).sort()

  // Compute team avg first (needed for tier filter)
  const _realAgentsForAvg = allAgents.filter(a => a.name !== 'Unassigned')
  const _teamAvgRevenue   = _realAgentsForAvg.length > 0
    ? _realAgentsForAvg.reduce((s, a) => s + a.sales, 0) / _realAgentsForAvg.length
    : 0

  // Apply filters
  const filteredAgents = allAgents
    .filter(a => !filterUnassigned || a.name !== 'Unassigned')
    .filter(a => filterCluster === 'all' || a.team === filterCluster)
    .filter(a => filterTier === 'all' || tierFor(a, _teamAvgRevenue).label === filterTier)
    .filter(a => !search || a.name.toLowerCase().includes(search.toLowerCase()) || a.team.toLowerCase().includes(search.toLowerCase()))

  // Compute team average revenue (excluding unassigned) for tier classification
  const realAgents = allAgents.filter(a => a.name !== 'Unassigned')
  const teamAvgRevenue = realAgents.length > 0
    ? realAgents.reduce((s, a) => s + a.sales, 0) / realAgents.length
    : 0

  // Company snapshot
  const companyRevenue = sum(ranged, 'sales_amount')            // actual CASH collected (Amount Paid)
  const companySRP     = sum(ranged, 'srp')                     // total package value (revenue)
  const companyProfit  = ranged.reduce((s, r) => s + (r.profit || 0), 0)  // encoded-cost only (null skipped)
  const companyAR      = ranged.reduce((s, r) => s + (r.receivable || 0), 0)
  const profitEncodedCount = ranged.filter(r => r.costEncoded).length
  const companyDeals = ranged.length
  const companyAvgDeal = companyDeals > 0 ? companyRevenue / companyDeals : 0
  const priorRevenue = sum(priorRanged, 'sales_amount')
  const revenueDelta = priorRevenue === 0 ? null : Math.round(((companyRevenue - priorRevenue) / priorRevenue) * 100)
  const topAgent = filteredAgents[0]
  const teams = totalsByTeam(ranged)
  const topTeam = teams[0]

  // Unassigned share
  const unassignedRevenue = (allAgents.find(a => a.name === 'Unassigned')?.sales) || 0
  const unassignedPct = companyRevenue > 0 ? Math.round((unassignedRevenue / companyRevenue) * 100) : 0

  // --- Coaching priorities ---
  const coachingPriorities = []
  for (const agent of realAgents) {
    const prior = priorByName[agent.name]
    // Declining
    if (prior && prior.sales > 0) {
      const delta = ((agent.sales - prior.sales) / prior.sales) * 100
      if (delta <= -30) {
        coachingPriorities.push({
          agent: agent.name,
          reason: `Revenue dropped ${Math.round(delta)}% vs prior ${periodLabel.toLowerCase()} (${formatPHPCompact(prior.sales)} → ${formatPHPCompact(agent.sales)})`,
          tone: 'warn',
        })
      }
    }
    // No deals this period
    if (agent.txnCount === 0) {
      coachingPriorities.push({
        agent: agent.name,
        reason: `No deals closed this ${periodLabel.toLowerCase()}. Schedule a 1:1 to identify blockers.`,
        tone: 'warn',
      })
    }
    // Very low avg deal size vs team
    if (agent.txnCount > 0 && teamAvgRevenue > 0) {
      const agentAvg = agent.sales / agent.txnCount
      const teamAvgPerDeal = realAgents.reduce((s, a) => s + (a.txnCount > 0 ? a.sales / a.txnCount : 0), 0) / Math.max(1, realAgents.filter(a => a.txnCount > 0).length)
      if (agentAvg < teamAvgPerDeal * 0.5 && teamAvgPerDeal > 0) {
        coachingPriorities.push({
          agent: agent.name,
          reason: `Avg deal size ${formatPHPCompact(agentAvg)} is well below team avg ${formatPHPCompact(teamAvgPerDeal)}. Focus: upsell training.`,
          tone: 'info',
        })
      }
    }
  }
  // Spotlight: top performer to celebrate
  if (topAgent && topAgent.sales > teamAvgRevenue * 1.5 && topAgent.name !== 'Unassigned') {
    coachingPriorities.unshift({
      agent: topAgent.name,
      reason: `Top performer this ${periodLabel.toLowerCase()} (${formatPHP(topAgent.sales)}). Consider asking them to share their playbook with the team.`,
      tone: 'good',
    })
  }

  // ----- Drill-down view ----------------------------------------------------
  if (selectedAgent) {
    return <AgentDetail agent={selectedAgent} allRecords={records} teamAvgRevenue={teamAvgRevenue} onBack={() => setSelectedAgent(null)} />
  }

  return (
    <div className="flex flex-col gap-5 pb-24 sm:pb-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Briefcase size={20} style={{ color: PRIMARY }} />
            Account Officers
          </h1>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <p className="text-sm text-gray-500">Booking sales ng mga naging travel agency · {filteredAgents.length} agent{filteredAgents.length === 1 ? '' : 's'}</p>
            <LiveIndicator lastFetched={lastFetched} refreshing={refreshing} onRefresh={() => load({ background: true })} label="Fusioo" />
          </div>
        </div>
        <div className="flex flex-col gap-2 items-end">
          <PeriodBar
            periodId={periodId} onPeriod={setPeriodId}
            monthKey={effMonthKey} onMonth={setMonthKey}
            customDates={customDates} isCustom={isCustom}
            onApplyCustom={(dates) => { setCustomDates(dates); setPeriodId('custom') }}
          />
          {/* Division quick-filter (Domestic / International) */}
          <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
            {[
              { id: 'all',           label: 'All Divisions' },
              { id: 'domestic',      label: '🇵🇭 Domestic' },
              { id: 'international', label: '🌏 International' },
            ].map(d => (
              <button key={d.id} onClick={() => setFilterDivision(d.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                        filterDivision === d.id ? 'bg-white text-[#1B4F4F] shadow-sm font-semibold' : 'text-gray-500 hover:text-gray-700'
                      }`}>
                {d.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Hero band — instant read on officer/company performance */}
      <HeroBand
        label={`Cash Collected · ${periodLabel}`}
        value={formatPHP(companyRevenue)}
        delta={revenueDelta}
        sub={`actual na natanggap na pera · ${companyDeals} deals${companyAR > 0 ? ` · AR ${formatPHPCompact(companyAR)} to collect` : ''}`}
        stats={[
          { label: 'Revenue (SRP)', value: formatPHPCompact(companySRP) },
          { label: 'Profit', value: profitEncodedCount > 0 ? formatPHPCompact(companyProfit) : '—' },
          { label: 'AR (sisingilin)', value: formatPHPCompact(companyAR) },
          { label: 'Deals', value: String(companyDeals) },
        ]}
      />

      {/* Company snapshot */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
          <Sparkles size={14} className="text-amber-500" /> Company Overview · {periodLabel}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          <StatCard icon={TrendingUp} label="Cash Collected"
                    value={formatPHPCompact(companyRevenue)}
                    sub={revenueDelta === null ? `actual na pera · ${companyDeals} deals` : `${revenueDelta >= 0 ? '+' : ''}${revenueDelta}% vs prior · actual na pera`} />
          <StatCard icon={Target}     label="Revenue (SRP)" value={formatPHPCompact(companySRP)} sub="total package value" />
          <StatCard icon={Award}      label="Profit"
                    value={profitEncodedCount > 0 ? formatPHPCompact(companyProfit) : '—'}
                    sub={profitEncodedCount < companyDeals ? `${profitEncodedCount}/${companyDeals} may cost pa lang` : 'revenue − cost'}
                    accent="#E8F4F4" />
          <StatCard icon={Wallet}     label="Accounts Receivable" value={formatPHPCompact(companyAR)} sub="balance na sisingilin" accent="#FFF4E0" />
          <StatCard icon={Briefcase}  label="Total Deals" value={String(companyDeals)} sub={`${realAgents.length} agents active`} />
          <StatCard icon={Target}     label="Avg Deal Size" value={formatPHPCompact(companyAvgDeal)} sub="per closed sale" accent="#FFF4E0" />
          <button type="button"
                  onClick={() => topAgent && topAgent.name !== 'Unassigned' && setSelectedAgent(topAgent)}
                  className="text-left bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-col gap-2 hover:border-[#1B4F4F] hover:shadow transition-all">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#FFF4E0' }}>
              <Award size={16} style={{ color: PRIMARY }} />
            </div>
            <p className="text-xl font-bold text-gray-900 truncate">{topAgent ? (topAgent.name === 'Unassigned' ? '⚠ Unassigned' : topAgent.name.split(' ')[0]) : '—'}</p>
            <p className="text-xs text-gray-500 leading-tight">Top Officer <span className="text-[10px] text-[#1B4F4F]">· click for details</span></p>
            {topAgent && <p className="text-[11px] text-gray-400 leading-tight">{formatPHPCompact(topAgent.sales)} · {topAgent.txnCount} deals</p>}
          </button>
          <button type="button"
                  onClick={() => topTeam && setFilterCluster(topTeam.name)}
                  className="text-left bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-col gap-2 hover:border-[#1B4F4F] hover:shadow transition-all">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#E8F4F4' }}>
              <Users size={16} style={{ color: PRIMARY }} />
            </div>
            <p className="text-xl font-bold text-gray-900 truncate">{topTeam?.name || '—'}</p>
            <p className="text-xs text-gray-500 leading-tight">Top Cluster <span className="text-[10px] text-[#1B4F4F]">· click to filter</span></p>
            {topTeam && <p className="text-[11px] text-gray-400 leading-tight">{formatPHPCompact(topTeam.sales)} · {topTeam.agents?.length || topTeam.agentCount || 0} agents</p>}
          </button>
          <StatCard icon={AlertCircle} label="Unassigned Sales"
                    value={`${unassignedPct}%`}
                    sub={`${formatPHPCompact(unassignedRevenue)} not yet attributed`}
                    accent={unassignedPct > 50 ? '#fee2e2' : '#fef3c7'} />
        </div>
      </section>

      {/* Domestic vs International side-by-side breakdown */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
          <Users size={14} style={{ color: PRIMARY }} /> Sales by Division · {periodLabel}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button type="button"
                  onClick={() => setFilterDivision(filterDivision === 'domestic' ? 'all' : 'domestic')}
                  className={`text-left bg-white rounded-2xl p-4 shadow-sm border-2 transition-all ${
                    filterDivision === 'domestic' ? 'border-[#1B4F4F]' : 'border-gray-100 hover:border-[#1B4F4F]/30'
                  }`}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-1.5">
                🇵🇭 Domestic
              </p>
              {filterDivision === 'domestic' && <span className="text-[10px] font-bold text-[#1B4F4F]">FILTERED</span>}
            </div>
            <p className="text-2xl font-bold text-gray-900">{formatPHP(breakdown.domestic.revenue)}</p>
            <p className="text-xs text-gray-500 mt-1">
              <b>{breakdown.domestic.deals}</b> deals · <b>{breakdown.domestic.agents}</b> agent{breakdown.domestic.agents === 1 ? '' : 's'}
              {breakdown.domestic.deals > 0 && <> · avg {formatPHPCompact(breakdown.domestic.revenue / breakdown.domestic.deals)}</>}
            </p>
            <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{
                width: `${(breakdown.domestic.revenue / Math.max(1, breakdown.domestic.revenue + breakdown.international.revenue)) * 100}%`,
                backgroundColor: PRIMARY,
              }} />
            </div>
            <p className="text-[10px] text-gray-400 mt-1">
              {Math.round((breakdown.domestic.revenue / Math.max(1, breakdown.domestic.revenue + breakdown.international.revenue)) * 100)}% of company revenue
            </p>
            <p className="text-[10px] text-[#1B4F4F] mt-2 font-semibold">
              {filterDivision === 'domestic' ? '← Click to clear filter' : 'Click to filter →'}
            </p>
          </button>
          <button type="button"
                  onClick={() => setFilterDivision(filterDivision === 'international' ? 'all' : 'international')}
                  className={`text-left bg-white rounded-2xl p-4 shadow-sm border-2 transition-all ${
                    filterDivision === 'international' ? 'border-[#F5A623]' : 'border-gray-100 hover:border-[#F5A623]/50'
                  }`}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-1.5">
                🌏 International
              </p>
              {filterDivision === 'international' && <span className="text-[10px] font-bold text-[#F5A623]">FILTERED</span>}
            </div>
            <p className="text-2xl font-bold text-gray-900">{formatPHP(breakdown.international.revenue)}</p>
            <p className="text-xs text-gray-500 mt-1">
              <b>{breakdown.international.deals}</b> deals · <b>{breakdown.international.agents}</b> agent{breakdown.international.agents === 1 ? '' : 's'}
              {breakdown.international.deals > 0 && <> · avg {formatPHPCompact(breakdown.international.revenue / breakdown.international.deals)}</>}
            </p>
            <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{
                width: `${(breakdown.international.revenue / Math.max(1, breakdown.domestic.revenue + breakdown.international.revenue)) * 100}%`,
                backgroundColor: ACCENT,
              }} />
            </div>
            <p className="text-[10px] text-gray-400 mt-1">
              {Math.round((breakdown.international.revenue / Math.max(1, breakdown.domestic.revenue + breakdown.international.revenue)) * 100)}% of company revenue
            </p>
            <p className="text-[10px] text-[#F5A623] mt-2 font-semibold">
              {filterDivision === 'international' ? '← Click to clear filter' : 'Click to filter →'}
            </p>
          </button>
        </div>
      </section>

      {/* Revenue trend bar chart — Week/Month/Year comparison across all data */}
      <RevenueTrend records={records} />

      {/* Coaching priorities */}
      {coachingPriorities.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
            <GraduationCap size={14} className="text-amber-500" /> Coaching Priorities
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {coachingPriorities.slice(0, 6).map((p, i) => (
              <CoachingPriorityCard key={i} agent={p.agent} reason={p.reason} tone={p.tone} />
            ))}
          </div>
        </section>
      )}

      {/* Performance leaderboard */}
      <section>
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div>
            <h2 className="text-base font-semibold text-gray-800">Performance Leaderboard</h2>
            {(filterCluster !== 'all' || filterTier !== 'all') && (
              <p className="text-[11px] text-gray-500 mt-0.5">
                Filtered: {filterCluster !== 'all' && <span className="font-semibold">{filterCluster}</span>}
                {filterCluster !== 'all' && filterTier !== 'all' && ' · '}
                {filterTier !== 'all' && <span className="font-semibold">{filterTier}</span>}
                <button onClick={() => { setFilterCluster('all'); setFilterTier('all') }}
                        className="ml-2 text-[#1B4F4F] underline">clear</button>
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="flex items-center gap-1.5 text-xs text-gray-600">
              <input type="checkbox" checked={filterUnassigned} onChange={e => setFilterUnassigned(e.target.checked)} className="rounded" />
              Hide unassigned
            </label>
            <select value={filterCluster} onChange={e => setFilterCluster(e.target.value)}
                    className="px-2 py-1.5 text-xs border border-gray-200 rounded-xl focus:outline-none focus:border-[#1B4F4F] bg-white">
              <option value="all">All clusters</option>
              {clusterOptions.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={filterTier} onChange={e => setFilterTier(e.target.value)}
                    className="px-2 py-1.5 text-xs border border-gray-200 rounded-xl focus:outline-none focus:border-[#1B4F4F] bg-white">
              <option value="all">All tiers</option>
              <option value="Top Performer">🏆 Top Performer</option>
              <option value="Strong">🔥 Strong</option>
              <option value="Average">📊 Average</option>
              <option value="Needs Coaching">🎓 Needs Coaching</option>
            </select>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search agent or cluster…"
                     className="pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-xl focus:outline-none focus:border-[#1B4F4F]" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['#', 'Officer', 'Cluster', 'Revenue', 'Deals', 'Avg Deal', 'Sign-ups', 'Tier', 'vs Prior', ''].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredAgents.length === 0 ? (
                  <tr><td colSpan={10} className="px-4 py-12 text-center text-gray-400">No agents match the filters</td></tr>
                ) : filteredAgents.map((a, i) => {
                  const tier = tierFor(a, teamAvgRevenue)
                  const prior = priorByName[a.name]
                  const delta = prior && prior.sales > 0 ? Math.round(((a.sales - prior.sales) / prior.sales) * 100) : null
                  const avgDeal = a.txnCount > 0 ? a.sales / a.txnCount : 0
                  return (
                    <tr key={a.name} onClick={() => setSelectedAgent(a)} className="cursor-pointer hover:bg-gray-50 transition-colors">
                      <td className="px-3 py-2.5">
                        <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${
                          i === 0 ? 'bg-amber-100 text-amber-700' :
                          i === 1 ? 'bg-gray-200 text-gray-700' :
                          i === 2 ? 'bg-orange-100 text-orange-700' :
                                    'bg-gray-100 text-gray-500'
                        }`}>{i + 1}</span>
                      </td>
                      <td className="px-3 py-2.5 font-medium text-gray-900 whitespace-nowrap">{a.name}</td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center gap-1 whitespace-nowrap">
                          <button
                            onClick={(e) => { e.stopPropagation(); setFilterCluster(a.team) }}
                            title={`Filter to ${a.team}`}
                            className="px-2 py-0.5 bg-teal-50 text-teal-700 rounded-md text-[11px] hover:bg-teal-100 transition-colors"
                          >{a.team}</button>
                          {a.crossTeam && (
                            <span
                              className="text-[10px] text-amber-600 cursor-help"
                              title={`Cross-sell this period: ${(a.teamMix || []).map(m => `${m.name} (${m.count})`).join(' · ')}`}
                            >+cross</span>
                          )}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-gray-900">{formatPHP(a.sales)}</td>
                      <td className="px-3 py-2.5 text-gray-700">{a.txnCount}</td>
                      <td className="px-3 py-2.5 text-gray-600">{formatPHPCompact(avgDeal)}</td>
                      <td className="px-3 py-2.5 text-gray-600">{a.signups}</td>
                      <td className="px-3 py-2.5">
                        <button
                          onClick={(e) => { e.stopPropagation(); setFilterTier(tier.label) }}
                          title={`Filter to ${tier.label}`}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold hover:opacity-80 transition-opacity ${tier.tone}`}
                        >
                          <tier.Icon size={10} /> {tier.label}
                        </button>
                      </td>
                      <td className="px-3 py-2.5">
                        {delta === null ? (
                          <span className="text-gray-400 text-xs">—</span>
                        ) : (
                          <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${
                            delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-red-600' : 'text-gray-500'
                          }`}>
                            {delta > 0 ? <TrendingUp size={11}/> : delta < 0 ? <TrendingDown size={11}/> : null}
                            {delta > 0 ? '+' : ''}{delta}%
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5"><ChevronRight size={14} className="text-gray-400" /></td>
                    </tr>
                  )
                })}
              </tbody>
              {filteredAgents.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-gray-200 font-bold">
                    <td className="px-3 py-2.5 text-gray-700" colSpan={3}>Team total · {filteredAgents.length} officers</td>
                    <td className="px-3 py-2.5 text-gray-900">{formatPHP(filteredAgents.reduce((s, a) => s + a.sales, 0))}</td>
                    <td className="px-3 py-2.5 text-gray-900">{filteredAgents.reduce((s, a) => s + a.txnCount, 0)}</td>
                    <td className="px-3 py-2.5"></td>
                    <td className="px-3 py-2.5 text-gray-900">{filteredAgents.reduce((s, a) => s + a.signups, 0)}</td>
                    <td className="px-3 py-2.5" colSpan={3}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </section>

      {/* Down Payments & Accounts Receivable — per agent */}
      <OfficerReceivables records={ranged} periodLabel={periodLabel} />

      {/* Data source note */}
      <section className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex items-start gap-2.5 text-sm text-emerald-900">
        <Sparkles size={16} className="mt-0.5 flex-shrink-0" />
        <div className="min-w-0">
          <p className="font-semibold">Data source · Fusioo Booking Transactions ({records.length} records loaded)</p>
          <p className="text-xs mt-1 text-emerald-800/90">
            Each transaction has proper <code className="px-1 bg-emerald-100 rounded">agent_name</code> + <code className="px-1 bg-emerald-100 rounded">team_name</code> attribution.
            Token valid until ~2036. Polls every 60s.
          </p>
        </div>
      </section>
    </div>
  )
}
