// Lead Quality Report (AACIO surveys → HighLevel).
// Shows WHICH Meta ads generate employed vs unemployed leads, and the
// professions behind them — from the "POTB Survey" + "Aacio POTB Survey"
// qualifier answers. MJ uses this to judge ad quality (an ad that floods us with
// no-job leads is burning spend even if it "converts" cheaply).
import { useState, useEffect, useMemo } from 'react'
import { Users, Briefcase, UserX, HelpCircle, Megaphone, RefreshCw, Download, AlertTriangle } from 'lucide-react'
import {
  fetchLeadQualitySubmissions, invalidateLeadQualityCache,
  groupByAd, summarize, JOB_BUCKETS, SURVEYS,
} from '../api/aacioSurvey'
import { PERIODS_WITH_ALL, periodRange, periodLabelFor, currentMonthKey } from '../lib/periods'

const PRIMARY = '#1B4F4F'
const PLATFORM_LABEL = { fb: 'Facebook', ig: 'Instagram', an: 'Audience Net', msg: 'Messenger' }
const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0)

export default function LeadQualityTab() {
  const [subs, setSubs] = useState(null)
  const [err, setErr] = useState(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('all')
  const [refreshing, setRefreshing] = useState(false)

  const load = async (force = false) => {
    try {
      setErr(null); if (force) setRefreshing(true); else setLoading(true)
      if (force) invalidateLeadQualityCache()
      const data = await fetchLeadQualitySubmissions({ force })
      setSubs(data)
    } catch (e) { setErr(String(e?.message || e)) }
    finally { setLoading(false); setRefreshing(false) }
  }
  useEffect(() => { load() }, [])

  const { start, end } = useMemo(() => periodRange(period, currentMonthKey()), [period])
  const inRange = useMemo(() => {
    if (!subs) return []
    const lo = start.getTime(), hi = end.getTime()
    return subs.filter(s => {
      const t = s.createdAt ? new Date(s.createdAt).getTime() : NaN
      return !isNaN(t) && t >= lo && t <= hi
    })
  }, [subs, start, end])

  const sum = useMemo(() => summarize(inRange), [inRange])
  const ads = useMemo(() => groupByAd(inRange), [inRange])

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
    link.href = url; link.download = `lead-quality-by-ad-${period}.csv`; link.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Kinukuha ang survey leads…</div>
  if (err) return (
    <div className="m-4 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
      <p className="font-semibold flex items-center gap-2"><AlertTriangle size={16} /> Hindi makuha ang AACIO survey data</p>
      <p className="mt-1">{err}</p>
      <button onClick={() => load(true)} className="mt-2 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold">Subukan ulit</button>
    </div>
  )

  const noJobPct = pct(sum.noJob, sum.total)
  const hasJobPct = pct(sum.hasJob, sum.total)
  const unclearPct = pct(sum.unclear, sum.total)

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto w-full flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold" style={{ color: PRIMARY }}>Lead Quality Report</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Sino ang leads na dala ng bawat ad — <b>may trabaho vs walang trabaho</b> + professions · Source: AACIO surveys ({Object.values(SURVEYS).join(' + ')})
          </p>
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

      {/* Period selector */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {PERIODS_WITH_ALL.map(p => (
          <button key={p.id} onClick={() => setPeriod(p.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${period === p.id ? 'text-white' : 'text-gray-600 bg-gray-100 hover:bg-gray-200'}`}
            style={period === p.id ? { backgroundColor: PRIMARY } : {}}>
            {p.label}
          </button>
        ))}
        <span className="text-xs text-gray-400 ml-1">{periodLabelFor(period, currentMonthKey())} · {sum.total} leads</span>
      </div>

      {/* Headline KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Kpi icon={Users} label="Total Leads" value={sum.total} accent="#eef2ff" tint="#4338ca" />
        <Kpi icon={Briefcase} label="Has Job" value={sum.hasJob} sub={`${hasJobPct}%`} accent="#dcfce7" tint="#15803d" />
        <Kpi icon={UserX} label="No Job" value={sum.noJob} sub={`${noJobPct}%`} accent="#fee2e2" tint="#b91c1c" />
        <Kpi icon={HelpCircle} label="Unclear" value={sum.unclear} sub={`${unclearPct}%`} accent="#f3f4f6" tint="#6b7280" />
        <Kpi icon={Megaphone} label="Distinct Ads" value={sum.adCount} accent="#fef3c7" tint="#a16207" />
      </div>

      {/* Employment breakdown */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Employment Breakdown</p>
        <div className="flex flex-col gap-2">
          {Object.entries(JOB_BUCKETS).map(([key, meta]) => {
            const n = sum.buckets[key] || 0
            const p = pct(n, sum.total)
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
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="font-bold text-gray-800">Ads → Lead Quality</p>
          <p className="text-[11px] text-gray-500 mt-0.5">Bawat Meta ad (utm_content), naka-sort ayon sa dami ng <b>walang-trabaho</b> na leads. Mataas na No-Job % = mababang kalidad na lead source.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                <th className="px-4 py-2 font-semibold">Ad</th>
                <th className="px-3 py-2 font-semibold text-right">Leads</th>
                <th className="px-3 py-2 font-semibold text-right">No Job</th>
                <th className="px-3 py-2 font-semibold text-right">Has Job</th>
                <th className="px-3 py-2 font-semibold text-right">Unclear</th>
                <th className="px-4 py-2 font-semibold">Top Professions</th>
              </tr>
            </thead>
            <tbody>
              {ads.map((a, i) => {
                const noAd = !a.adId
                const hot = a.noJobPct >= 25 && a.total >= 10
                return (
                  <tr key={a.adId || `none-${i}`} className={`border-b border-gray-50 ${hot ? 'bg-red-50/40' : ''}`}>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        {a.platform && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-600">{PLATFORM_LABEL[a.platform] || a.platform}</span>}
                        <span className={`font-mono text-xs ${noAd ? 'text-gray-400 italic' : 'text-gray-800'}`}>{noAd ? 'No ad ID (organic/direct)' : a.adId}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold text-gray-900">{a.total}</td>
                    <td className="px-3 py-2.5 text-right">
                      <span className="font-semibold text-red-700">{a.noJob}</span>
                      <span className="text-gray-400 text-xs"> · {a.noJobPct}%</span>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span className="font-semibold text-green-700">{a.hasJob}</span>
                      <span className="text-gray-400 text-xs"> · {a.hasJobPct}%</span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-400">{a.unclear}</td>
                    <td className="px-4 py-2.5">
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
              {!ads.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Walang leads sa period na ito.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Heuristic footnote */}
      <p className="text-[11px] text-gray-400 leading-relaxed">
        <b>Paano tinutukoy ang trabaho:</b> galing sa free-text na sagot sa "profession" na tanong ng survey, kaya heuristic ito.
        Has Job = Employed, Self-employed/Business, OFW. No Job = Unemployed, Housewife, Student, Retired.
        <b>Unclear</b> = walang malinaw na sagot (blangko, typo, o "n/a") — hiwalay na binibilang para hindi mapalaki ang alinmang panig.
        Ang "No ad ID" na row ay mga lead na walang Meta ad attribution (organic/direct o kulang ang utm).
      </p>
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
