// Lead Quality Report (AACIO surveys → HighLevel).
// Shows WHICH Meta ads generate employed vs unemployed leads, and the
// professions behind them — from the qualifier answers. Split per survey
// (POTB Survey vs Aacio POTB Survey), with Today/Yesterday/Week/Monthly (pick
// any month)/All Time/Custom period filters.
import { useState, useEffect, useMemo } from 'react'
import { Users, Briefcase, UserX, HelpCircle, Megaphone, RefreshCw, Download, AlertTriangle, ExternalLink, ThumbsUp, ThumbsDown, ArrowUpDown } from 'lucide-react'
import {
  fetchLeadQualitySubmissions, invalidateLeadQualityCache,
  groupByAd, summarize, JOB_BUCKETS, SURVEYS,
} from '../api/aacioSurvey'
import { periodRange, currentMonthKey } from '../lib/periods'

const PRIMARY = '#1B4F4F'
const PLATFORM_LABEL = { fb: 'Facebook', ig: 'Instagram', an: 'Audience Net', msg: 'Messenger' }
const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0)
const startOfDay = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
const endOfDay = d => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x }

// Meta Ads Manager deep link — opens the specific ad so it can be paused/off.
// If the AACIO team runs these ads under a different ad account, change this id.
const META_ADS_ACCOUNT = '1179475260260170' // [Internal] PINOY ONLINE TRAVEL BIZ
const adManagerUrl = adId =>
  `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${META_ADS_ACCOUNT}&selected_ad_ids=${adId}`

// Quality verdict from the no-job share (only meaningful with enough volume).
function qualityOf(a) {
  if (a.total < 10) return { key: 'low_vol', label: 'Low volume', color: '#9ca3af', bg: '#f3f4f6' }
  if (a.noJobPct >= 25) return { key: 'poor', label: 'Low quality', color: '#b91c1c', bg: '#fee2e2' }
  if (a.noJobPct <= 12 && a.hasJobPct >= 55) return { key: 'great', label: 'High quality', color: '#15803d', bg: '#dcfce7' }
  return { key: 'ok', label: 'Medium', color: '#a16207', bg: '#fef3c7' }
}
const SORTS = {
  nojob: { label: 'Most no-job', fn: (a, b) => b.noJob - a.noJob || b.total - a.total },
  hasjob: { label: 'Most employed', fn: (a, b) => b.hasJob - a.hasJob || b.total - a.total },
  volume: { label: 'Most leads', fn: (a, b) => b.total - a.total },
  worst: { label: 'Highest no-job %', fn: (a, b) => b.noJobPct - a.noJobPct || b.total - a.total },
}

// Quick periods + Monthly + Custom (survey sub-tabs handle the survey split).
const QUICK = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'Monthly' },
  { id: 'all', label: 'All Time' },
  { id: 'custom', label: 'Custom' },
]

export default function LeadQualityTab() {
  const [subs, setSubs] = useState(null)
  const [err, setErr] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  // survey split
  const surveyIds = Object.keys(SURVEYS)
  const [surveyId, setSurveyId] = useState('rClDnqaM5njW4Rmw8hUj') // POTB Survey (the one with data)
  // period
  const [period, setPeriod] = useState('all')
  const [monthKey, setMonthKey] = useState(currentMonthKey())
  const [cStart, setCStart] = useState('')
  const [cEnd, setCEnd] = useState('')
  const [sortKey, setSortKey] = useState('nojob')

  const load = async (force = false) => {
    try {
      setErr(null); if (force) setRefreshing(true); else setLoading(true)
      if (force) invalidateLeadQualityCache()
      setSubs(await fetchLeadQualitySubmissions({ force }))
    } catch (e) { setErr(String(e?.message || e)) }
    finally { setLoading(false); setRefreshing(false) }
  }
  useEffect(() => { load() }, [])

  // Month options: next month (so August is pickable) → 7 months back.
  const months = useMemo(() => {
    const now = new Date(), out = []
    for (let i = 1; i >= -7; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
      out.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }) })
    }
    return out
  }, [])

  // Active date range from the chosen period.
  const range = useMemo(() => {
    if (period === 'custom') {
      if (!cStart || !cEnd) return null
      return { start: startOfDay(new Date(cStart)), end: endOfDay(new Date(cEnd)) }
    }
    return periodRange(period, monthKey)
  }, [period, monthKey, cStart, cEnd])

  // Filter to the selected survey, then the date range.
  const inRange = useMemo(() => {
    if (!subs) return []
    const forSurvey = subs.filter(s => s.surveyId === surveyId)
    if (!range) return []
    const lo = range.start.getTime(), hi = range.end.getTime()
    return forSurvey.filter(s => {
      const t = s.createdAt ? new Date(s.createdAt).getTime() : NaN
      return !isNaN(t) && t >= lo && t <= hi
    })
  }, [subs, surveyId, range])

  const sum = useMemo(() => summarize(inRange), [inRange])
  const adsRaw = useMemo(() => groupByAd(inRange), [inRange])
  const ads = useMemo(() => [...adsRaw].sort(SORTS[sortKey].fn), [adsRaw, sortKey])

  // Auto-insights: best / worst quality ad (needs volume + a real ad id).
  const insights = useMemo(() => {
    const eligible = adsRaw.filter(a => a.adId && a.total >= 20)
    if (!eligible.length) return null
    const best = [...eligible].sort((a, b) => a.noJobPct - b.noJobPct || b.total - a.total)[0]
    const worst = [...eligible].sort((a, b) => b.noJobPct - a.noJobPct || b.total - a.total)[0]
    const biggest = [...eligible].sort((a, b) => b.total - a.total)[0]
    return { best, worst, biggest }
  }, [adsRaw])

  const periodLabel = period === 'custom'
    ? (cStart && cEnd ? `${cStart} → ${cEnd}` : 'Pick dates')
    : period === 'month' ? (months.find(m => m.key === monthKey)?.label || monthKey)
    : (QUICK.find(q => q.id === period)?.label || '')

  const exportCSV = () => {
    const esc = v => '"' + String(v ?? '').replace(/"/g, '""') + '"'
    const head = ['Ad ID', 'Platform', 'Campaign ID', 'Adset ID', 'Total Leads', 'No Job', 'No Job %', 'Has Job', 'Has Job %', 'Unclear', 'Top Professions']
    const lines = ads.map(a => [
      a.adId || '(no ad id)', a.platform, a.campaignId, a.adsetId, a.total, a.noJob, a.noJobPct, a.hasJob, a.hasJobPct, a.unclear,
      a.topProfessions.map(([p, n]) => `${p} (${n})`).join('; '),
    ].map(esc).join(','))
    const blob = new Blob([[head.map(esc).join(','), ...lines].join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.download = `lead-quality-${SURVEYS[surveyId]}-${period === 'month' ? monthKey : period}.csv`.replace(/\s+/g, '-'); link.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Loading survey leads…</div>
  if (err) return (
    <div className="m-4 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
      <p className="font-semibold flex items-center gap-2"><AlertTriangle size={16} /> Couldn't load AACIO survey data</p>
      <p className="mt-1">{err}</p>
      <button onClick={() => load(true)} className="mt-2 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold">Retry</button>
    </div>
  )

  const noJobPct = pct(sum.noJob, sum.total), hasJobPct = pct(sum.hasJob, sum.total), unclearPct = pct(sum.unclear, sum.total)
  const surveyCounts = surveyIds.reduce((a, id) => (a[id] = (subs || []).filter(s => s.surveyId === id).length, a), {})

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto w-full flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold" style={{ color: PRIMARY }}>Lead Quality Report</h1>
          <p className="text-sm text-gray-500 mt-0.5">Which leads each ad brings in — <b>employed vs unemployed</b> + professions · Source: AACIO surveys</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => load(true)} disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} /> Refresh
          </button>
          <button onClick={exportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white hover:opacity-90" style={{ backgroundColor: PRIMARY }}>
            <Download size={13} /> Export CSV
          </button>
        </div>
      </div>

      {/* Survey sub-tabs (POTB Survey vs Aacio POTB Survey — magkahiwalay) */}
      <div className="flex items-center gap-2 border-b border-gray-200">
        {surveyIds.map(id => (
          <button key={id} onClick={() => setSurveyId(id)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition ${surveyId === id ? 'text-[#1B4F4F] border-[#1B4F4F]' : 'text-gray-500 border-transparent hover:text-gray-700'}`}>
            {SURVEYS[id]} <span className="text-xs font-normal text-gray-400">({surveyCounts[id] ?? 0})</span>
          </button>
        ))}
      </div>

      {/* Period selector */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {QUICK.map(p => (
          <button key={p.id} onClick={() => setPeriod(p.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${period === p.id ? 'text-white' : 'text-gray-600 bg-gray-100 hover:bg-gray-200'}`}
            style={period === p.id ? { backgroundColor: PRIMARY } : {}}>
            {p.label}
          </button>
        ))}
        {period === 'month' && (
          <select value={monthKey} onChange={e => setMonthKey(e.target.value)}
            className="px-2 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 text-gray-700 bg-white">
            {months.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        )}
        {period === 'custom' && (
          <span className="flex items-center gap-1.5">
            <input type="date" value={cStart} onChange={e => setCStart(e.target.value)}
              className="px-2 py-1.5 rounded-lg text-xs border border-gray-200 text-gray-700" />
            <span className="text-gray-400 text-xs">→</span>
            <input type="date" value={cEnd} onChange={e => setCEnd(e.target.value)}
              className="px-2 py-1.5 rounded-lg text-xs border border-gray-200 text-gray-700" />
          </span>
        )}
        <span className="text-xs text-gray-400 ml-1">{SURVEYS[surveyId]} · {periodLabel} · {sum.total} leads</span>
      </div>

      {/* Empty state for a survey/period with no data */}
      {!inRange.length ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-gray-400 text-sm">
          {period === 'custom' && (!cStart || !cEnd)
            ? 'Pick a start and end date above.'
            : `No leads for "${SURVEYS[surveyId]}" in ${periodLabel}.`}
        </div>
      ) : (
        <>
          {/* Headline KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <Kpi icon={Users} label="Total Leads" value={sum.total} accent="#eef2ff" tint="#4338ca" />
            <Kpi icon={Briefcase} label="Has Job" value={sum.hasJob} sub={`${hasJobPct}%`} accent="#dcfce7" tint="#15803d" />
            <Kpi icon={UserX} label="No Job" value={sum.noJob} sub={`${noJobPct}%`} accent="#fee2e2" tint="#b91c1c" />
            <Kpi icon={HelpCircle} label="Unclear" value={sum.unclear} sub={`${unclearPct}%`} accent="#f3f4f6" tint="#6b7280" />
            <Kpi icon={Megaphone} label="Distinct Ads" value={sum.adCount} accent="#fef3c7" tint="#a16207" />
          </div>

          {/* Auto-insights — instant read for CEO/GM/marketing */}
          {insights && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <InsightCard tone="good" icon={ThumbsUp} title="Scale this — highest quality"
                ad={insights.best} note={`${insights.best.hasJobPct}% employed · ${insights.best.noJobPct}% no job`} />
              <InsightCard tone="bad" icon={ThumbsDown} title="Turn off / review — lowest quality"
                ad={insights.worst} note={`${insights.worst.noJobPct}% no job · ${insights.worst.noJob} leads`} />
              <InsightCard tone="neutral" icon={Megaphone} title="Biggest volume"
                ad={insights.biggest} note={`${insights.biggest.total} leads · ${insights.biggest.noJobPct}% no job`} />
            </div>
          )}

          {/* Employment breakdown */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Employment Breakdown</p>
            <div className="flex flex-col gap-2">
              {Object.entries(JOB_BUCKETS).map(([key, meta]) => {
                const n = sum.buckets[key] || 0, p = pct(n, sum.total)
                const color = meta.hasJob === true ? '#15803d' : meta.hasJob === false ? '#b91c1c' : '#9ca3af'
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-medium text-gray-700">{meta.label}</span>
                      <span className="text-gray-500"><b className="text-gray-900">{n}</b> · {p}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${p}%`, backgroundColor: color }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Ads → lead quality table */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-start justify-between gap-3 flex-wrap">
              <div>
                <p className="font-bold text-gray-800">Ads → Lead Quality</p>
                <p className="text-[11px] text-gray-500 mt-0.5">Click an <b>Ad ID</b> to open it in Meta Ads Manager (to turn it off). Green = more <b>employed</b>; red = more <b>unemployed</b>.</p>
              </div>
              <label className="flex items-center gap-1.5 text-xs text-gray-500">
                <ArrowUpDown size={13} /> Sort:
                <select value={sortKey} onChange={e => setSortKey(e.target.value)}
                  className="px-2 py-1 rounded-lg text-xs font-semibold border border-gray-200 text-gray-700 bg-white">
                  {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </label>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                    <th className="px-4 py-2 font-semibold">Ad</th>
                    <th className="px-3 py-2 font-semibold text-right">Leads</th>
                    <th className="px-3 py-2 font-semibold">Quality (employed vs unemployed)</th>
                    <th className="px-3 py-2 font-semibold">No-job — breakdown</th>
                    <th className="px-4 py-2 font-semibold">Top Professions</th>
                  </tr>
                </thead>
                <tbody>
                  {ads.map((a, i) => {
                    const noAd = !a.adId, q = qualityOf(a)
                    const b = a.buckets || {}
                    const noJobKinds = [
                      ['🏠 Housewife', b.housewife || 0],
                      ['❌ Unemployed', b.unemployed || 0],
                      ['🎓 Student', b.student || 0],
                      ['👴 Retired', b.retired || 0],
                    ].filter(([, n]) => n > 0)
                    return (
                      <tr key={a.adId || `none-${i}`} className="border-b border-gray-50 hover:bg-gray-50/60">
                        <td className="px-4 py-3 align-top">
                          <div className="flex items-center gap-2 mb-1">
                            {a.platform && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-600">{PLATFORM_LABEL[a.platform] || a.platform}</span>}
                            {noAd
                              ? <span className="font-mono text-xs text-gray-400 italic">No ad ID (organic/direct)</span>
                              : <a href={adManagerUrl(a.adId)} target="_blank" rel="noopener noreferrer"
                                  className="font-mono text-xs text-blue-600 hover:underline inline-flex items-center gap-1" title="Open in Meta Ads Manager">
                                  {a.adId} <ExternalLink size={11} />
                                </a>}
                          </div>
                          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ color: q.color, backgroundColor: q.bg }}>{q.label}</span>
                        </td>
                        <td className="px-3 py-3 text-right font-bold text-gray-900 align-top">{a.total}</td>
                        <td className="px-3 py-3 align-top" style={{ minWidth: 180 }}>
                          {/* stacked bar: green has-job, red no-job, gray unclear */}
                          <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
                            <div style={{ width: `${a.hasJobPct}%`, backgroundColor: '#22c55e' }} title={`Has job ${a.hasJob}`} />
                            <div style={{ width: `${a.noJobPct}%`, backgroundColor: '#ef4444' }} title={`No job ${a.noJob}`} />
                            <div style={{ width: `${pct(a.unclear, a.total)}%`, backgroundColor: '#d1d5db' }} title={`Unclear ${a.unclear}`} />
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-[11px]">
                            <span className="text-green-700 font-semibold">✔ {a.hasJob} <span className="text-gray-400">({a.hasJobPct}%)</span></span>
                            <span className="text-red-700 font-semibold">✘ {a.noJob} <span className="text-gray-400">({a.noJobPct}%)</span></span>
                            {a.unclear > 0 && <span className="text-gray-400">? {a.unclear}</span>}
                          </div>
                        </td>
                        <td className="px-3 py-3 align-top">
                          <div className="flex flex-wrap gap-1">
                            {noJobKinds.length ? noJobKinds.map(([label, n]) => (
                              <span key={label} className="px-1.5 py-0.5 rounded text-[10px] bg-red-50 text-red-700 border border-red-100">{label} <b>{n}</b></span>
                            )) : <span className="text-gray-300 text-xs">—</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex flex-wrap gap-1">
                            {a.topProfessions.map(([p, n]) => (
                              <span key={p} className="px-1.5 py-0.5 rounded text-[10px] bg-gray-100 text-gray-600">{p} <b className="text-gray-800">{n}</b></span>
                            ))}
                            {!a.topProfessions.length && <span className="text-gray-300 text-xs">—</span>}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-[11px] text-gray-400 leading-relaxed">
            <b>How employment is determined:</b> from the free-text "profession" answer, so it's heuristic. Has Job = Employed, Self-employed/Business, OFW. No Job = Unemployed, Housewife, Student, Retired. <b>Unclear</b> = no clear answer (blank/typo/"n/a"), counted separately so it never inflates either side. "No ad ID" = no Meta ad attribution (organic/direct or missing utm).
          </p>
        </>
      )}
    </div>
  )
}

function InsightCard({ tone, icon: Icon, title, ad, note }) {
  const c = tone === 'good' ? { bg: '#f0fdf4', bd: '#bbf7d0', tint: '#15803d' }
    : tone === 'bad' ? { bg: '#fef2f2', bd: '#fecaca', tint: '#b91c1c' }
    : { bg: '#f8fafc', bd: '#e2e8f0', tint: '#475569' }
  return (
    <div className="rounded-2xl p-3.5 border" style={{ backgroundColor: c.bg, borderColor: c.bd }}>
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: c.tint }}>
        <Icon size={13} /> {title}
      </div>
      <a href={adManagerUrl(ad.adId)} target="_blank" rel="noopener noreferrer"
        className="mt-1.5 block font-mono text-sm text-blue-600 hover:underline truncate" title="Open in Meta Ads Manager">
        {ad.adId} ↗
      </a>
      <div className="text-xs text-gray-600 mt-0.5">{note}</div>
    </div>
  )
}

function Kpi({ icon: Icon, label, value, sub, accent, tint }) {
  return (
    <div className="rounded-2xl p-3.5 border border-gray-100" style={{ backgroundColor: accent }}>
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: tint }}>
        <Icon size={13} /> {label}
      </div>
      <div className="mt-1 text-2xl font-extrabold text-gray-900">{value}{sub && <span className="text-sm font-bold text-gray-400 ml-1">{sub}</span>}</div>
    </div>
  )
}
