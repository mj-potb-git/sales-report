// Ads tab — per-ad Meta performance with turn-off + scale recommendations.
// Each ad links straight to Meta Ads Manager so it can be toggled there.
import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Megaphone, AlertTriangle, TrendingUp, Wallet, Target, RefreshCw,
  PauseCircle, ExternalLink, Rocket, PlayCircle, ShoppingCart, Coins,
} from 'lucide-react'
import { fetchAdPerformance } from '../api/metaAds'
import { formatPHP, formatPHPCompact } from '../api/lakbay'
import PeriodBar from './PeriodBar'
import { periodRange, periodLabelFor, currentMonthKey, UNIFORM_PERIODS } from '../lib/periods'

const TEAL = '#1B4F4F'
const GOLD = '#F5A623'

const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const VERDICT_STYLE = {
  off:    { cls: 'bg-red-100 text-red-700',         dot: 'bg-red-500' },
  watch:  { cls: 'bg-amber-100 text-amber-700',     dot: 'bg-amber-500' },
  winner: { cls: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  ok:     { cls: 'bg-gray-100 text-gray-600',       dot: 'bg-gray-400' },
  paused: { cls: 'bg-gray-100 text-gray-400',       dot: 'bg-gray-300' },
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

// Ad name as a link to Meta Ads Manager (new tab) when we have a deep link.
function AdName({ ad }) {
  if (!ad.link) return <span className="font-medium text-gray-800">{ad.name}</span>
  return (
    <a href={ad.link} target="_blank" rel="noopener noreferrer"
      className="font-medium text-[#1B4F4F] hover:underline inline-flex items-center gap-1 group">
      <span className="truncate">{ad.name}</span>
      <ExternalLink size={12} className="opacity-50 group-hover:opacity-100 flex-shrink-0" />
    </a>
  )
}

export default function AdsTab() {
  const [periodId, setPeriodId] = useState('month')
  const [monthKey, setMonthKey] = useState(currentMonthKey())
  const [customDates, setCustomDates] = useState([])
  const isCustom = periodId === 'custom' && customDates.length > 0

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  const range = useMemo(() => {
    if (isCustom) {
      const sorted = [...customDates].sort()
      return { since: sorted[0], until: sorted[sorted.length - 1] }
    }
    const { start, end } = periodRange(periodId, monthKey)
    // cap the range end at today (Meta ignores future days anyway)
    const today = new Date()
    const until = end.getTime() > today.getTime() ? today : end
    return { since: ymd(start), until: ymd(until) }
  }, [isCustom, customDates, periodId, monthKey])

  const load = useCallback(async (r, background = false) => {
    if (background) setRefreshing(true); else setLoading(true)
    try {
      const res = await fetchAdPerformance(r)
      setData(res); setError(null)
    } catch (e) { setError(e) }
    finally { setLoading(false); setRefreshing(false) }
  }, [])

  useEffect(() => { load(range) }, [range, load])

  const periodLabel = isCustom
    ? (customDates.length === 1 ? '1 custom day' : `${customDates.length} custom days`)
    : periodLabelFor(periodId, monthKey)

  return (
    <div className="flex flex-col gap-5 max-w-6xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2" style={{ color: TEAL }}>
            <Megaphone size={20} /> Ads Performance
          </h2>
          <p className="text-sm text-gray-400">Meta Ads — which ads earn purchases (scale these), bring cheap leads, or should be turned off · {periodLabel}</p>
        </div>
        <button onClick={() => load(range, true)} disabled={refreshing}
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 self-start" title="Refresh">
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Period selector — same model as the sales tabs */}
      <PeriodBar
        periods={UNIFORM_PERIODS}
        periodId={periodId} onPeriod={setPeriodId}
        monthKey={monthKey} onMonth={setMonthKey}
        customDates={customDates} isCustom={isCustom}
        onApplyCustom={(dates) => { setCustomDates(dates); setPeriodId('custom') }}
      />

      {loading && !data ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-24" />)}</div>
          <div className="skeleton h-64" />
        </>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
          <p className="text-red-700 font-semibold">Couldn't load Ads data</p>
          <p className="text-red-500 text-sm mt-1">{error.message}</p>
          <p className="text-gray-500 text-xs mt-2">Check the Meta token in Settings — it may have expired.</p>
        </div>
      ) : (() => {
        const { summary, ads, toTurnOff, winners, toTurnOn, purchaseWinners = [] } = data
        return (
          <>
            {/* Summary KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <Kpi icon={Wallet} label="Total Spend" value={formatPHPCompact(summary.totalSpend)} sub={`${summary.activeCount} active / ${summary.adCount} ads`} />
              <Kpi icon={ShoppingCart} label="Purchases" value={summary.totalPurchases.toLocaleString()} sub={summary.cpp ? `${formatPHP(summary.cpp)} / purchase` : 'from Meta pixel'} accent="#059669" />
              <Kpi icon={Coins} label="Revenue (kinita)" value={formatPHPCompact(summary.totalRevenue)} sub={summary.roas ? `${summary.roas.toFixed(2)}× ROAS` : 'no tracked sales'} accent="#059669" />
              <Kpi icon={Target} label="Leads + Chats" value={summary.totalResults.toLocaleString()} sub={`${summary.totalLeads} leads · ${summary.totalMsg} chats`} accent={GOLD} />
              <Kpi icon={TrendingUp} label="Avg Cost / Lead" value={summary.avgCpr ? formatPHP(summary.avgCpr) : '—'} sub="spend ÷ (leads + chats)" />
              <Kpi icon={AlertTriangle} label="Turn Off" value={summary.turnOffCount} sub={`~${formatPHPCompact(summary.wastedSpend)} wasted`} accent="#DC2626" />
            </div>

            {/* PURCHASE WINNERS — the ads that actually drove sales. Scale these. */}
            <section className="bg-white rounded-2xl border border-emerald-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2 bg-emerald-50/50">
                <ShoppingCart size={16} className="text-emerald-600" />
                <h3 className="font-semibold text-gray-900">Scale these — most purchases ({purchaseWinners.length})</h3>
                <span className="text-[11px] text-gray-500 ml-auto hidden sm:inline">ads na may aktwal na purchases + kita — i-scale up 'to</span>
              </div>
              {purchaseWinners.length === 0 ? (
                <p className="text-sm text-gray-400 py-6 text-center px-4">Walang na-track na purchase sa period na 'to (galing sa Meta pixel). Subukan ang mas mahabang range.</p>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {purchaseWinners.slice(0, 10).map(ad => (
                    <li key={ad.id} className="px-5 py-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <AdName ad={ad} />
                        <p className="text-xs text-gray-400 truncate">{ad.campaign}</p>
                        <p className="text-xs text-emerald-700 mt-0.5">
                          🛒 {ad.purchases} purchase{ad.purchases === 1 ? '' : 's'}
                          {ad.cpp != null ? ` · ${formatPHP(ad.cpp)}/purchase` : ''}
                          {ad.status !== 'ACTIVE' ? ` · ⏸ ${ad.status === 'PAUSED' ? 'paused — consider turning on' : ad.status.toLowerCase()}` : ''}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-bold text-emerald-700">{formatPHP(ad.revenue)}</p>
                        <p className="text-xs text-gray-500">
                          {ad.roas != null ? `${ad.roas.toFixed(2)}× ROAS` : '—'} · {formatPHP(ad.spend)} spend
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Turn-off recommendations */}
            <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
                <AlertTriangle size={16} className="text-red-500" />
                <h3 className="font-semibold text-gray-900">Turn these off ({toTurnOff.length})</h3>
                <span className="text-[11px] text-gray-500 ml-auto">active ads that are expensive or get no leads — {formatPHP(summary.wastedSpend)} this period</span>
              </div>
              {toTurnOff.length === 0 ? (
                <p className="text-sm text-gray-400 py-6 text-center">🎉 Nothing to turn off — your active ads are performing well!</p>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {toTurnOff.map(ad => (
                    <li key={ad.id} className="px-5 py-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <AdName ad={ad} />
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

            {/* Turn ON — paused ads with a strong lifetime record */}
            {toTurnOn && toTurnOn.length > 0 && (
              <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
                  <PlayCircle size={16} className="text-blue-600" />
                  <h3 className="font-semibold text-gray-900">Turn these on ({toTurnOn.length})</h3>
                  <span className="text-[11px] text-gray-500 ml-auto">currently off, but strong lifetime record (cheap cost/lead + volume)</span>
                </div>
                <ul className="divide-y divide-gray-50">
                  {toTurnOn.slice(0, 10).map(ad => (
                    <li key={ad.id} className="px-5 py-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <AdName ad={ad} />
                        <p className="text-xs text-gray-400 truncate">{ad.campaign}</p>
                        <p className="text-xs text-blue-600 mt-0.5">▶ Lifetime: {ad.histResults} results at {formatPHP(ad.histCpr)}/lead</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-bold text-blue-700">{formatPHP(ad.histCpr)}/lead</p>
                        <p className="text-xs text-gray-500">{formatPHP(ad.histSpend)} lifetime spend</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Winners — scale these */}
            {winners.length > 0 && (
              <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
                  <Rocket size={16} className="text-emerald-600" />
                  <h3 className="font-semibold text-gray-900">Scale these — top performers ({winners.length})</h3>
                  <span className="text-[11px] text-gray-500 ml-auto">cheap cost/lead + good volume</span>
                </div>
                <ul className="divide-y divide-gray-50">
                  {winners.slice(0, 8).map(ad => (
                    <li key={ad.id} className="px-5 py-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <AdName ad={ad} />
                        <p className="text-xs text-gray-400 truncate">{ad.campaign}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-bold text-emerald-700">{formatPHP(ad.cpr)}/lead</p>
                        <p className="text-xs text-gray-500">{ad.results} results · {formatPHP(ad.spend)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Full ads table */}
            <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
                <h3 className="font-semibold text-gray-900">All ads ({ads.length})</h3>
                <span className="text-[11px] text-gray-500 flex items-center gap-3">
                  <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Winner</span>
                  <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Watch</span>
                  <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Turn off</span>
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-400 text-xs uppercase tracking-wide border-b border-gray-100">
                      <th className="px-4 py-2 font-semibold">Ad</th>
                      <th className="px-3 py-2 font-semibold">Status</th>
                      <th className="px-3 py-2 font-semibold text-right">Spend</th>
                      <th className="px-3 py-2 font-semibold text-right">Purchases</th>
                      <th className="px-3 py-2 font-semibold text-right">Revenue</th>
                      <th className="px-3 py-2 font-semibold text-right">ROAS</th>
                      <th className="px-3 py-2 font-semibold text-right">Leads</th>
                      <th className="px-3 py-2 font-semibold text-right">Chats</th>
                      <th className="px-3 py-2 font-semibold text-right">Cost/Lead</th>
                      <th className="px-3 py-2 font-semibold text-right">CTR</th>
                      <th className="px-3 py-2 font-semibold text-right">Freq</th>
                      <th className="px-3 py-2 font-semibold">Verdict</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ads.map(ad => (
                      <tr key={ad.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                        <td className="px-4 py-2.5 max-w-[240px]">
                          <div className="truncate"><AdName ad={ad} /></div>
                          <p className="text-[11px] text-gray-400 truncate">{ad.campaign}</p>
                        </td>
                        <td className="px-3 py-2.5">
                          {ad.status === 'ACTIVE'
                            ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">● Active</span>
                            : <span className="inline-flex items-center gap-1 text-xs text-gray-400"><PauseCircle size={12} /> {ad.status === 'PAUSED' ? 'Paused' : ad.status === 'CAMPAIGN_PAUSED' ? 'Campaign off' : ad.status === 'ARCHIVED' ? 'Archived' : ad.status}</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold text-gray-900">{formatPHP(ad.spend)}</td>
                        <td className="px-3 py-2.5 text-right font-semibold text-emerald-700">{ad.purchases || '—'}</td>
                        <td className="px-3 py-2.5 text-right text-emerald-700">{ad.revenue ? formatPHP(ad.revenue) : '—'}</td>
                        <td className="px-3 py-2.5 text-right text-gray-700">{ad.roas != null ? `${ad.roas.toFixed(2)}×` : '—'}</td>
                        <td className="px-3 py-2.5 text-right text-gray-700">{ad.leads || '—'}</td>
                        <td className="px-3 py-2.5 text-right text-gray-700">{ad.msg || '—'}</td>
                        <td className="px-3 py-2.5 text-right text-gray-700">{ad.cpr != null ? formatPHP(ad.cpr) : '—'}</td>
                        <td className="px-3 py-2.5 text-right text-gray-500">{ad.ctr ? `${ad.ctr.toFixed(2)}%` : '—'}</td>
                        <td className="px-3 py-2.5 text-right text-gray-500">{ad.frequency ? ad.frequency.toFixed(1) : '—'}</td>
                        <td className="px-3 py-2.5"><VerdictBadge verdict={ad.verdict} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Per-campaign rollup */}
            {data.campaigns.length > 1 && (
              <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100">
                  <h3 className="font-semibold text-gray-900">By campaign</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-400 text-xs uppercase tracking-wide border-b border-gray-100">
                        <th className="px-4 py-2 font-semibold">Campaign</th>
                        <th className="px-3 py-2 font-semibold text-right">Ads</th>
                        <th className="px-3 py-2 font-semibold text-right">Spend</th>
                        <th className="px-3 py-2 font-semibold text-right">Purchases</th>
                        <th className="px-3 py-2 font-semibold text-right">Revenue</th>
                        <th className="px-3 py-2 font-semibold text-right">ROAS</th>
                        <th className="px-3 py-2 font-semibold text-right">Leads+Chats</th>
                        <th className="px-3 py-2 font-semibold text-right">Cost/Lead</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.campaigns.map(c => (
                        <tr key={c.campaign} className="border-b border-gray-50 hover:bg-gray-50/50">
                          <td className="px-4 py-2.5 font-medium text-gray-800 max-w-[320px] truncate">{c.campaign}</td>
                          <td className="px-3 py-2.5 text-right text-gray-500">{c.ads}</td>
                          <td className="px-3 py-2.5 text-right font-semibold text-gray-900">{formatPHP(c.spend)}</td>
                          <td className="px-3 py-2.5 text-right font-semibold text-emerald-700">{c.purchases || '—'}</td>
                          <td className="px-3 py-2.5 text-right text-emerald-700">{c.revenue ? formatPHP(c.revenue) : '—'}</td>
                          <td className="px-3 py-2.5 text-right text-gray-700">{c.roas != null ? `${c.roas.toFixed(2)}×` : '—'}</td>
                          <td className="px-3 py-2.5 text-right text-gray-700">{c.results}</td>
                          <td className="px-3 py-2.5 text-right text-gray-700">{c.cpr != null ? formatPHP(c.cpr) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            <p className="text-[11px] text-gray-400 text-center">
              "Purchases" &amp; "Revenue" = Meta pixel-attributed purchases (omni_purchase) + their value — this is Meta's attribution and may differ from LakbayHub actuals. ROAS = revenue ÷ spend.
              "Leads" = lead form/website · "Chats" = Messenger conversations · Cost/Lead = spend ÷ (leads + chats) · CTR = link clicks ÷ impressions · Freq = avg times shown per person (≥4 = fatigue).
              Click an ad name to open it in Meta Ads Manager. The final decision is yours.
            </p>
          </>
        )
      })()}
    </div>
  )
}
