import { useState, useMemo } from 'react'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import {
  TrendingUp, Users, Award, Target, RefreshCw,
  ChevronRight, ArrowLeft, Search,
} from 'lucide-react'
import useSalesData from '../hooks/useSalesData'
import LiveIndicator from './LiveIndicator'
import TodaySnapshot from './sales/TodaySnapshot'
import TargetProgress from './sales/TargetProgress'
import SmartInsights from './sales/SmartInsights'
import FunnelHealth from './sales/FunnelHealth'
import PackagePerformance from './sales/PackagePerformance'
import LiveActivityFeed from './sales/LiveActivityFeed'
import ClusterHealth from './sales/ClusterHealth'
import DeltaBadge from './sales/DeltaBadge'
import SalesBreakdown from './sales/SalesBreakdown'
import DateRangePicker from './DateRangePicker'
import { comparePeriods, previousPeriodRange } from '../api/lakbay'
import {
  filterByRange, rangeFor, sum, totalsByAgent, totalsByTeam,
  dailyTrend, formatPHP, formatPHPCompact, startOfDay, startOfWeek, startOfMonth,
} from '../api/lakbay'

const PRIMARY = '#1B4F4F'
const ACCENT  = '#F5A623'
const PALETTE = [PRIMARY, ACCENT, '#4ECDC4', '#7FB069', '#C26DBC', '#6D9EEB']

const PERIODS = [
  { id: 'daily',   label: 'Daily'   },
  { id: 'weekly',  label: 'Weekly'  },
  { id: 'monthly', label: 'Monthly' },
]

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
// Agent detail view
function AgentDetail({ agent, allRecords, onBack }) {
  const today = new Date()
  const ranges = {
    daily:   rangeFor('daily',   today),
    weekly:  rangeFor('weekly',  today),
    monthly: rangeFor('monthly', today),
  }
  const recs = allRecords.filter(r => r.sales_agent === agent.name)
  const daily   = filterByRange(recs, ranges.daily.start,   ranges.daily.end)
  const weekly  = filterByRange(recs, ranges.weekly.start,  ranges.weekly.end)
  const monthly = filterByRange(recs, ranges.monthly.start, ranges.monthly.end)
  const trend = dailyTrend(recs, 14, today)
  const recent = [...recs].sort((a, b) => b.transaction_id.localeCompare(a.transaction_id)).slice(0, 8)

  return (
    <div className="flex flex-col gap-4">
      <button
        onClick={onBack}
        className="self-start flex items-center gap-1 text-sm text-gray-500 hover:text-[#1B4F4F] transition-colors"
      >
        <ArrowLeft size={14} /> Back to agents
      </button>

      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-lg font-bold"
               style={{ backgroundColor: PRIMARY }}>
            {agent.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div>
            <p className="text-lg font-bold text-gray-900">{agent.name}</p>
            <p className="text-sm text-gray-500">{agent.team}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          <SummaryCard icon={TrendingUp} label="Daily Sales"   value={formatPHPCompact(sum(daily,   'sales_amount'))} />
          <SummaryCard icon={TrendingUp} label="Weekly Sales"  value={formatPHPCompact(sum(weekly,  'sales_amount'))} sub="Mon–Sun" />
          <SummaryCard icon={TrendingUp} label="Monthly Sales" value={formatPHPCompact(sum(monthly, 'sales_amount'))} />
          <SummaryCard icon={Users}      label="Total Sign-ups (mo.)" value={String(sum(monthly, 'signup_count'))} />
        </div>
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <p className="text-sm font-semibold text-gray-700 mb-3">14-Day Sales Trend</p>
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
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-700">Recent Transactions</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                {['Txn ID', 'Date', 'Customer', 'Sign-ups', 'Amount'].map(h => (
                  <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {recent.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No transactions</td></tr>
              ) : recent.map(r => (
                <tr key={r.transaction_id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono text-xs text-gray-500">{r.transaction_id}</td>
                  <td className="px-4 py-2 text-gray-600">{r.date}</td>
                  <td className="px-4 py-2 text-gray-800">{r.customer_name}</td>
                  <td className="px-4 py-2 text-gray-600">{r.signup_count}</td>
                  <td className="px-4 py-2 font-semibold text-gray-900">{formatPHP(r.sales_amount)}</td>
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
function Overview({ records, period, onPeriodChange, customDates = [], onCustomApply, view, onViewChange,
                    onAgentClick, onTeamClick, search, onSearchChange,
                    lastFetched, refreshing, onRefresh }) {
  const today = new Date()
  const isCustom = period === 'custom' && customDates.length > 0
  const { start, end } = rangeFor(period, today)
  const customSet = useMemo(() => new Set(customDates), [customDates])
  const ranged = isCustom
    ? records.filter(r => customSet.has(r.date))
    : filterByRange(records, start, end)

  const dailyTotal   = sum(filterByRange(records, rangeFor('daily',   today).start, rangeFor('daily',   today).end), 'sales_amount')
  const weeklyTotal  = sum(filterByRange(records, rangeFor('weekly',  today).start, rangeFor('weekly',  today).end), 'sales_amount')
  const monthlyTotal = sum(filterByRange(records, rangeFor('monthly', today).start, rangeFor('monthly', today).end), 'sales_amount')
  const totalSignups = sum(ranged, 'signup_count')

  const byAgent = useMemo(() => totalsByAgent(ranged), [ranged])
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

  return (
    <div className="flex flex-col gap-5">
      {/* Header: title + live indicator + period filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-bold text-gray-900">Sales Performance</h1>
          <LiveIndicator
            lastFetched={lastFetched}
            refreshing={refreshing}
            onRefresh={onRefresh}
            label="LakbayHub"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
            {PERIODS.map(p => (
              <button
                key={p.id}
                onClick={() => onPeriodChange(p.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  period === p.id
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
            onApply={onCustomApply}
          />
        </div>
      </div>

      {/* Today's live snapshot + monthly target */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TodaySnapshot records={records} />
        <TargetProgress records={records} />
      </div>

      {/* Smart insights */}
      <SmartInsights records={records} />

      {/* Summary cards with period-over-period comparison */}
      <div>
        <h2 className="text-base font-semibold text-gray-800 mb-3 capitalize">{period} Overview</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SummaryCard icon={TrendingUp} label="Total Daily Sales"   value={formatPHPCompact(dailyTotal)} />
          <SummaryCard icon={TrendingUp} label="Total Weekly Sales"  value={formatPHPCompact(weeklyTotal)} sub="Mon–Sun" />
          <SummaryCard icon={TrendingUp} label="Total Monthly Sales" value={formatPHPCompact(monthlyTotal)} />
          <SummaryCard icon={Users}      label="Total Sign-ups"      value={String(totalSignups)} sub={`current ${period} view`} />
          <SummaryCard icon={Award}      label="Top Agent"           value={topAgent ? topAgent.name.split(' ')[0] : '—'} sub={topAgent ? formatPHPCompact(topAgent.sales) : ''} accent="#FFF4E0" />
          <SummaryCard icon={Award}      label="Top Team"            value={topTeam ? topTeam.name : '—'} sub={topTeam ? formatPHPCompact(topTeam.sales) : ''} accent="#FFF4E0" />
          <SummaryCard icon={Target}     label="Conversion Rate"     value={`${conversionRate}%`} sub="signups / max" />
          <SummaryCard icon={Users}      label="Active Agents"       value={String(byAgent.length)} sub={`${byTeam.length} teams`} />
        </div>
      </div>

      {/* Detailed sales breakdown — how much each closer/cluster sold this period */}
      <SalesBreakdown
        records={ranged}
        periodLabel={isCustom
          ? (customDates.length === 1 ? '1 custom day' : `${customDates.length} custom days`)
          : period.charAt(0).toUpperCase() + period.slice(1)}
      />

      {/* Period-vs-prior period comparison strip */}
      {(() => {
        const prior = previousPeriodRange(period, today)
        const cmp = comparePeriods(records, start, end, prior.start, prior.end)
        const label = period === 'daily' ? 'yesterday' : period === 'weekly' ? 'last week' : period === 'monthly' ? 'last month' : 'prior'
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
        <p className="text-sm font-semibold text-gray-700 mb-3">Sales per Agent ({period})</p>
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

      {/* Funnel + Package Performance + Live Activity (in a 3-column-ish layout) */}
      <FunnelHealth records={records} />
      <PackagePerformance records={records} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <LiveActivityFeed records={records} limit={10} />
        <ClusterHealth records={records} onTeamClick={onTeamClick} />
      </div>

      {/* Tabs: Agents / Teams */}
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

        {view === 'agents' ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
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
        ) : (
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
  const [period, setPeriod] = useState('monthly')
  const [customDates, setCustomDates] = useState([])  // YYYY-MM-DD[] when period === 'custom'
  const [view,   setView]   = useState('agents')
  const [search, setSearch] = useState('')
  const [selectedAgent, setSelectedAgent] = useState(null)
  const [selectedTeam,  setSelectedTeam]  = useState(null)

  if (loading) return <div className="text-center py-8 text-gray-400">Loading sales data…</div>
  if (error)   return <div className="text-center py-8 text-red-500">{error.message}</div>

  if (selectedAgent) {
    return <AgentDetail agent={selectedAgent} allRecords={records}
                        onBack={() => setSelectedAgent(null)} />
  }
  if (selectedTeam) {
    return <TeamDetail team={selectedTeam} allRecords={records}
                       onBack={() => setSelectedTeam(null)}
                       onAgentClick={setSelectedAgent} />
  }

  return (
    <div className="pb-24 sm:pb-6">
      <Overview
        records={records}
        period={period} onPeriodChange={setPeriod}
        customDates={customDates}
        onCustomApply={(dates) => { setCustomDates(dates); setPeriod('custom') }}
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
