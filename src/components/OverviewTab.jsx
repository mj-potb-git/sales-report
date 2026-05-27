// Overview tab — the one-glance executive summary.
// Combines today's snapshot, monthly target, smart alerts, and the most
// important cross-source KPIs across YCBM + LakbayHub + Meta Ads.
// Designed to be the "morning coffee" view for the GM.

import { useEffect, useMemo, useState } from 'react'
import {
  Sun, Target, TrendingUp, TrendingDown, AlertTriangle,
  Calendar, DollarSign, Users, Sparkles, CheckCircle2, Activity,
  ArrowRight, Lightbulb, Award, Clock,
} from 'lucide-react'
import {
  fetchSalesRecords, formatPHP, formatPHPCompact, parseDate, sum,
  filterByRange, rangeFor, sameDayLastWeek, paceProjection,
  lastSignupByCluster, aggregateBy, totalsByTeam,
} from '../api/lakbay'
import { fetchMetaDailyMap, sumLeads } from '../api/meta'
import { attendanceStats } from '../lib/attendance'
import { getSettings } from '../lib/settings'

const PRIMARY = '#1B4F4F'
const ACCENT  = '#F5A623'

function startOfDay(d) { const x = new Date(d); x.setHours(0,0,0,0); return x }

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

// ---------------------------------------------------------------------------
// Hero card — greeting + today's headline numbers

function HeroCard({ userName, todaySales, todaySignups, dVsYest, dVsLW }) {
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
          {todaySignups} sign-up{todaySignups === 1 ? '' : 's'} so far ·
          {dVsYest !== null && <> {dVsYest >= 0 ? '+' : ''}{dVsYest}% vs yesterday ·</>}
          {dVsLW !== null && <> {dVsLW >= 0 ? '+' : ''}{dVsLW}% vs same day last week</>}
        </p>

        <p className="text-white/50 text-xs mt-3">
          {new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Alerts banner — the urgent items needing action

function Alert({ tone, Icon, title, body }) {
  const tones = {
    danger:  'bg-red-50 border-red-200 text-red-900',
    warn:    'bg-amber-50 border-amber-200 text-amber-900',
    good:    'bg-emerald-50 border-emerald-200 text-emerald-900',
    info:    'bg-blue-50 border-blue-200 text-blue-900',
  }
  return (
    <div className={`flex items-start gap-2.5 p-3 rounded-xl border ${tones[tone]}`}>
      <Icon size={16} className="mt-0.5 flex-shrink-0" />
      <div className="min-w-0">
        <p className="font-semibold text-sm">{title}</p>
        {body && <p className="text-xs mt-0.5 opacity-90">{body}</p>}
      </div>
    </div>
  )
}

function buildAlerts({ records, target, bookings, metaByDate }) {
  const alerts = []
  const now = new Date()
  const today = rangeFor('daily', now)
  const yest  = rangeFor('daily', new Date(now.getTime() - 86400000))
  const ts = sum(filterByRange(records, today.start, today.end), 'sales_amount')
  const ys = sum(filterByRange(records, yest.start,  yest.end),  'sales_amount')

  // Monthly target
  const pace = paceProjection(records, target, now)
  if (pace.targetPercent >= 100) {
    alerts.push({ tone: 'good', Icon: Award, title: '🎉 Monthly target HIT!', body: `${pace.targetPercent}% of target with ${pace.daysInMonth - pace.daysElapsed} day(s) remaining.` })
  } else if (pace.paceVsTarget >= 0) {
    alerts.push({ tone: 'good', Icon: TrendingUp, title: 'Ahead of monthly pace', body: `${pace.targetPercent}% of target. Projected ${formatPHPCompact(pace.projected)} (${Math.round((pace.projected / target) * 100)}%).` })
  } else {
    const needPerDay = Math.max(0, (target - pace.mtd) / Math.max(1, pace.daysInMonth - pace.daysElapsed))
    alerts.push({ tone: 'warn', Icon: AlertTriangle, title: `Behind target by ${formatPHPCompact(Math.abs(pace.paceVsTarget))}`, body: `Need ${formatPHPCompact(needPerDay)}/day for the rest of the month.` })
  }

  // Today comparison
  if (ts === 0 && now.getHours() >= 12) {
    alerts.push({ tone: 'warn', Icon: AlertTriangle, title: 'No sign-ups recorded today', body: 'Mid-day with no sign-ups yet. Check ad delivery or follow up on pending leads.' })
  } else if (ys > 0 && ts >= ys * 1.2) {
    alerts.push({ tone: 'good', Icon: TrendingUp, title: `Today outpacing yesterday`, body: `${formatPHPCompact(ts)} vs ${formatPHPCompact(ys)} yesterday (+${Math.round(((ts - ys) / ys) * 100)}%).` })
  }

  // Dormant clusters
  const clusters = lastSignupByCluster(records)
  const dormant = clusters.filter(c => c.daysSinceLast >= 7)
  if (dormant.length > 0) {
    alerts.push({
      tone: dormant.length >= 2 ? 'danger' : 'warn',
      Icon: AlertTriangle,
      title: `${dormant.length} dormant cluster${dormant.length === 1 ? '' : 's'} (7+ days)`,
      body: dormant.map(c => c.name).join(', '),
    })
  }

  // Pending payments
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const mtd = filterByRange(records, monthStart, now)
  const pending = mtd.filter(r => r.meta?.payment_status === 'PENDING')
  if (pending.length >= 3) {
    alerts.push({ tone: 'info', Icon: Lightbulb, title: `${pending.length} pending payments worth ${formatPHPCompact(sum(pending, 'sales_amount'))}`, body: 'Follow up to recover this revenue.' })
  }

  // Bookings vs sales today (no sales today but many bookings)
  const todayBookings = bookings.filter(b => fmtDateISO(new Date(b.startsAt)) === fmtDateISO(now) && !b.raw?.cancelled)
  const todaySales = filterByRange(records, today.start, today.end)
  if (todayBookings.length >= 10 && todaySales.length === 0 && now.getHours() >= 18) {
    alerts.push({ tone: 'warn', Icon: Clock, title: `${todayBookings.length} bookings today but 0 sales yet`, body: 'Check follow-up workflow with sales closers.' })
  }

  // Meta ad performance
  if (metaByDate && metaByDate.size > 0) {
    const todayMeta = metaByDate.get(fmtDateISO(now))
    if (todayMeta?.spend > 5000 && todayMeta.leads === 0) {
      alerts.push({ tone: 'danger', Icon: AlertTriangle, title: `${formatPHPCompact(todayMeta.spend)} spent today, 0 leads`, body: 'Check creative quality, audience, or pixel events.' })
    }
  }

  return alerts
}

// ---------------------------------------------------------------------------
// At-a-glance section — 4 columns, each with primary metric + trend

function GlanceCol({ icon: Icon, tag, value, sub, delta, tone = '#E8F4F4' }) {
  const showDelta = delta !== null && delta !== undefined && !Number.isNaN(delta)
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: tone }}>
          <Icon size={16} style={{ color: PRIMARY }} />
        </div>
        {showDelta && (
          <span className={`inline-flex items-center gap-0.5 rounded-md font-semibold text-[11px] px-2 py-0.5 ${
            delta > 0 ? 'text-emerald-700 bg-emerald-50'
                       : delta < 0 ? 'text-red-700 bg-red-50'
                                   : 'text-gray-600 bg-gray-50'
          }`}>
            {delta > 0 ? <TrendingUp size={11}/> : delta < 0 ? <TrendingDown size={11}/> : null}
            {delta > 0 ? '+' : ''}{delta}%
          </span>
        )}
      </div>
      <p className="text-[11px] text-gray-500 uppercase tracking-wide font-semibold">{tag}</p>
      <p className="text-2xl font-bold text-gray-900 truncate" title={value}>{value}</p>
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
    <section className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="flex items-center gap-2 text-gray-500 text-[11px] font-semibold uppercase tracking-widest">
            <Target size={12} /> Monthly Target
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {formatPHP(p.mtd)} <span className="text-gray-400 text-base font-medium">/ {formatPHPCompact(target)}</span>
          </p>
          <p className="text-xs text-gray-500 mt-0.5">{p.targetPercent}% · {daysLeft} day{daysLeft === 1 ? '' : 's'} left · {formatPHPCompact(p.dailyRunRate)}/day pace</p>
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
        <div><p className="text-[10px] text-gray-500 uppercase">Projected</p><p className="text-sm font-bold text-gray-900">{formatPHPCompact(p.projected)}</p></div>
        <div><p className="text-[10px] text-gray-500 uppercase">Need /day</p><p className="text-sm font-bold text-gray-900">{daysLeft > 0 ? formatPHPCompact(Math.max(0, (target - p.mtd) / daysLeft)) : '—'}</p></div>
        <div><p className="text-[10px] text-gray-500 uppercase">Final est</p><p className="text-sm font-bold text-gray-900">{Math.round((p.projected / target) * 100)}%</p></div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Top performers row

function TopPerformers({ records }) {
  const teams = totalsByTeam(records).slice(0, 5)
  const totalRev = teams.reduce((a, t) => a + t.sales, 0)
  return (
    <section className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
        <Award size={14} style={{ color: ACCENT }} /> Top Clusters · This Month
      </h3>
      <div className="flex flex-col gap-2">
        {teams.length === 0 ? (
          <p className="text-sm text-gray-400">No data</p>
        ) : teams.map((t, i) => {
          const pct = totalRev > 0 ? (t.sales / totalRev) * 100 : 0
          return (
            <div key={t.name}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="flex items-center gap-2">
                  <span className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center ${
                    i === 0 ? 'bg-amber-100 text-amber-700' :
                    i === 1 ? 'bg-gray-200 text-gray-700' :
                    i === 2 ? 'bg-orange-100 text-orange-700' :
                              'bg-gray-100 text-gray-500'
                  }`}>{i + 1}</span>
                  <span className="font-medium text-gray-900 truncate">{t.name}</span>
                </span>
                <span className="font-bold text-gray-900">{formatPHPCompact(t.sales)}</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: PRIMARY }} />
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Live activity preview

function LiveActivityPreview({ records, onSeeAll }) {
  const recent = useMemo(() =>
    [...records]
      .sort((a, b) => {
        const dA = parseDate(a.date).getTime()
        const dB = parseDate(b.date).getTime()
        if (dA !== dB) return dB - dA
        return (b.transaction_id || '').localeCompare(a.transaction_id || '')
      })
      .slice(0, 5),
  [records])

  return (
    <section className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <Activity size={14} style={{ color: PRIMARY }} /> Latest Sign-ups
        </h3>
        <span className="flex items-center gap-1 text-[10px] text-emerald-600 font-semibold">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
          live
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {recent.map(r => (
          <div key={r.transaction_id} className="flex items-center gap-2.5 text-xs">
            <div className="w-7 h-7 rounded-full text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0"
                 style={{ backgroundColor: PRIMARY }}>
              {r.customer_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 truncate">{r.customer_name}</p>
              <p className="text-gray-500 truncate">{r.meta?.package || '—'} · {r.date}</p>
            </div>
            <span className="font-semibold text-gray-900">{formatPHPCompact(r.sales_amount)}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------

export default function OverviewTab({ bookings = [], userName = 'MJ' }) {
  const { monthlyTarget } = getSettings()

  // Load LakbayHub sales
  const [records, setRecords] = useState([])
  useEffect(() => {
    let cancelled = false
    const load = () => fetchSalesRecords()
      .then(r => { if (!cancelled) setRecords(r) }).catch(() => {})
    load()
    const id = setInterval(load, 30_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  // Load Meta daily
  const [metaByDate, setMetaByDate] = useState(new Map())
  useEffect(() => {
    let cancelled = false
    const load = () => fetchMetaDailyMap({ days: 30 })
      .then(m => { if (!cancelled) setMetaByDate(m) }).catch(() => {})
    load()
    const id = setInterval(load, 60_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  const now = new Date()
  const today    = rangeFor('daily',   now)
  const yest     = rangeFor('daily',   new Date(now.getTime() - 86400000))
  const lwDay    = sameDayLastWeek(now)
  const thisWeek = rangeFor('weekly',  now)
  const thisMth  = rangeFor('monthly', now)

  const todayRecs    = filterByRange(records, today.start,   today.end)
  const yestRecs     = filterByRange(records, yest.start,    yest.end)
  const lwRecs       = filterByRange(records, lwDay.start,   lwDay.end)
  const weekRecs     = filterByRange(records, thisWeek.start, thisWeek.end)
  const mthRecs      = filterByRange(records, thisMth.start,  thisMth.end)

  const todaySales = sum(todayRecs, 'sales_amount')
  const yestSales  = sum(yestRecs,  'sales_amount')
  const lwSales    = sum(lwRecs,    'sales_amount')

  const pct = (cur, prev) => prev === 0 ? (cur > 0 ? 100 : 0) : Math.round(((cur - prev) / prev) * 100)
  const dVsYest = pct(todaySales, yestSales)
  const dVsLW   = pct(todaySales, lwSales)

  // Bookings today/week
  const todayKey = fmtDateISO(now)
  const todayBookings = bookings.filter(b => fmtDateISO(new Date(b.startsAt)) === todayKey && !b.raw?.cancelled)
  const weekBookings  = bookings.filter(b => {
    const t = new Date(b.startsAt).getTime()
    return t >= thisWeek.start.getTime() && t <= thisWeek.end.getTime() && !b.raw?.cancelled
  })

  // Meta totals — week + month
  const metaWeek = (() => {
    let spend = 0, leads = 0
    for (let i = 0; i < 7; i++) {
      const d = new Date(thisWeek.start.getTime() + i * 86400000)
      const m = metaByDate.get(fmtDateISO(d))
      if (m) { spend += m.spend; leads += m.leads }
    }
    return { spend, leads }
  })()

  const metaMonth = (() => {
    let spend = 0, leads = 0
    const daysInMth = Math.floor((thisMth.end - thisMth.start) / 86400000) + 1
    for (let i = 0; i < daysInMth; i++) {
      const d = new Date(thisMth.start.getTime() + i * 86400000)
      const m = metaByDate.get(fmtDateISO(d))
      if (m) { spend += m.spend; leads += m.leads }
    }
    return { spend, leads }
  })()

  const attendanceForToday = attendanceStats(todayBookings)
  const attendanceForWeek  = attendanceStats(weekBookings)

  // Conversion rates
  const todayConv  = todayBookings.length > 0 ? Math.round((todayRecs.length / todayBookings.length) * 100) : null
  const weekConv   = weekBookings.length  > 0 ? Math.round((weekRecs.length  / weekBookings.length)  * 100) : null
  const roasMonth  = metaMonth.spend > 0 ? +(sum(mthRecs, 'sales_amount') / metaMonth.spend).toFixed(2) : null

  const alerts = useMemo(
    () => buildAlerts({ records, target: monthlyTarget, bookings, metaByDate }),
    [records, monthlyTarget, bookings, metaByDate]
  )

  return (
    <div className="flex flex-col gap-5 pb-24 sm:pb-6">
      {/* Hero */}
      <HeroCard
        userName={userName}
        todaySales={todaySales}
        todaySignups={todayRecs.length}
        dVsYest={dVsYest}
        dVsLW={dVsLW}
      />

      {/* Alerts banner */}
      {alerts.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
            <Sparkles size={14} className="text-amber-500" /> Action Items
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {alerts.slice(0, 6).map((a, i) => (
              <Alert key={i} tone={a.tone} Icon={a.Icon} title={a.title} body={a.body} />
            ))}
          </div>
        </section>
      )}

      {/* At-a-glance KPI row */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 mb-2">At a Glance</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <GlanceCol icon={DollarSign} tag="Today's Revenue"
                     value={formatPHP(todaySales)}
                     sub={`${todayRecs.length} sign-ups`}
                     delta={dVsYest} />
          <GlanceCol icon={DollarSign} tag="This Week"
                     value={formatPHPCompact(sum(weekRecs, 'sales_amount'))}
                     sub={`${weekRecs.length} sign-ups · Mon–Sun`}
                     tone="#FFF4E0" />
          <GlanceCol icon={DollarSign} tag="This Month"
                     value={formatPHPCompact(sum(mthRecs, 'sales_amount'))}
                     sub={`${mthRecs.length} sign-ups`}
                     tone="#dcfce7" />
          <GlanceCol icon={TrendingUp} tag="ROAS · MTD"
                     value={roasMonth === null ? '—' : `${roasMonth}x`}
                     sub={`${formatPHPCompact(metaMonth.spend)} ad spend MTD`}
                     tone="#dbeafe" />
        </div>
      </section>

      {/* Funnel summary row — bookings, sales, conversion */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Funnel · Today vs This Week</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <GlanceCol icon={Calendar}  tag="Bookings Today"
                     value={String(todayBookings.length)}
                     sub={`${todayBookings.length} active`} />
          <GlanceCol icon={CheckCircle2} tag="Show-Up Rate · Today"
                     value={attendanceForToday.showUpRate === null ? '—' : `${attendanceForToday.showUpRate}%`}
                     sub={attendanceForToday.showUpRate === null
                       ? `mark ${attendanceForToday.unset} pending`
                       : `${attendanceForToday.showed}/${attendanceForToday.tracked}`}
                     tone="#dcfce7" />
          <GlanceCol icon={Users}     tag="Conversion · Today"
                     value={todayConv === null ? '—' : `${todayConv}%`}
                     sub="sales / bookings" />
          <GlanceCol icon={Users}     tag="Conversion · Week"
                     value={weekConv === null ? '—' : `${weekConv}%`}
                     sub={`${weekRecs.length} sales / ${weekBookings.length} bookings`}
                     tone="#FFF4E0" />
        </div>
      </section>

      {/* Target + Top performers + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <TargetCard records={records} target={monthlyTarget} />
        <TopPerformers records={mthRecs} />
        <LiveActivityPreview records={records} />
      </div>
    </div>
  )
}
