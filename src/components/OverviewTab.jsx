// Overview tab — the morning-coffee single-glance dashboard for MJ
// (Sales Skills Development Manager).
//
// Combines Fusioo Booking Transactions (real Officer attribution) + LakbayHub
// + Meta Ads + YCBM bookings into one view. Charts, leaderboards, coaching
// priorities, and direct drill-down links.

import { useEffect, useMemo, useState } from 'react'
import {
  LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  Sun, Target, TrendingUp, TrendingDown, AlertTriangle, Users,
  DollarSign, Sparkles, Award, Lightbulb, ChevronRight,
  Calendar, Activity, GraduationCap, Trophy, Briefcase,
  ArrowRight, BarChart3, Flame,
} from 'lucide-react'
import {
  parseDate, sum, startOfDay, startOfWeek, endOfWeek,
  filterByRange, rangeFor, sameDayLastWeek,
  paceProjection, formatPHP, formatPHPCompact, fetchSalesRecords,
  getExternalSalesRecords,
} from '../api/lakbay'
import { fetchAllBookingTransactions, mapBookingTransaction, totalsByAgent } from '../api/fusioo'
import { getSettings } from '../lib/settings'
import AacioOverviewCard from './AacioOverviewCard'

const PRIMARY = '#1B4F4F'
const ACCENT  = '#F5A623'
// eslint-disable-next-line no-unused-vars
const PALETTE = [PRIMARY, ACCENT, '#4ECDC4', '#7FB069', '#C26DBC', '#6D9EEB']

function fmtDateISO(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Magandang umaga'
  if (h < 18) return 'Magandang hapon'
  return 'Magandang gabi'
}

const isInternational = (team) => /international/i.test(team || '')

// ---------------------------------------------------------------------------
// Hero card

function HeroCard({ userName, todaySales, todayDeals, dVsYest, dVsLW, totalSales }) {
  return (
    <section className="rounded-2xl p-6 shadow-lg text-white overflow-hidden relative"
             style={{ background: 'linear-gradient(135deg, #1B4F4F 0%, #2a6868 100%)' }}>
      <div className="absolute -top-12 -right-12 w-48 h-48 bg-white/5 rounded-full" />
      <div className="absolute bottom-0 right-0 w-32 h-32 bg-amber-300/10 rounded-full" />
      <div className="relative">
        <div className="flex items-center gap-2 mb-2 text-white/80 text-xs font-semibold uppercase tracking-widest">
          <Sun size={13} /> {greeting()}, {userName}
        </div>
        <p className="text-2xl sm:text-3xl font-bold mb-1">
          Today's revenue: <span className="text-amber-300">{formatPHP(todaySales)}</span>
        </p>
        <p className="text-white/70 text-sm">
          {todayDeals} deal{todayDeals === 1 ? '' : 's'} closed today
          {dVsYest !== null && <> · {dVsYest >= 0 ? '+' : ''}{dVsYest}% vs yesterday</>}
          {dVsLW !== null  && <> · {dVsLW  >= 0 ? '+' : ''}{dVsLW}% vs same day last week</>}
        </p>
        <p className="text-white/50 text-xs mt-3">
          {new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          {' · '}All-time tracked revenue: <b>{formatPHPCompact(totalSales)}</b>
        </p>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Alert pill

function Pill({ tone, Icon, title, body }) {
  const tones = {
    danger: 'bg-red-50 border-red-200 text-red-900',
    warn:   'bg-amber-50 border-amber-200 text-amber-900',
    good:   'bg-emerald-50 border-emerald-200 text-emerald-900',
    info:   'bg-blue-50 border-blue-200 text-blue-900',
  }
  return (
    <div className={`flex items-start gap-2.5 p-3 rounded-xl border text-sm ${tones[tone]}`}>
      <Icon size={15} className="mt-0.5 flex-shrink-0" />
      <div className="min-w-0">
        <p className="font-semibold leading-tight">{title}</p>
        {body && <p className="text-xs mt-0.5 opacity-90">{body}</p>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// KPI strip card

function KpiCol({ icon: Icon, tag, value, sub, delta, tone = '#E8F4F4' }) {
  const showDelta = delta !== null && delta !== undefined && !Number.isNaN(delta)
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: tone }}>
          <Icon size={16} style={{ color: PRIMARY }} />
        </div>
        {showDelta && (
          <span className={`inline-flex items-center gap-0.5 rounded-md font-semibold text-[11px] px-2 py-0.5 ${
            delta > 0 ? 'text-emerald-700 bg-emerald-50' : delta < 0 ? 'text-red-700 bg-red-50' : 'text-gray-600 bg-gray-50'
          }`}>
            {delta > 0 ? <TrendingUp size={11}/> : delta < 0 ? <TrendingDown size={11}/> : null}
            {delta > 0 ? '+' : ''}{delta}%
          </span>
        )}
      </div>
      <p className="text-[11px] text-gray-500 uppercase tracking-wide font-semibold">{tag}</p>
      <p className="text-xl font-bold text-gray-900 truncate" title={value}>{value}</p>
      {sub && <p className="text-xs text-gray-500 leading-tight">{sub}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Monthly target progress

function TargetCard({ records, target }) {
  const p = paceProjection(records, target)
  const isAhead = p.paceVsTarget >= 0
  const pctFilled = Math.min(100, p.targetPercent)
  const onTrackPct = Math.round((p.daysElapsed / p.daysInMonth) * 100)
  const daysLeft = p.daysInMonth - p.daysElapsed

  return (
    <section className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 h-full">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="flex items-center gap-2 text-gray-500 text-[11px] font-semibold uppercase tracking-widest">
            <Target size={12} /> Company Monthly Target
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {formatPHP(p.mtd)} <span className="text-gray-400 text-base font-medium">/ {formatPHPCompact(target)}</span>
          </p>
          <p className="text-xs text-gray-500 mt-0.5">{p.targetPercent}% · {daysLeft} day{daysLeft === 1 ? '' : 's'} left</p>
        </div>
        <span className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap ${
          isAhead ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
        }`}>
          {isAhead ? '+' : '-'}{formatPHPCompact(Math.abs(p.paceVsTarget))}
        </span>
      </div>
      <div className="relative h-3 bg-gray-100 rounded-full overflow-hidden">
        <div className="absolute top-0 bottom-0 w-px bg-gray-400 z-10" style={{ left: `${onTrackPct}%` }} />
        <div className="h-full rounded-full transition-all duration-500"
             style={{ width: `${pctFilled}%`, backgroundColor: isAhead ? PRIMARY : ACCENT }} />
      </div>
      <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-gray-100">
        <div><p className="text-[10px] text-gray-500 uppercase">Run rate</p><p className="text-sm font-bold text-gray-900">{formatPHPCompact(p.dailyRunRate)}/d</p></div>
        <div><p className="text-[10px] text-gray-500 uppercase">Projected</p><p className="text-sm font-bold text-gray-900">{formatPHPCompact(p.projected)}</p></div>
        <div><p className="text-[10px] text-gray-500 uppercase">Need /d</p><p className="text-sm font-bold text-gray-900">{daysLeft > 0 ? formatPHPCompact(Math.max(0, (target - p.mtd) / daysLeft)) : '—'}</p></div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Top 5 performers leaderboard

function TopPerformers({ agents, onSeeAll }) {
  const real = agents.filter(a => a.name !== 'Unassigned').slice(0, 5)
  const maxRev = real[0]?.sales || 1
  return (
    <section className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <Trophy size={14} style={{ color: ACCENT }} /> Top 5 Officers · This Month
        </h3>
        {onSeeAll && (
          <button onClick={onSeeAll} className="text-[11px] text-[#1B4F4F] font-semibold hover:underline flex items-center gap-0.5">
            See all <ChevronRight size={11} />
          </button>
        )}
      </div>
      {real.length === 0 ? (
        <p className="text-sm text-gray-400">No data</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {real.map((a, i) => {
            const pct = (a.sales / maxRev) * 100
            const avgDeal = a.txnCount > 0 ? a.sales / a.txnCount : 0
            return (
              <div key={a.name}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center flex-shrink-0 ${
                      i === 0 ? 'bg-amber-100 text-amber-700' :
                      i === 1 ? 'bg-gray-200 text-gray-700' :
                      i === 2 ? 'bg-orange-100 text-orange-700' :
                                'bg-gray-100 text-gray-500'
                    }`}>{i + 1}</span>
                    <span className="font-medium text-gray-900 truncate">{a.name}</span>
                    {isInternational(a.team) && <span className="text-[9px] px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded">🌏</span>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="font-bold text-gray-900">{formatPHPCompact(a.sales)}</span>
                    <span className="text-gray-400 ml-1.5">· {a.txnCount} · ₱{Math.round(avgDeal/1000)}k</span>
                  </div>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: PRIMARY }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Coaching watchlist

function CoachingWatchlist({ priorities, onSeeAll }) {
  return (
    <section className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <GraduationCap size={14} className="text-amber-500" /> Coaching Watchlist
        </h3>
        {onSeeAll && (
          <button onClick={onSeeAll} className="text-[11px] text-[#1B4F4F] font-semibold hover:underline flex items-center gap-0.5">
            See all <ChevronRight size={11} />
          </button>
        )}
      </div>
      {priorities.length === 0 ? (
        <p className="text-sm text-gray-400">No coaching items today 🎉</p>
      ) : (
        <div className="flex flex-col gap-2">
          {priorities.slice(0, 5).map((p, i) => (
            <div key={i} className={`flex items-start gap-2 p-2.5 rounded-xl ${
              p.tone === 'good' ? 'bg-emerald-50' : p.tone === 'info' ? 'bg-blue-50' : 'bg-amber-50'
            }`}>
              <Lightbulb size={13} className={`mt-0.5 flex-shrink-0 ${
                p.tone === 'good' ? 'text-emerald-600' : p.tone === 'info' ? 'text-blue-600' : 'text-amber-600'
              }`} />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-gray-900">{p.agent}</p>
                <p className="text-[11px] text-gray-600 mt-0.5">{p.reason}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Latest deals stream

function LatestDeals({ records }) {
  const recent = [...records]
    .sort((a, b) => parseDate(b.date) - parseDate(a.date))
    .slice(0, 6)
  return (
    <section className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <Activity size={14} style={{ color: PRIMARY }} /> Latest Deals
        </h3>
        <span className="flex items-center gap-1 text-[10px] text-emerald-600 font-semibold">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
          live
        </span>
      </div>
      {recent.length === 0 ? (
        <p className="text-sm text-gray-400">No recent deals</p>
      ) : (
        <div className="flex flex-col gap-2">
          {recent.map(r => (
            <div key={r.transaction_id} className="flex items-center gap-2.5 text-xs">
              <div className="w-7 h-7 rounded-full text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0"
                   style={{ backgroundColor: isInternational(r.team) ? ACCENT : PRIMARY }}>
                {r.sales_agent.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 truncate">{r.sales_agent}</p>
                <p className="text-gray-500 truncate text-[11px]">
                  {r.meta?.transaction_type || '—'} · {r.date}
                  {isInternational(r.team) ? ' 🌏' : ' 🇵🇭'}
                </p>
              </div>
              <span className="font-bold text-gray-900">{formatPHPCompact(r.sales_amount)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Quick links

function QuickLinks({ onJump }) {
  const links = [
    { id: 'dashboard', label: 'Operations',  Icon: BarChart3, desc: 'Daily matrix · time slots · funnel' },
    { id: 'officers',  label: 'Officers',    Icon: Briefcase, desc: 'Per-agent drill-down · CSV' },
    { id: 'sales',     label: 'Sales',       Icon: Flame,     desc: 'Cluster analytics · trends' },
  ]
  return (
    <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {links.map(l => (
        <button key={l.id} onClick={() => onJump?.(l.id)}
                className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-left hover:border-[#1B4F4F] hover:shadow transition-all flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#E8F4F4' }}>
              <l.Icon size={16} style={{ color: PRIMARY }} />
            </div>
            <ArrowRight size={14} className="text-gray-400" />
          </div>
          <p className="text-sm font-bold text-gray-900">{l.label}</p>
          <p className="text-[10px] text-gray-500 leading-tight">{l.desc}</p>
        </button>
      ))}
    </section>
  )
}

// ---------------------------------------------------------------------------

export default function OverviewTab({ bookings: _bookings = [], userName = 'MJ', onJumpTab }) {
  const { monthlyTarget } = getSettings()

  // --- Load Fusioo (primary) ---
  const [records, setRecords] = useState([])
  useEffect(() => {
    let cancelled = false
    const load = () => fetchAllBookingTransactions()
      .then(raw => {
        if (cancelled) return
        const mapped = raw.map(mapBookingTransaction).filter(r => r.date)
        setRecords(mapped)
      })
      .catch(() => {})
    load()
    const id = setInterval(load, 60_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  // --- Load Acquisition + AACIO sales (LakbayHub) for the combined company view ---
  // One fetch warms the shared cache; fetchSalesRecords() returns POTB-only
  // (Acquisition) and getExternalSalesRecords() reads the AACIO split.
  const [acqRecords, setAcqRecords] = useState([])
  const [aacioRecords, setAacioRecords] = useState([])
  useEffect(() => {
    let cancelled = false
    const load = () => fetchSalesRecords()
      .then(recs => {
        if (cancelled) return
        setAcqRecords(Array.isArray(recs) ? recs : [])
        setAacioRecords(getExternalSalesRecords().filter(r => r.date))
      })
      .catch(() => {})
    load()
    const id = setInterval(load, 60_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  // --- Date windows ---
  const now = new Date()
  const today    = rangeFor('daily',   now)
  const yest     = rangeFor('daily',   new Date(now.getTime() - 86400000))
  const lwDay    = sameDayLastWeek(now)
  const thisWeek = rangeFor('weekly',  now)
  const lastWeek = { start: startOfWeek(new Date(thisWeek.start.getTime() - 86400000)),
                     end:   endOfWeek(new Date(thisWeek.start.getTime() - 86400000)) }
  const thisMth  = rangeFor('monthly', now)

  const todayRecs    = filterByRange(records, today.start,   today.end)
  const yestRecs     = filterByRange(records, yest.start,    yest.end)
  const lwRecs       = filterByRange(records, lwDay.start,   lwDay.end)
  const weekRecs     = filterByRange(records, thisWeek.start, thisWeek.end)
  const lastWeekRecs = filterByRange(records, lastWeek.start, lastWeek.end)
  const mthRecs      = filterByRange(records, thisMth.start,  thisMth.end)

  const todaySales = sum(todayRecs, 'sales_amount')
  const yestSales  = sum(yestRecs,  'sales_amount')
  const lwSales    = sum(lwRecs,    'sales_amount')
  const weekSales  = sum(weekRecs,  'sales_amount')
  const lastWeekSales = sum(lastWeekRecs, 'sales_amount')
  const mthSales   = sum(mthRecs,   'sales_amount')

  // --- Combined company revenue: Acquisition + AACIO (LakbayHub) + Account Officers (Fusioo) ---
  // All three are money coming in; this is the CEO's "total pera na pumapasok" view.
  const acqToday = sum(filterByRange(acqRecords, today.start,    today.end),    'sales_amount')
  const acqWeek  = sum(filterByRange(acqRecords, thisWeek.start, thisWeek.end), 'sales_amount')
  const acqMonth = sum(filterByRange(acqRecords, thisMth.start,  thisMth.end),  'sales_amount')
  const aacioToday = sum(filterByRange(aacioRecords, today.start,    today.end),    'sales_amount')
  const aacioWeek  = sum(filterByRange(aacioRecords, thisWeek.start, thisWeek.end), 'sales_amount')
  const aacioMonth = sum(filterByRange(aacioRecords, thisMth.start,  thisMth.end),  'sales_amount')
  const company = {
    today: { acq: acqToday, aacio: aacioToday, off: todaySales, total: acqToday + aacioToday + todaySales },
    week:  { acq: acqWeek,  aacio: aacioWeek,  off: weekSales,  total: acqWeek  + aacioWeek  + weekSales  },
    month: { acq: acqMonth, aacio: aacioMonth, off: mthSales,   total: acqMonth + aacioMonth + mthSales   },
  }
  // Combined records (with dates) → drives the overall ₱5.3M target pace.
  const companyRecords = useMemo(
    () => [...acqRecords, ...aacioRecords, ...records],
    [acqRecords, aacioRecords, records],
  )

  const pct = (cur, prev) => prev === 0 ? (cur > 0 ? 100 : 0) : Math.round(((cur - prev) / prev) * 100)
  const dVsYest    = pct(todaySales, yestSales)
  const dVsLW      = pct(todaySales, lwSales)
  const dWeekVsLW  = pct(weekSales, lastWeekSales)

  // Daily trend for chart (last 30 days)
  const trendDays = useMemo(() => {
    const days = []
    const todayStart = startOfDay(now)
    for (let i = 29; i >= 0; i--) {
      const d = new Date(todayStart.getTime() - i * 86400000)
      const next = new Date(d.getTime() + 86400000)
      const dayRecs = records.filter(r => {
        const t = parseDate(r.date).getTime()
        return t >= d.getTime() && t < next.getTime()
      })
      days.push({
        date: fmtDateISO(d),
        label: d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }),
        revenue: dayRecs.reduce((s, r) => s + (r.sales_amount || 0), 0),
        deals: dayRecs.length,
      })
    }
    return days
  }, [records])

  // Domestic vs International breakdown
  const domestic = mthRecs.filter(r => !isInternational(r.team))
  const international = mthRecs.filter(r =>  isInternational(r.team))
  const divisionData = [
    { name: '🇵🇭 Domestic',      value: sum(domestic, 'sales_amount'), color: PRIMARY },
    { name: '🌏 International', value: sum(international, 'sales_amount'), color: ACCENT },
  ]

  // Performers
  const monthAgents = totalsByAgent(mthRecs)
  const priorMthRecs = filterByRange(records, new Date(thisMth.start.getFullYear(), thisMth.start.getMonth() - 1, 1),
                                              new Date(thisMth.start.getTime() - 1))
  const priorByName = Object.fromEntries(totalsByAgent(priorMthRecs).map(a => [a.name, a]))

  // Coaching priorities from agent deltas
  const realAgents = monthAgents.filter(a => a.name !== 'Unassigned')
  const teamAvgRev = realAgents.length > 0
    ? realAgents.reduce((s, a) => s + a.sales, 0) / realAgents.length : 0

  const priorities = []
  // Spotlight: top performer
  if (realAgents[0] && realAgents[0].sales > teamAvgRev * 1.5) {
    priorities.push({
      agent: realAgents[0].name,
      reason: `🏆 Top performer · ${formatPHPCompact(realAgents[0].sales)}. Ask them to share their playbook.`,
      tone: 'good',
    })
  }
  // Big drops
  for (const a of realAgents) {
    const prev = priorByName[a.name]
    if (!prev || prev.sales === 0) continue
    const delta = Math.round(((a.sales - prev.sales) / prev.sales) * 100)
    if (delta <= -30) {
      priorities.push({
        agent: a.name,
        reason: `Revenue dropped ${delta}% vs last month (${formatPHPCompact(prev.sales)} → ${formatPHPCompact(a.sales)})`,
        tone: 'warn',
      })
    }
  }
  // Zero deals this month
  for (const a of realAgents) {
    if (a.txnCount === 0) priorities.push({ agent: a.name, reason: 'No deals closed this month. Schedule 1:1.', tone: 'warn' })
  }
  // Low avg deal size
  const avgDealTeam = realAgents.length > 0
    ? realAgents.reduce((s, a) => s + (a.txnCount > 0 ? a.sales / a.txnCount : 0), 0) /
      Math.max(1, realAgents.filter(a => a.txnCount > 0).length)
    : 0
  for (const a of realAgents) {
    if (a.txnCount > 0 && avgDealTeam > 0) {
      const myAvg = a.sales / a.txnCount
      if (myAvg < avgDealTeam * 0.4) {
        priorities.push({
          agent: a.name,
          reason: `Avg deal ${formatPHPCompact(myAvg)} is well below team avg ${formatPHPCompact(avgDealTeam)}. Focus: upsell training.`,
          tone: 'info',
        })
      }
    }
  }

  // KPI numbers
  const avgDealMth = mthRecs.length > 0 ? mthSales / mthRecs.length : 0
  const totalProfitMth = mthRecs.reduce((s, r) => s + (r.profit || 0), 0)
  const profitMarginMth = mthSales > 0 ? Math.round((totalProfitMth / mthSales) * 100) : 0
  const activeAgentsMth = realAgents.length
  const totalSales = sum(records, 'sales_amount')

  const cMonth = company.month
  const share = (v) => cMonth.total > 0 ? Math.round((v / cMonth.total) * 100) : 0
  const acqShare   = share(cMonth.acq)
  const aacioShare = share(cMonth.aacio)
  const offShare   = share(cMonth.off)

  return (
    <div className="flex flex-col gap-5 pb-24 sm:pb-6">
      {/* TOTAL COMPANY REVENUE — Acquisition (sign-ups) + Account Officers (agency bookings) */}
      <section className="rounded-2xl p-5 sm:p-6 text-white shadow-sm"
               style={{ background: `linear-gradient(135deg, ${PRIMARY} 0%, #0f3a3a 100%)` }}>
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <span className="text-[11px] uppercase tracking-widest text-white/70">Total Company Revenue · This Month</span>
            <p className="text-4xl sm:text-5xl font-extrabold tracking-tight mt-1">{formatPHP(cMonth.total)}</p>
            <p className="text-sm text-white/70 mt-1">Lahat ng pumapasok na pera — acquisition + AACIO + account officers</p>
          </div>
          {/* Stream split */}
          <div className="flex gap-3 flex-wrap">
            <div className="bg-white/10 rounded-xl px-4 py-3 min-w-[8.5rem]">
              <p className="text-[10px] uppercase tracking-wide text-white/60">Acquisition</p>
              <p className="text-lg font-bold leading-tight">{formatPHPCompact(cMonth.acq)}</p>
              <p className="text-[11px] text-white/60">{acqShare}% · sign-ups</p>
            </div>
            <div className="bg-white/10 rounded-xl px-4 py-3 min-w-[8.5rem]">
              <p className="text-[10px] uppercase tracking-wide text-white/60">AACIO</p>
              <p className="text-lg font-bold leading-tight">{formatPHPCompact(cMonth.aacio)}</p>
              <p className="text-[11px] text-white/60">{aacioShare}% · external team</p>
            </div>
            <div className="bg-white/10 rounded-xl px-4 py-3 min-w-[8.5rem]">
              <p className="text-[10px] uppercase tracking-wide text-white/60">Account Officers</p>
              <p className="text-lg font-bold leading-tight">{formatPHPCompact(cMonth.off)}</p>
              <p className="text-[11px] text-white/60">{offShare}% · agency bookings</p>
            </div>
          </div>
        </div>
        {/* Share bar */}
        <div className="mt-4 h-2 rounded-full overflow-hidden bg-white/15 flex">
          <div style={{ width: `${acqShare}%`,   backgroundColor: '#F5A623' }} title={`Acquisition ${acqShare}%`} />
          <div style={{ width: `${aacioShare}%`, backgroundColor: '#9333ea' }} title={`AACIO ${aacioShare}%`} />
          <div style={{ width: `${offShare}%`,   backgroundColor: '#4ECDC4' }} title={`Account Officers ${offShare}%`} />
        </div>
        {/* Today / Week / Month */}
        <div className="grid grid-cols-3 gap-3 mt-4">
          {[
            { l: 'Today',      v: company.today.total },
            { l: 'This Week',  v: company.week.total },
            { l: 'This Month', v: company.month.total },
          ].map(s => (
            <div key={s.l} className="bg-white/5 rounded-xl px-3 py-2 text-center">
              <p className="text-[10px] uppercase tracking-wide text-white/60">{s.l}</p>
              <p className="text-base font-bold">{formatPHPCompact(s.v)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Hero + Target side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <HeroCard
          userName={userName}
          todaySales={todaySales}
          todayDeals={todayRecs.length}
          dVsYest={dVsYest}
          dVsLW={dVsLW}
          totalSales={totalSales}
        />
        <TargetCard records={companyRecords} target={monthlyTarget} />
      </div>

      {/* Action items / alerts */}
      {priorities.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
            <Sparkles size={14} className="text-amber-500" /> Action Items
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {priorities.slice(0, 4).map((p, i) => (
              <Pill key={i}
                    tone={p.tone}
                    Icon={p.tone === 'good' ? Award : p.tone === 'info' ? Lightbulb : AlertTriangle}
                    title={p.agent}
                    body={p.reason} />
            ))}
          </div>
        </section>
      )}

      {/* At a glance */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 mb-2">At a Glance</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCol icon={DollarSign} tag="Today"
                  value={formatPHP(todaySales)}
                  sub={`${todayRecs.length} deals`}
                  delta={dVsYest} />
          <KpiCol icon={Calendar}   tag="This Week"
                  value={formatPHPCompact(weekSales)}
                  sub={`${weekRecs.length} deals · Mon–Sun`}
                  delta={dWeekVsLW}
                  tone="#FFF4E0" />
          <KpiCol icon={Calendar}   tag="This Month"
                  value={formatPHPCompact(mthSales)}
                  sub={`${mthRecs.length} deals`}
                  tone="#dcfce7" />
          <KpiCol icon={Target}     tag="Avg Deal"
                  value={formatPHPCompact(avgDealMth)}
                  sub="this month" />
          <KpiCol icon={TrendingUp} tag="Profit Margin"
                  value={`${profitMarginMth}%`}
                  sub={`${formatPHPCompact(totalProfitMth)} profit MTD`}
                  tone="#dbeafe" />
          <KpiCol icon={Users}      tag="Active Officers"
                  value={String(activeAgentsMth)}
                  sub="closed deals MTD" />
        </div>
      </section>

      {/* AACIO external-team snapshot — separate from company totals */}
      <AacioOverviewCard onJumpTab={onJumpTab} />

      {/* Charts row: Daily trend + Domestic/International */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Performance Trends</h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 lg:col-span-2">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-gray-700">30-Day Revenue Trend</p>
              <span className="text-[11px] text-gray-500">{formatPHPCompact(trendDays.reduce((s, d) => s + d.revenue, 0))} total</span>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trendDays}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={PRIMARY} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={PRIMARY} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={3} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={formatPHPCompact} />
                <Tooltip formatter={v => formatPHP(v)} />
                <Line type="monotone" dataKey="revenue" stroke={PRIMARY} strokeWidth={2.5}
                      dot={{ r: 3, fill: PRIMARY }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <p className="text-sm font-semibold text-gray-700 mb-2">Division Mix · This Month</p>
            <ResponsiveContainer width="100%" height={170}>
              <PieChart>
                <Pie data={divisionData} cx="50%" cy="50%" innerRadius={48} outerRadius={72} paddingAngle={3} dataKey="value">
                  {divisionData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip formatter={v => formatPHP(v)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col gap-1.5 mt-2 pt-3 border-t border-gray-100">
              {divisionData.map((d, i) => {
                const total = divisionData.reduce((s, x) => s + x.value, 0)
                const pctShare = total > 0 ? Math.round((d.value / total) * 100) : 0
                return (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                      <span className="text-gray-700">{d.name}</span>
                    </span>
                    <span className="font-semibold text-gray-900">{pctShare}% · {formatPHPCompact(d.value)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      {/* People focus: Top 5 + Coaching Watchlist */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 mb-2">People Focus</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <TopPerformers agents={monthAgents} onSeeAll={() => onJumpTab?.('officers')} />
          <CoachingWatchlist priorities={priorities} onSeeAll={() => onJumpTab?.('officers')} />
        </div>
      </section>

      {/* Activity stream + Quick links */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Live & Drill-Down</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <LatestDeals records={records} />
          <div className="flex flex-col gap-3">
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Jump to</p>
            <QuickLinks onJump={onJumpTab} />
          </div>
        </div>
      </section>
    </div>
  )
}
