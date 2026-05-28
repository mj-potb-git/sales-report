// Account Officers tab — designed for the Sales Skills Development Manager
// (MJ's role). Combines company-wide snapshot, agent performance ranking,
// coaching priorities, and individual drill-down.
//
// Data source: LakbayHub today (via useSalesData). Fusioo BookingTransactions
// will augment / replace once credentials are configured.

import { useState, useMemo, useEffect } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import {
  Award, Users, TrendingUp, TrendingDown, AlertCircle, Search,
  Target, Sparkles, ArrowLeft, ChevronRight, Lightbulb, GraduationCap,
  Briefcase, BarChart3, Trophy, Flame, Snowflake, Clock,
} from 'lucide-react'
import useSalesData from '../hooks/useSalesData'
import LiveIndicator from './LiveIndicator'
import {
  filterByRange, rangeFor, sameDayLastWeek, parseDate, sum,
  totalsByAgent as totalsByAgentLBH, totalsByTeam as totalsByTeamLBH, dailyTrend,
  formatPHP, formatPHPCompact, timeAgo,
} from '../api/lakbay'
import { fetchAllBookingTransactions, mapBookingTransaction, totalsByAgent, totalsByTeam } from '../api/fusioo'

const PRIMARY = '#1B4F4F'
const ACCENT  = '#F5A623'
const PALETTE = [PRIMARY, ACCENT, '#4ECDC4', '#7FB069', '#C26DBC', '#6D9EEB']

const PERIODS = [
  { id: 'weekly',  label: 'This Week', days: 7  },
  { id: 'monthly', label: 'This Month', days: 30 },
  { id: '60d',     label: '60 Days',   days: 60 },
  { id: '90d',     label: '90 Days',   days: 90 },
  { id: 'all',     label: 'All-Time',  days: 9999 },
]

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
  const recent = useMemo(() =>
    [...recs].sort((a, b) => b.transaction_id.localeCompare(a.transaction_id)).slice(0, 10),
    [recs]
  )

  const avgDeal = agent.txnCount > 0 ? agent.sales / agent.txnCount : 0
  const lastActivity = recs.length > 0
    ? recs.reduce((latest, r) => parseDate(r.date) > parseDate(latest.date) ? r : latest, recs[0])
    : null

  // Best day for this agent
  const bestDay = trend.reduce((max, d) => d.sales > max.sales ? d : max, trend[0] ?? { sales: 0 })

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

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          <StatCard icon={TrendingUp} label="Total Revenue" value={formatPHP(agent.sales)} />
          <StatCard icon={Briefcase}   label="Deals Closed" value={String(agent.txnCount)} />
          <StatCard icon={Target}      label="Avg Deal Size" value={formatPHPCompact(avgDeal)} accent="#FFF4E0" />
          <StatCard icon={Users}       label="Total Sign-ups" value={String(agent.signups)} />
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

      {/* Recent transactions */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-700">Recent Transactions ({recent.length} of {agent.txnCount})</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                {['Date', 'Customer', 'Package', 'Status', 'Amount'].map(h => (
                  <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {recent.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No transactions yet</td></tr>
              ) : recent.map(r => (
                <tr key={r.transaction_id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-600">{r.date}</td>
                  <td className="px-4 py-2 font-medium text-gray-900">{r.customer_name}</td>
                  <td className="px-4 py-2 text-gray-600">{r.meta?.package || '—'}</td>
                  <td className="px-4 py-2">
                    {r.meta?.payment_status && (
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        r.meta.payment_status === 'PAID' ? 'bg-emerald-50 text-emerald-700' :
                        r.meta.payment_status === 'PENDING' ? 'bg-amber-50 text-amber-700' :
                                                              'bg-gray-100 text-gray-600'
                      }`}>{r.meta.payment_status}</span>
                    )}
                  </td>
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
// Main view

export default function AccountOfficersTab() {
  const [periodId, setPeriodId] = useState('monthly')
  const [search, setSearch] = useState('')
  const [filterUnassigned, setFilterUnassigned] = useState(true)
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
    load({ background: false })
    const id = setInterval(() => load({ background: true }), 60_000)
    return () => clearInterval(id)
  }, [])

  const period = PERIODS.find(p => p.id === periodId) ?? PERIODS[1]

  if (loading) return <div className="text-center py-12 text-gray-400">Loading Booking Transactions from Fusioo…</div>
  if (error)   return <div className="text-center py-12 text-red-500">{error.message}</div>

  // Period filter
  const now = new Date()
  const start = period.id === 'all'
    ? new Date(2020, 0, 1)
    : new Date(now.getTime() - (period.days - 1) * 86400000)
  start.setHours(0, 0, 0, 0)
  const ranged = filterByRange(records, start, now)
  const priorStart = new Date(start.getTime() - period.days * 86400000)
  const priorEnd = new Date(start.getTime() - 1)
  const priorRanged = filterByRange(records, priorStart, priorEnd)

  // Per-agent totals
  const allAgents = totalsByAgent(ranged)
  const priorAgents = totalsByAgent(priorRanged)
  const priorByName = Object.fromEntries(priorAgents.map(a => [a.name, a]))

  // Apply filters
  const filteredAgents = allAgents
    .filter(a => !filterUnassigned || a.name !== 'Unassigned')
    .filter(a => !search || a.name.toLowerCase().includes(search.toLowerCase()) || a.team.toLowerCase().includes(search.toLowerCase()))

  // Compute team average revenue (excluding unassigned) for tier classification
  const realAgents = allAgents.filter(a => a.name !== 'Unassigned')
  const teamAvgRevenue = realAgents.length > 0
    ? realAgents.reduce((s, a) => s + a.sales, 0) / realAgents.length
    : 0

  // Company snapshot
  const companyRevenue = sum(ranged, 'sales_amount')
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
          reason: `Revenue dropped ${Math.round(delta)}% vs prior ${period.label.toLowerCase()} (${formatPHPCompact(prior.sales)} → ${formatPHPCompact(agent.sales)})`,
          tone: 'warn',
        })
      }
    }
    // No deals this period
    if (agent.txnCount === 0) {
      coachingPriorities.push({
        agent: agent.name,
        reason: `No deals closed this ${period.label.toLowerCase()}. Schedule a 1:1 to identify blockers.`,
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
      reason: `Top performer this ${period.label.toLowerCase()} (${formatPHP(topAgent.sales)}). Consider asking them to share their playbook with the team.`,
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
            <p className="text-sm text-gray-500">Sales Skills Development view · {filteredAgents.length} agent{filteredAgents.length === 1 ? '' : 's'}</p>
            <LiveIndicator lastFetched={lastFetched} refreshing={refreshing} onRefresh={() => load({ background: true })} label="Fusioo" />
          </div>
        </div>
        <div className="flex bg-gray-100 rounded-xl p-1 gap-1 overflow-x-auto">
          {PERIODS.map(p => (
            <button key={p.id} onClick={() => setPeriodId(p.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                      periodId === p.id ? 'bg-white text-[#1B4F4F] shadow-sm font-semibold' : 'text-gray-500 hover:text-gray-700'
                    }`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Company snapshot */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
          <Sparkles size={14} className="text-amber-500" /> Company Overview · {period.label}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          <StatCard icon={TrendingUp} label="Company Revenue"
                    value={formatPHPCompact(companyRevenue)}
                    sub={revenueDelta === null ? `${companyDeals} deals` : `${revenueDelta >= 0 ? '+' : ''}${revenueDelta}% vs prior · ${companyDeals} deals`} />
          <StatCard icon={Briefcase}  label="Total Deals" value={String(companyDeals)} sub={`${realAgents.length} agents active`} />
          <StatCard icon={Target}     label="Avg Deal Size" value={formatPHPCompact(companyAvgDeal)} sub="per closed sale" accent="#FFF4E0" />
          <StatCard icon={Award}      label="Top Officer"
                    value={topAgent ? (topAgent.name === 'Unassigned' ? '⚠ Unassigned' : topAgent.name.split(' ')[0]) : '—'}
                    sub={topAgent ? `${formatPHPCompact(topAgent.sales)} · ${topAgent.txnCount} deals` : ''}
                    accent="#FFF4E0" />
          <StatCard icon={Users}      label="Top Cluster" value={topTeam?.name || '—'} sub={topTeam ? formatPHPCompact(topTeam.sales) : ''} />
          <StatCard icon={AlertCircle} label="Unassigned Sales"
                    value={`${unassignedPct}%`}
                    sub={`${formatPHPCompact(unassignedRevenue)} not yet attributed`}
                    accent={unassignedPct > 50 ? '#fee2e2' : '#fef3c7'} />
        </div>
      </section>

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
          <h2 className="text-base font-semibold text-gray-800">Performance Leaderboard</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="flex items-center gap-1.5 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={filterUnassigned}
                onChange={e => setFilterUnassigned(e.target.checked)}
                className="rounded"
              />
              Hide unassigned
            </label>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search agent or cluster…"
                className="pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-xl focus:outline-none focus:border-[#1B4F4F]"
              />
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
                        <span className="px-2 py-0.5 bg-teal-50 text-teal-700 rounded-md text-[11px] whitespace-nowrap">{a.team}</span>
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-gray-900">{formatPHP(a.sales)}</td>
                      <td className="px-3 py-2.5 text-gray-700">{a.txnCount}</td>
                      <td className="px-3 py-2.5 text-gray-600">{formatPHPCompact(avgDeal)}</td>
                      <td className="px-3 py-2.5 text-gray-600">{a.signups}</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold ${tier.tone}`}>
                          <tier.Icon size={10} /> {tier.label}
                        </span>
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
