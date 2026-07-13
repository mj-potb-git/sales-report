import { useState, useMemo, useEffect } from 'react'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import {
  TrendingUp, Users, Award, Target,
  ChevronRight, ArrowLeft, Search, ChevronUp, ChevronDown,
} from 'lucide-react'
import useSalesData from '../hooks/useSalesData'
import useYcbmData from '../hooks/useYcbmData'
import LiveIndicator from './LiveIndicator'
import SalesReportPanel from './sales/SalesReportPanel'
import TodaySnapshot from './sales/TodaySnapshot'
import TargetProgress from './sales/TargetProgress'
import SmartInsights from './sales/SmartInsights'
import FunnelHealth from './sales/FunnelHealth'
import PackagePerformance from './sales/PackagePerformance'
import LiveActivityFeed from './sales/LiveActivityFeed'
import ClusterHealth from './sales/ClusterHealth'
import DeltaBadge from './sales/DeltaBadge'
import SalesBreakdown from './sales/SalesBreakdown'
import NeedsReview from './sales/NeedsReview'
import PeriodBar from './PeriodBar'
import HeroBand from './ui/HeroBand'
import DataSourceBanner from './ui/DataSourceBanner'
import RevenueTrend from './RevenueTrend'
import SalesPerformanceCards from './SalesPerformanceCards'
import DownPaymentsTracker from './DownPaymentsTracker'
import UnassignedSales from './UnassignedSales'
import { mergeWithReport, subscribeReport, isOrientation } from '../lib/ycbmReport'
import { periodRange, periodLabelFor, currentMonthKey, latestMonthKey } from '../lib/periods'
import { packageFullPrice } from '../api/lakbayhub'
import { comparePeriods } from '../api/lakbay'
import {
  filterByRange, rangeFor, sum, totalsByAgent, totalsByTeam,
  dailyTrend, formatPHP, formatPHPCompact, getSalesSource, getReviewRecords, getInvoiceCustomers,
} from '../api/lakbay'

const PRIMARY = '#1B4F4F'
const ACCENT  = '#F5A623'
const PALETTE = [PRIMARY, ACCENT, '#4ECDC4', '#7FB069', '#C26DBC', '#6D9EEB']


// ---------------------------------------------------------------------------

function SummaryCard({ icon: Icon, label, value, sub, accent }) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center"
             style={{ backgroundColor: accent || '#E8F4F4' }}>
          <Icon size={18} style={{ color: PRIMARY }} />
        </div>
      </div>
      <div>
        <p className="text-xl font-bold text-gray-900 truncate">{value}</p>
        <p className="text-xs text-gray-500 mt-0.5">{label}</p>
        {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Agent detail view — scoped to the SAME period/custom filter as the list, so
// clicking a coach shows exactly the sales they made in that window (for
// cross-checking against the manual tracker).
function AgentDetail({ agent, allRecords, customers = [], periodId, monthKey, customDates = [], onBack }) {
  const isCustom = periodId === 'custom' && customDates.length > 0
  const fromKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d) }
  let start, end, periodLabel
  if (isCustom) {
    const s = [...customDates].sort()
    start = fromKey(s[0]); start.setHours(0, 0, 0, 0)
    end = fromKey(s[s.length - 1]); end.setHours(23, 59, 59, 999)
    periodLabel = customDates.length === 1 ? '1 custom day' : `${customDates.length} custom days`
  } else {
    const base = periodRange(periodId, monthKey); start = base.start; end = base.end
    periodLabel = periodLabelFor(periodId, monthKey)
  }
  const customSet = new Set(customDates)
  const filtered = allRecords
    .filter(r => r.sales_agent === agent.name && r.date)
    .filter(r => {
      const t = new Date(r.date).getTime()
      if (t < start.getTime() || t > end.getTime()) return false
      return !isCustom || customSet.has(r.date)
    })
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))

  const totalSales = sum(filtered, 'sales_amount')
  const fmtDate = (d) => d ? new Date(d + (String(d).length <= 10 ? 'T00:00:00' : '')).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
  // Real payment type from the invoice (not a paid-vs-full guess).
  const payType = (r) => {
    switch (r.meta?.payment_type) {
      case 'down_payment': return { t: 'Down Payment', cls: 'bg-amber-100 text-amber-700' }
      case 'balance':      return { t: 'Balance',      cls: 'bg-blue-100 text-blue-700' }
      case 'full':         return { t: 'Full',         cls: 'bg-emerald-100 text-emerald-700' }
      default:             return null
    }
  }
  // This coach's members with their full payment history (all-time, so the DP
  // and the balance show even if they landed in different months).
  const coachCustomers = customers
    .filter(c => c.coach === agent.name)
    .sort((a, b) => String(b.dpDate || b.fullPaymentDate || '').localeCompare(String(a.dpDate || a.fullPaymentDate || '')))
  // Some individual invoices come from LakbayHub with a blank package (e.g. a
  // balance invoice). Fall back to the member's resolved package (from their
  // other invoices) so the row shows "Adventurer" instead of "—".
  const pkgByEmail = new Map(customers.map(c => [(c.email || '').toLowerCase(), c.package]))
  const pkgFor = (r) => {
    const p = (r.meta?.package || '').replace(/\s*package\s*/i, '').trim()
    if (p) return p
    const fb = pkgByEmail.get((r.meta?.email || '').toLowerCase()) || ''
    return fb.replace(/\s*package\s*/i, '').trim() || '—'
  }

  return (
    <div className="flex flex-col gap-4 pb-24 sm:pb-6">
      <button onClick={onBack}
        className="self-start flex items-center gap-1 text-sm text-gray-500 hover:text-[#1B4F4F] transition-colors">
        <ArrowLeft size={14} /> Back to agents
      </button>

      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-lg font-bold"
               style={{ backgroundColor: PRIMARY }}>
            {agent.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-lg font-bold text-gray-900">{agent.name}</p>
            <p className="text-sm text-gray-500">{agent.team}</p>
          </div>
          <span className="ml-auto text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">{periodLabel}</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-5">
          <SummaryCard icon={TrendingUp} label={`Sales · ${periodLabel}`} value={formatPHP(totalSales)} />
          <SummaryCard icon={Users}      label="Transactions"             value={String(filtered.length)} />
          <SummaryCard icon={Users}      label="Sign-ups"                 value={String(sum(filtered, 'signup_count'))} />
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-700">Sales ({filtered.length}) · {periodLabel}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">All of {agent.name}'s sales in the selected filter — cross-check vs your manual.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                {['Date', 'Customer', 'Package', 'Payment', 'Amount'].map(h => (
                  <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No sales in the selected filter.</td></tr>
              ) : filtered.map(r => {
                const pt = payType(r)
                return (
                  <tr key={r.transaction_id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-600 whitespace-nowrap">{fmtDate(r.date)}</td>
                    <td className="px-4 py-2 text-gray-800">{r.customer_name}</td>
                    <td className="px-4 py-2 text-gray-500">{pkgFor(r)}</td>
                    <td className="px-4 py-2">{pt ? <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${pt.cls}`}>{pt.t}</span> : '—'}</td>
                    <td className="px-4 py-2 font-semibold text-gray-900 whitespace-nowrap">{formatPHP(r.sales_amount)}</td>
                  </tr>
                )
              })}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td className="px-4 py-2.5 font-semibold text-gray-700" colSpan={4}>TOTAL ({filtered.length} payments)</td>
                  <td className="px-4 py-2.5 font-bold whitespace-nowrap" style={{ color: PRIMARY }}>{formatPHP(totalSales)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Payment history by customer — all-time, so a Down Payment in one month
          and the balance in another both show, with the exact dates MJ wants. */}
      {coachCustomers.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-700">Payment history by customer ({coachCustomers.length})</p>
            <p className="text-[11px] text-gray-400 mt-0.5">All-time — kung may DP muna, makikita kung kailan nag-DP at kailan nag-full payment.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  {['Customer', 'Package', 'Payment path', 'DP date', 'Full-payment date', 'Total paid'].map(h => (
                    <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {coachCustomers.map(c => (
                  <tr key={c.key} className="hover:bg-gray-50 align-top">
                    <td className="px-4 py-2.5 text-gray-800">{c.customer_name}</td>
                    <td className="px-4 py-2.5 text-gray-500">{(c.package || '').replace(/\s*package\s*/i, '').trim() || '—'}</td>
                    <td className="px-4 py-2.5">
                      {c.hadDownPayment
                        ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-700">Had a DP{!c.isFullyPaid ? ' · balance pending' : ''}</span>
                        : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-700">Paid in full</span>}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{fmtDate(c.dpDate)}</td>
                    <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{c.isFullyPaid ? fmtDate(c.fullPaymentDate) : <span className="text-amber-600">not yet</span>}</td>
                    <td className="px-4 py-2.5 font-semibold text-gray-900 whitespace-nowrap">{formatPHP(c.totalPaid)}{c.fullPrice ? <span className="text-gray-400 text-xs"> / {formatPHP(c.fullPrice)}</span> : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Team detail view
function TeamDetail({ team, allRecords, onBack, onAgentClick }) {
  const today = new Date()
  const recs = allRecords.filter(r => r.team === team.name)
  const daily   = filterByRange(recs, rangeFor('daily',   today).start, rangeFor('daily',   today).end)
  const weekly  = filterByRange(recs, rangeFor('weekly',  today).start, rangeFor('weekly',  today).end)
  const monthly = filterByRange(recs, rangeFor('monthly', today).start, rangeFor('monthly', today).end)
  const trend = dailyTrend(recs, 14, today)
  const agentsInTeam = totalsByAgent(monthly)

  return (
    <div className="flex flex-col gap-4">
      <button onClick={onBack}
              className="self-start flex items-center gap-1 text-sm text-gray-500 hover:text-[#1B4F4F] transition-colors">
        <ArrowLeft size={14} /> Back to teams
      </button>

      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <p className="text-lg font-bold text-gray-900">{team.name}</p>
        <p className="text-sm text-gray-500">{agentsInTeam.length} agents</p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          <SummaryCard icon={TrendingUp} label="Daily Sales"   value={formatPHPCompact(sum(daily,   'sales_amount'))} />
          <SummaryCard icon={TrendingUp} label="Weekly Sales"  value={formatPHPCompact(sum(weekly,  'sales_amount'))} sub="Mon–Sun" />
          <SummaryCard icon={TrendingUp} label="Monthly Sales" value={formatPHPCompact(sum(monthly, 'sales_amount'))} />
          <SummaryCard icon={Users}      label="Sign-ups (mo.)" value={String(sum(monthly, 'signup_count'))} />
        </div>
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <p className="text-sm font-semibold text-gray-700 mb-3">14-Day Team Performance</p>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={trend}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={formatPHPCompact} />
            <Tooltip formatter={v => formatPHP(v)} />
            <Line type="monotone" dataKey="sales" stroke={PRIMARY} strokeWidth={2.5}
                  dot={{ r: 3, fill: PRIMARY }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-700">Agent Ranking (This Month)</p>
        </div>
        <div className="divide-y divide-gray-50">
          {agentsInTeam.map((a, i) => (
            <button
              key={a.name}
              onClick={() => onAgentClick(a)}
              className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${
                  i === 0 ? 'bg-amber-100 text-amber-700' :
                  i === 1 ? 'bg-gray-200 text-gray-700' :
                  i === 2 ? 'bg-orange-100 text-orange-700' :
                            'bg-gray-100 text-gray-500'
                }`}>{i + 1}</span>
                <div>
                  <p className="text-sm font-medium text-gray-900">{a.name}</p>
                  <p className="text-xs text-gray-500">{a.signups} sign-ups · {a.txnCount} txns</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-900">{formatPHPCompact(a.sales)}</span>
                <ChevronRight size={14} className="text-gray-400" />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main overview view
function Overview({ records, periodId, monthKey, onPeriod, onMonth, customDates = [], onCustomApply, view, onViewChange,
                    onAgentClick, onTeamClick, search, onSearchChange,
                    lastFetched, refreshing, onRefresh }) {
  const [showMore, setShowMore] = useState(false)  // collapse deep analytics by default
  const today = new Date()
  const isCustom = periodId === 'custom' && customDates.length > 0
  // periodRange() has no 'custom' case — it falls through to TODAY. For a custom
  // selection, derive start/end from the picked days' min→max so the funnel's
  // window filter (and the per-coach cards) actually span the custom range
  // instead of collapsing to today (which made Booked/Show-up read 0).
  const customRange = useMemo(() => {
    if (!isCustom) return null
    const sorted = [...customDates].sort()
    const fromKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d) }
    const s = fromKey(sorted[0]); s.setHours(0, 0, 0, 0)
    const e = fromKey(sorted[sorted.length - 1]); e.setHours(23, 59, 59, 999)
    return { start: s, end: e }
  }, [isCustom, customDates])
  const base = periodRange(periodId, monthKey)
  const start = customRange ? customRange.start : base.start
  const end   = customRange ? customRange.end   : base.end
  const customSet = useMemo(() => new Set(customDates), [customDates])
  const ranged = isCustom
    ? records.filter(r => customSet.has(r.date))
    : filterByRange(records, start, end)
  const periodLabel = isCustom
    ? (customDates.length === 1 ? '1 custom day' : `${customDates.length} custom days`)
    : periodLabelFor(periodId, monthKey)

  const dailyTotal   = sum(filterByRange(records, rangeFor('daily',   today).start, rangeFor('daily',   today).end), 'sales_amount')
  const weeklyTotal  = sum(filterByRange(records, rangeFor('weekly',  today).start, rangeFor('weekly',  today).end), 'sales_amount')
  const monthlyTotal = sum(filterByRange(records, rangeFor('monthly', today).start, rangeFor('monthly', today).end), 'sales_amount')
  const totalSignups = sum(ranged, 'signup_count')

  // Pending/DP: real POTB sign-ups LakbayHub hasn't stamped with a date_paid yet
  // (down payments / awaiting full payment) — excluded from the paid totals, so
  // surfaced separately. Free 2GO accounts (₱0) are not sales, so left out.
  // Pending/DP = members who've paid a partial (down payment) but not the full
  // package yet — a real receivable, computed per-member from their invoices.
  const pendingSignups = getInvoiceCustomers().filter(
    c => c.totalPaid > 0 && !c.isFullyPaid && !/2go|free/i.test(c.cluster || ''),
  ).length

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const byAgent = useMemo(() => totalsByAgent(ranged), [ranged])
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const byTeam  = useMemo(() => totalsByTeam(ranged),  [ranged])
  const topAgent = byAgent[0]
  const topTeam  = byTeam[0]

  const conversionRate = ranged.length === 0
    ? 0
    : Math.round((totalSignups / (ranged.length * 4)) * 100) // assume max 4 signups per txn

  const trend = useMemo(() => dailyTrend(records, 14, today), [records])

  const filteredAgents = byAgent.filter(a =>
    !search || a.name.toLowerCase().includes(search.toLowerCase())
  )
  const filteredTeams = byTeam.filter(t =>
    !search || t.name.toLowerCase().includes(search.toLowerCase())
  )

  const teamPieData = byTeam.map((t, i) => ({
    name: t.name, value: t.sales, color: PALETTE[i % PALETTE.length],
  }))

  // POTB YCBM bookings (shared cache — warmed by App-level useYcbmData) for the
  // sales funnel: Booked (created) → Presented (scheduled) → Showed → Closed.
  const { bookings: ycbmApi, loading: ycbmLoading } = useYcbmData()
  // Merge live API with the accumulated uploaded report (report wins = exact).
  const [repBump, setRepBump] = useState(0)
  useEffect(() => subscribeReport(() => setRepBump(n => n + 1)), [])
  // Coaching only — exclude Welcome Orientation so the funnel + Sales
  // Performance tally with the Bookings tab (which also excludes it).
  const ycbm = useMemo(() => mergeWithReport(ycbmApi, 'acquisition').filter(b => !isOrientation(b)), [ycbmApi, repBump])
  const funnel = useMemo(() => {
    const a = start.getTime(), b = end.getTime()
    const dk = (d) => {
      const x = new Date(d)
      return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
    }
    const inSet = (key) => !isCustom || customSet.has(key)
    const inWin = (t) => t >= a && t <= b
    // Booked = all YCBM appointments scheduled in the period (active, by startsAt)
    const scheduled = ycbm.filter(bk =>
      bk.status !== 'Cancelled' && inWin(new Date(bk.startsAt).getTime()) && inSet(dk(bk.startsAt)))
    // Per MJ's YCBM workflow: no-show is explicitly marked (true), a show is
    // marked "finished". Only noShow===true is reliable → a PAST appointment not
    // flagged no-show was finished = showed. Future unmarked = upcoming (excluded).
    let showed = 0, noShow = 0
    for (const bk of scheduled) {
      if (bk.noShow === true) noShow++
      else if (bk.noShow === false) showed++
      else if (new Date(bk.startsAt).getTime() < today.getTime()) showed++
    }
    const cancelled = ycbm.filter(bk =>
      bk.status === 'Cancelled' && inWin(new Date(bk.startsAt).getTime()) && inSet(dk(bk.startsAt))).length
    const concluded = showed + noShow
    const booked = scheduled.length
    const closed = ranged.length
    return {
      revenue: sum(ranged, 'sales_amount'), closed, booked, cancelled, showed, noShow,
      // Show-up rate vs CONCLUDED appointments (excludes upcoming) → "—" if none done yet.
      showUpRate:  concluded > 0 ? Math.round((showed / concluded) * 100) : null,
      closingRate: showed > 0 ? Math.round((closed / showed) * 100) : null,
    }
  }, [ycbm, ranged, start, end, isCustom, customSet]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col gap-5">
      {/* Header: title + live indicator + period filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-bold text-gray-900">Acquisition</h1>
          <p className="text-xs text-gray-500 -mt-0.5">Sign-up team · mga nagsa-sign up para maging travel agency</p>
          <LiveIndicator
            lastFetched={lastFetched}
            refreshing={refreshing}
            onRefresh={onRefresh}
            label="LakbayHub"
          />
        </div>
        <PeriodBar
          periodId={periodId} onPeriod={onPeriod}
          monthKey={monthKey} onMonth={onMonth}
          customDates={customDates} isCustom={isCustom} onApplyCustom={onCustomApply}
        />
      </div>

      {/* Warn if we're not on live data (e.g. LakbayHub app key missing) */}
      <DataSourceBanner source={getSalesSource()} />

      {/* Hero band — instant read on sales for the selected period */}
      <HeroBand
        label={`Total Sales · ${periodLabel}`}
        value={formatPHP(sum(ranged, 'sales_amount'))}
        sub={`${ranged.length} sales${topAgent ? ` · top closer: ${topAgent.name}` : ''}`}
        stats={[
          { label: '# Sales (paid)', value: String(ranged.length) },
          { label: 'Pending/DP', value: String(pendingSignups) },
          { label: 'Top Closer', value: topAgent ? topAgent.name.split(' ').slice(-1)[0] : '—' },
          { label: 'Conversion', value: `${conversionRate}%` },
          { label: 'Active Closers', value: String(byAgent.length) },
        ]}
      />

      {/* Sales funnel report — Booked → Presented → Showed → Closed */}
      <SalesReportPanel
        title="Acquisition Sales Report"
        periodLabel={periodLabel}
        funnel={funnel}
        loading={ycbmLoading}
        note="Booked/Show-up galing sa POTB YCBM bookings (coaching only, excludes Orientation). Closed/Revenue galing sa LakbayHub sign-up sales."
      />

      {/* Revenue trend (LakbayHub sign-up sales) — Week/Month/Year comparison */}
      <RevenueTrend records={records} />

      {/* Today's live snapshot + monthly target */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TodaySnapshot records={records} />
        <TargetProgress records={records} />
      </div>

      {/* Summary cards with period-over-period comparison */}
      <div>
        <h2 className="text-base font-semibold text-gray-800 mb-3">{periodLabel} Overview</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SummaryCard icon={TrendingUp} label="Total Daily Sales"   value={formatPHPCompact(dailyTotal)} />
          <SummaryCard icon={TrendingUp} label="Total Weekly Sales"  value={formatPHPCompact(weeklyTotal)} sub="Mon–Sun" />
          <SummaryCard icon={TrendingUp} label="Total Monthly Sales" value={formatPHPCompact(monthlyTotal)} />
          <SummaryCard icon={Users}      label="Total Sign-ups"      value={String(totalSignups)} sub={`current ${periodLabel} view`} />
          <SummaryCard icon={Award}      label="Top Agent"           value={topAgent ? topAgent.name.split(' ')[0] : '—'} sub={topAgent ? formatPHPCompact(topAgent.sales) : ''} accent="#FFF4E0" />
          <SummaryCard icon={Award}      label="Top Team"            value={topTeam ? topTeam.name : '—'} sub={topTeam ? formatPHPCompact(topTeam.sales) : ''} accent="#FFF4E0" />
          <SummaryCard icon={Target}     label="Conversion Rate"     value={`${conversionRate}%`} sub="signups / max" />
          <SummaryCard icon={Users}      label="Active Agents"       value={String(byAgent.length)} sub={`${byTeam.length} teams`} />
        </div>
      </div>

      {/* Per-coach Sales Performance — LakbayHub (Availed/SRP) + YCBM
          (Appointment/Show Up/No Show) for the selected period. */}
      <SalesPerformanceCards salesRecords={ranged} bookings={ycbm} from={start} to={end} periodLabel={periodLabel} loading={ycbmLoading} storageKey="acquisition" aliases={{ ANGEL: 'JAS', ANGELYN: 'JAS' }} />

      {/* Detailed sales breakdown — how much each closer/cluster sold this period */}
      <SalesBreakdown records={ranged} periodLabel={periodLabel} />

      {/* Incomplete LakbayHub records (missing date / amount / closer) */}
      <NeedsReview records={getReviewRecords()} />

      <UnassignedSales customers={getInvoiceCustomers()} />

      {/* Down payments tracker — all outstanding partial payments, aged, per coach */}
      <DownPaymentsTracker customers={getInvoiceCustomers()} subtitle="POTB sign-ups (LakbayHub)" />

      {/* Deep analytics — collapsed by default to keep the tab scannable */}
      <button
        onClick={() => setShowMore(s => !s)}
        className="self-center flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-[#1B4F4F] bg-white border border-gray-200 rounded-full px-4 py-2 shadow-sm transition-colors"
        aria-expanded={showMore}
      >
        {showMore ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        {showMore ? 'Hide analytics & charts' : 'Show more analytics & charts'}
      </button>

      {showMore && (<>
      {/* Smart insights */}
      <SmartInsights records={records} />

      {/* Period-vs-prior period comparison strip */}
      {(() => {
        // Prior = same-length window immediately before the current one
        const lenMs = Math.max(86400000, end.getTime() - start.getTime())
        const priorEnd = new Date(start.getTime() - 1)
        const priorStart = new Date(start.getTime() - lenMs - 1)
        const cmp = comparePeriods(records, start, end, priorStart, priorEnd)
        const label = 'prior period'
        return (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-wrap items-center gap-4 text-sm">
            <span className="text-gray-500 font-medium">vs {label}:</span>
            <span className="flex items-center gap-1.5">
              <span className="text-gray-700">Sales</span>
              <DeltaBadge delta={cmp.delta.sales} />
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-gray-700">Sign-ups</span>
              <DeltaBadge delta={cmp.delta.signups} />
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-gray-700">Transactions</span>
              <DeltaBadge delta={cmp.delta.txns} />
            </span>
            <span className="ml-auto text-xs text-gray-400">
              prior: {formatPHPCompact(cmp.prior.sales)} · {cmp.prior.signups} signups
            </span>
          </div>
        )
      })()}

      {/* Charts row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <p className="text-sm font-semibold text-gray-700 mb-3">Daily Sales Trend (14 Days)</p>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={formatPHPCompact} />
              <Tooltip formatter={v => formatPHP(v)} />
              <Line type="monotone" dataKey="sales" stroke={PRIMARY} strokeWidth={2.5}
                    dot={{ r: 3, fill: PRIMARY }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <p className="text-sm font-semibold text-gray-700 mb-3">Team Contribution</p>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={teamPieData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
                {teamPieData.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
              <Tooltip formatter={v => formatPHP(v)} />
              <Legend iconType="circle" iconSize={8}
                      formatter={v => <span style={{ fontSize: 11 }}>{v}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <p className="text-sm font-semibold text-gray-700 mb-3">Sales per Agent ({periodLabel})</p>
        <ResponsiveContainer width="100%" height={Math.max(220, byAgent.length * 28)}>
          <BarChart data={byAgent} layout="vertical" margin={{ left: 30 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={formatPHPCompact} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} />
            <Tooltip formatter={v => formatPHP(v)} />
            <Bar dataKey="sales" fill={PRIMARY} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Funnel + Package Performance + Live Activity (in a 3-column-ish layout).
          Funnel + Packages follow the SELECTED period (ranged) — MJ checks
          Package Performance per month, so it must change with the period. */}
      <FunnelHealth records={ranged} />
      <PackagePerformance records={ranged} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <LiveActivityFeed records={records} limit={10} />
        <ClusterHealth records={records} onTeamClick={onTeamClick} />
      </div>
      </>)}

      {/* Tabs: Agents / Teams — primary drill-down, always visible */}
      <div>
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
            {['agents', 'teams'].map(t => (
              <button
                key={t}
                onClick={() => onViewChange(t)}
                className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all capitalize ${
                  view === t
                    ? 'bg-white text-[#1B4F4F] shadow-sm font-semibold'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="relative flex-1 sm:max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => onSearchChange(e.target.value)}
              placeholder={`Search ${view}…`}
              className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#1B4F4F] transition-colors"
            />
          </div>
        </div>

        {view === 'agents' ? (<>
          {/* Desktop: full leaderboard table */}
          <div className="hidden sm:block bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    {['#', 'Agent', 'Team', 'Sales', 'Sign-ups', 'Txns', ''].map(h => (
                      <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredAgents.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No agents match</td></tr>
                  ) : filteredAgents.map((a, i) => (
                    <tr
                      key={a.name}
                      onClick={() => onAgentClick(a)}
                      className="cursor-pointer hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-4 py-2.5">
                        <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${
                          i === 0 ? 'bg-amber-100 text-amber-700' :
                          i === 1 ? 'bg-gray-200 text-gray-700' :
                          i === 2 ? 'bg-orange-100 text-orange-700' :
                                    'bg-gray-100 text-gray-500'
                        }`}>{i + 1}</span>
                      </td>
                      <td className="px-4 py-2.5 font-medium text-gray-900">{a.name}</td>
                      <td className="px-4 py-2.5 text-gray-500">
                        <span className="px-2 py-0.5 bg-teal-50 text-teal-700 rounded-md text-xs">{a.team}</span>
                      </td>
                      <td className="px-4 py-2.5 font-semibold text-gray-900">{formatPHP(a.sales)}</td>
                      <td className="px-4 py-2.5 text-gray-600">{a.signups}</td>
                      <td className="px-4 py-2.5 text-gray-500">{a.txnCount}</td>
                      <td className="px-4 py-2.5"><ChevronRight size={14} className="text-gray-400" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile: tappable leaderboard cards */}
          <div className="sm:hidden flex flex-col gap-2">
            {filteredAgents.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center text-sm text-gray-400">No agents match</div>
            ) : filteredAgents.map((a, i) => (
              <button
                key={a.name}
                onClick={() => onAgentClick(a)}
                className="w-full text-left bg-white rounded-2xl border border-gray-100 shadow-sm p-3.5 flex items-center gap-3"
              >
                <span className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0 ${
                  i === 0 ? 'bg-amber-100 text-amber-700' :
                  i === 1 ? 'bg-gray-200 text-gray-700' :
                  i === 2 ? 'bg-orange-100 text-orange-700' :
                            'bg-gray-100 text-gray-500'
                }`}>{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-900 truncate">{a.name}</p>
                  <p className="text-xs text-gray-500 truncate">{a.team} · {a.signups} sign-ups · {a.txnCount} txns</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-bold text-gray-900">{formatPHPCompact(a.sales)}</p>
                </div>
                <ChevronRight size={16} className="text-gray-400 flex-shrink-0" />
              </button>
            ))}
          </div>
        </>) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filteredTeams.length === 0 ? (
              <div className="col-span-full text-center py-8 text-gray-400">No teams match</div>
            ) : filteredTeams.map((t, i) => (
              <button
                key={t.name}
                onClick={() => onTeamClick(t)}
                className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-left hover:border-[#1B4F4F] hover:shadow transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${
                        i === 0 ? 'bg-amber-100 text-amber-700' :
                                  'bg-gray-100 text-gray-500'
                      }`}>{i + 1}</span>
                      <p className="font-semibold text-gray-900 truncate">{t.name}</p>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{t.agents.length} agents · {t.signups} sign-ups</p>
                  </div>
                  <ChevronRight size={16} className="text-gray-400 mt-1" />
                </div>
                <p className="text-lg font-bold mt-3" style={{ color: PRIMARY }}>{formatPHP(t.sales)}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

export default function SalesAgentsTab() {
  const { records, loading, refreshing, error, lastFetched, refresh } = useSalesData()
  const [periodId, setPeriodId] = useState('month')
  // null = auto: open on the most recent month that actually has sales
  const [monthKey, setMonthKey] = useState(null)
  const [customDates, setCustomDates] = useState([])  // YYYY-MM-DD[] when periodId === 'custom'
  const [view,   setView]   = useState('agents')
  const [search, setSearch] = useState('')
  const [selectedAgent, setSelectedAgent] = useState(null)
  const [selectedTeam,  setSelectedTeam]  = useState(null)

  if (loading) return <div className="text-center py-8 text-gray-400">Loading sales data…</div>
  if (error)   return <div className="text-center py-8 text-red-500">{error.message}</div>

  const effMonthKeyForDetail = monthKey || latestMonthKey(records.map(r => r.date)) || currentMonthKey()
  if (selectedAgent) {
    return <AgentDetail agent={selectedAgent} allRecords={records} customers={getInvoiceCustomers()}
                        periodId={periodId} monthKey={effMonthKeyForDetail} customDates={customDates}
                        onBack={() => setSelectedAgent(null)} />
  }
  if (selectedTeam) {
    return <TeamDetail team={selectedTeam} allRecords={records}
                       onBack={() => setSelectedTeam(null)}
                       onAgentClick={setSelectedAgent} />
  }

  // Auto-default the month to the latest one with actual sales (so the tab
  // doesn't open empty when the current calendar month has no sign-ups yet).
  const effMonthKey = monthKey || latestMonthKey(records.map(r => r.date)) || currentMonthKey()

  return (
    <div className="pb-24 sm:pb-6">
      <Overview
        records={records}
        periodId={periodId} onPeriod={setPeriodId}
        monthKey={effMonthKey} onMonth={setMonthKey}
        customDates={customDates}
        onCustomApply={(dates) => { setCustomDates(dates); setPeriodId('custom') }}
        view={view} onViewChange={setView}
        search={search} onSearchChange={setSearch}
        onAgentClick={setSelectedAgent}
        onTeamClick={setSelectedTeam}
        lastFetched={lastFetched}
        refreshing={refreshing}
        onRefresh={refresh}
      />
    </div>
  )
}
