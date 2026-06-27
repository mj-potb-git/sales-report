// Ads tab — per-ad performance from Meta, with turn-off recommendations.
// Answers: which ads generate leads/conversations cheaply, and which are
// burning budget with little/no result (and should be turned off).
import { useState, useEffect, useCallback } from 'react'
import {
  Megaphone, AlertTriangle, TrendingUp, Wallet, Target, RefreshCw, PauseCircle,
} from 'lucide-react'
import { fetchAdPerformance } from '../api/metaAds'
import { formatPHP, formatPHPCompact } from '../api/lakbay'

const TEAL = '#1B4F4F'
const GOLD = '#F5A623'

const PERIODS = [
  { id: 7,  label: '7 araw' },
  { id: 14, label: '14 araw' },
  { id: 30, label: '30 araw' },
  { id: 90, label: '90 araw' },
]

const VERDICT_STYLE = {
  off:    { cls: 'bg-red-100 text-red-700',       dot: 'bg-red-500' },
  watch:  { cls: 'bg-amber-100 text-amber-700',   dot: 'bg-amber-500' },
  winner: { cls: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  ok:     { cls: 'bg-gray-100 text-gray-600',     dot: 'bg-gray-400' },
  paused: { cls: 'bg-gray-100 text-gray-400',     dot: 'bg-gray-300' },
}

function Kpi({ icon: Icon, label, value, sub, accent = TEAL }) {
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

function VerdictBadge({ verdict }) {
  const s = VERDICT_STYLE[verdict.tag] || VERDICT_STYLE.ok
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${s.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {verdict.label}
    </span>
  )
}

export default function AdsTab() {
  const [days, setDays] = useState(30)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async (d, background = false) => {
    if (background) setRefreshing(true); else setLoading(true)
    try {
      const res = await fetchAdPerformance({ days: d })
      setData(res); setError(null)
    } catch (e) { setError(e) }
    finally { setLoading(false); setRefreshing(false) }
  }, [])

  useEffect(() => { load(days) }, [days, load])

  if (loading && !data) {
    return (
      <div className="flex flex-col gap-4 max-w-6xl mx-auto w-full">
        <div className="skeleton h-8 w-48" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-24" />)}</div>
        <div className="skeleton h-64" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center max-w-2xl mx-auto">
        <p className="text-red-700 font-semibold">Hindi makuha ang Ads data</p>
        <p className="text-red-500 text-sm mt-1">{error.message}</p>
        <p className="text-gray-500 text-xs mt-2">Tsignan ang Meta token sa Settings, o baka expired na ang token.</p>
      </div>
    )
  }

  const { summary, ads, toTurnOff } = data

  return (
    <div className="flex flex-col gap-5 max-w-6xl mx-auto w-full">
      {/* Header + period */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2" style={{ color: TEAL }}>
            <Megaphone size={20} /> Ads Performance
          </h2>
          <p className="text-sm text-gray-400">Meta Ads — alin ang kumikita ng leads, alin ang dapat i-OFF</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-gray-100 rounded-xl p-1">
            {PERIODS.map(p => (
              <button key={p.id} onClick={() => setDays(p.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${days === p.id ? 'bg-white shadow-sm font-semibold' : 'text-gray-500 hover:text-gray-800'}`}
                style={days === p.id ? { color: TEAL } : undefined}>
                {p.label}
              </button>
            ))}
          </div>
          <button onClick={() => load(days, true)} disabled={refreshing}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100" title="Refresh">
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi icon={Wallet} label="Total Spend" value={formatPHPCompact(summary.totalSpend)} sub={`${summary.activeCount} active / ${summary.adCount} ads`} />
        <Kpi icon={Target} label="Leads + Usapan" value={summary.totalResults.toLocaleString()} sub={`${summary.totalLeads} leads · ${summary.totalMsg} messenger`} accent={GOLD} />
        <Kpi icon={TrendingUp} label="Avg Cost / Lead" value={formatPHP(summary.avgCpr)} sub="spend ÷ (leads + usapan)" />
        <Kpi icon={AlertTriangle} label="Dapat i-OFF" value={summary.turnOffCount} sub={`~${formatPHPCompact(summary.wastedSpend)} nasasayang`} accent="#DC2626" />
      </div>

      {/* Turn-off recommendations */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <AlertTriangle size={16} className="text-red-500" />
          <h3 className="font-semibold text-gray-900">Dapat i-OFF ({toTurnOff.length})</h3>
          <span className="text-[11px] text-gray-500 ml-auto">active ads na mahal o walang lead — {formatPHP(summary.wastedSpend)} sa napiling period</span>
        </div>
        {toTurnOff.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">🎉 Walang malinaw na dapat i-OFF — maganda ang takbo ng active ads!</p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {toTurnOff.map(ad => (
              <li key={ad.id} className="px-5 py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-gray-800 truncate">{ad.name}</p>
                  <p className="text-xs text-gray-400 truncate">{ad.campaign}</p>
                  <p className="text-xs text-red-600 mt-0.5">⚠️ {ad.verdict.reasons.join(' · ')}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-bold text-gray-900">{formatPHP(ad.spend)}</p>
                  <p className="text-xs text-gray-500">{ad.results} result{ad.results === 1 ? '' : 's'}{ad.cpr != null ? ` · ${formatPHP(ad.cpr)}/lead` : ''}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Full ads table */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
          <h3 className="font-semibold text-gray-900">Lahat ng Ads ({ads.length})</h3>
          <span className="text-[11px] text-gray-500 flex items-center gap-3">
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Panalo</span>
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Bantayan</span>
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> I-OFF</span>
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 text-xs uppercase tracking-wide border-b border-gray-100">
                <th className="px-4 py-2 font-semibold">Ad</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold text-right">Spend</th>
                <th className="px-3 py-2 font-semibold text-right">Leads</th>
                <th className="px-3 py-2 font-semibold text-right">Usapan</th>
                <th className="px-3 py-2 font-semibold text-right">Cost/Lead</th>
                <th className="px-3 py-2 font-semibold">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {ads.map(ad => (
                <tr key={ad.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-4 py-2.5 max-w-[260px]">
                    <p className="font-medium text-gray-800 truncate">{ad.name}</p>
                    <p className="text-[11px] text-gray-400 truncate">{ad.campaign}</p>
                  </td>
                  <td className="px-3 py-2.5">
                    {ad.status === 'ACTIVE'
                      ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">● Active</span>
                      : <span className="inline-flex items-center gap-1 text-xs text-gray-400"><PauseCircle size={12} /> {ad.status === 'PAUSED' ? 'Paused' : ad.status}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold text-gray-900">{formatPHP(ad.spend)}</td>
                  <td className="px-3 py-2.5 text-right text-gray-700">{ad.leads || '—'}</td>
                  <td className="px-3 py-2.5 text-right text-gray-700">{ad.msg || '—'}</td>
                  <td className="px-3 py-2.5 text-right text-gray-700">{ad.cpr != null ? formatPHP(ad.cpr) : '—'}</td>
                  <td className="px-3 py-2.5"><VerdictBadge verdict={ad.verdict} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-[11px] text-gray-400 text-center">
        "Leads" = lead form/website · "Usapan" = Messenger conversations started · Cost/Lead = spend ÷ (leads + usapan).
        Recommendations ay batay sa active ads na walang result o mas mahal nang 2.5× sa average. Final decision ay sa'yo pa rin.
      </p>
    </div>
  )
}
