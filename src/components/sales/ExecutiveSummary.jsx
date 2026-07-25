// Executive Summary — the CEO view. Three blocks, all from data Operations
// already computes (no new fetch):
//   1. "What changed" — plain-language MoM/WoW deltas with watch flags
//   2. Executive funnel — Spend → Leads → Show → Sales → Revenue, with the
//      biggest conversion leak highlighted
//   3. Profit & ROAS trend — trajectory over the days in the selected period
//
// Honest about data limits: per-cluster CAC and LTV aren't computable from the
// current sources, so we don't fake them.

import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { AlertTriangle, Target } from 'lucide-react'
import { formatPHP, formatPHPCompact } from '../../api/lakbay'
import { PRIMARY, ACCENT, POSITIVE, NEGATIVE } from '../../lib/theme'

function pctChange(now, prev) {
  if (!prev) return now > 0 ? 100 : 0
  return Math.round(((now - prev) / prev) * 100)
}

function dayLabel(d) {
  return new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

export default function ExecutiveSummary({ totals, prior, totalROAS, perDay = [], periodLabel, compareLabel }) {
  // --- Derived metrics (current vs prior) ---
  const revenue = totals.sales
  const spend = totals.spend
  const profit = revenue - spend
  const cac = totals.salesCount > 0 ? Math.round(spend / totals.salesCount) : null
  const showUpRate = (totals.showed + totals.noShow) > 0
    ? Math.round((totals.showed / (totals.showed + totals.noShow)) * 100) : null
  const closeRate = totals.showed > 0 ? Math.round((totals.salesCount / totals.showed) * 100) : null

  const priorROAS = prior.spend > 0 ? prior.sales / prior.spend : null
  const priorCAC = prior.salesCount > 0 ? Math.round(prior.spend / prior.salesCount) : null

  const dRevenue = pctChange(revenue, prior.sales)
  const dProfit = pctChange(profit, prior.sales - prior.spend)
  const dROAS = priorROAS ? pctChange(totalROAS ?? 0, priorROAS) : null
  const dCAC = priorCAC ? pctChange(cac ?? 0, priorCAC) : null

  // --- "What changed" narrative lines ---
  const notes = []
  if (compareLabel) {
    notes.push({
      good: dRevenue >= 0,
      text: `Revenue ${dRevenue >= 0 ? 'up' : 'down'} ${Math.abs(dRevenue)}% (${formatPHPCompact(revenue)} vs ${formatPHPCompact(prior.sales)}) ${compareLabel}.`,
    })
    if (dROAS !== null)
      notes.push({ good: dROAS >= 0, text: `ROAS ${dROAS >= 0 ? 'improved' : 'dropped'} ${Math.abs(dROAS)}% to ${totalROAS?.toFixed(2)}x.` })
    if (dCAC !== null)
      notes.push({ good: dCAC <= 0, text: `Cost per sale (CAC) ${dCAC <= 0 ? 'down' : 'up'} ${Math.abs(dCAC)}% to ${cac === null ? '—' : formatPHPCompact(cac)}.` })
    notes.push({ good: profit >= 0, text: `Profit ${profit >= 0 ? 'positive' : 'negative'} at ${formatPHPCompact(profit)} (${dProfit >= 0 ? '+' : ''}${dProfit}%).` })
  } else {
    notes.push({ good: profit >= 0, text: `Profit ${formatPHPCompact(profit)} on ${formatPHPCompact(revenue)} revenue · ROAS ${totalROAS === null ? '—' : totalROAS.toFixed(2) + 'x'}.` })
  }

  // Revenue with zero NEW closes = the money is a balance/collection of a sale
  // already counted on its down-payment date. Say so, so "0 sales · ₱X revenue"
  // never reads as a bug (a sale counts once, at close/DP — not again on the
  // balance payment).
  if (revenue > 0 && totals.salesCount === 0) {
    notes.push({ good: true, text: `Revenue ${formatPHPCompact(revenue)} is from balance collections — no NEW close in this period (a sale is counted on its down-payment date).` })
  }

  // --- Funnel + biggest-leak detection ---
  // Only flag a "leak" when there's enough concluded activity — otherwise a
  // slow day (e.g. 2 show-ups) misleadingly screams "close 0% biggest leak".
  const concluded = totals.showed + totals.noShow
  const MIN_BASE = 5
  const leaks = []
  if (showUpRate !== null && concluded >= MIN_BASE) leaks.push({ key: 'show-up', rate: showUpRate, tip: 'Maraming naka-book pero hindi sumipot. Tignan ang reminders / confirmation flow.' })
  if (closeRate !== null && totals.showed >= MIN_BASE) leaks.push({ key: 'close', rate: closeRate, tip: 'Sumisipot pero hindi bumibili. Coaching sa closing / offer.' })
  const worstLeak = leaks.length ? leaks.reduce((a, b) => (b.rate < a.rate ? b : a)) : null

  const funnel = [
    { label: 'Ad Spend',  value: formatPHPCompact(spend), bar: 100, tone: '#dbeafe' },
    { label: 'Leads (booked)', value: String(totals.leads), bar: 86, tone: '#E8F4F4', note: cac && totals.leads ? `CPL ${formatPHPCompact(Math.round(spend / totals.leads))}` : null },
    { label: 'Showed up', value: String(totals.showed), bar: 64, tone: '#d1fae5', note: showUpRate !== null ? `${showUpRate}% show-up`  : null, leak: worstLeak?.key === 'show-up' },
    { label: 'Sales',     value: String(totals.salesCount), bar: 42, tone: '#fde68a', note: closeRate !== null ? `${closeRate}% close` : null, leak: worstLeak?.key === 'close' },
    { label: 'Revenue',   value: formatPHPCompact(revenue), bar: 70, tone: '#fed7aa', note: totalROAS !== null ? `${totalROAS.toFixed(2)}x ROAS` : null },
  ]

  // --- Trend data (profit + ROAS per day in the period) ---
  const trend = perDay.map(d => ({
    label: dayLabel(d.day),
    profit: d.salesAmount - d.spend,
    roas: d.spend > 0 ? +(d.salesAmount / d.spend).toFixed(2) : 0,
  }))
  const showTrend = trend.length >= 2

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
        <Target size={18} style={{ color: PRIMARY }} />
        <h2 className="font-semibold text-gray-900">Executive Summary · {periodLabel}</h2>
      </div>

      <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* What changed */}
        <div>
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">What changed</h3>
          <ul className="flex flex-col gap-2">
            {notes.map((n, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0`} style={{ backgroundColor: n.good ? POSITIVE : NEGATIVE }} />
                <span className="text-gray-700">{n.text}</span>
              </li>
            ))}
          </ul>
          {worstLeak && (
            <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              <AlertTriangle size={15} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-[13px] text-amber-800">
                <b>Biggest leak: {worstLeak.key}</b> ({worstLeak.rate}%). {worstLeak.tip}
              </p>
            </div>
          )}
        </div>

        {/* Executive funnel */}
        <div>
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Money funnel</h3>
          <div className="flex flex-col gap-1.5">
            {funnel.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-24 text-[11px] text-gray-500 text-right flex-shrink-0">{s.label}</span>
                <div className="flex-1 h-7 rounded-md relative overflow-hidden bg-gray-50">
                  <div className="h-full rounded-md flex items-center px-2" style={{ width: `${s.bar}%`, backgroundColor: s.leak ? '#fecaca' : s.tone }}>
                    <span className="text-xs font-bold text-gray-800">{s.value}</span>
                  </div>
                </div>
                <span className="w-24 text-[10px] text-gray-400 flex-shrink-0">
                  {s.leak && <AlertTriangle size={10} className="inline mr-0.5 text-red-500" />}{s.note || ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Profit & ROAS trend */}
      {showTrend && (
        <div className="px-5 pb-5">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Profit &amp; ROAS trend · {periodLabel}</h3>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={trend} margin={{ top: 5, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis yAxisId="left" tick={{ fontSize: 10 }} tickFormatter={formatPHPCompact} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={v => `${v}x`} />
              <Tooltip formatter={(v, name) => name === 'ROAS' ? `${v}x` : formatPHP(v)} />
              <ReferenceLine yAxisId="left" y={0} stroke="#d1d5db" />
              <Bar yAxisId="left" dataKey="profit" name="Profit" radius={[3, 3, 0, 0]}
                   fill={PRIMARY} />
              <Line yAxisId="right" type="monotone" dataKey="roas" name="ROAS" stroke={ACCENT} strokeWidth={2.5} dot={{ r: 2 }} />
            </ComposedChart>
          </ResponsiveContainer>
          <p className="text-[10px] text-gray-400 mt-1">Bars = daily profit (revenue − spend) · line = ROAS. Negatibong bar = lugi sa araw na ’yon.</p>
        </div>
      )}
    </section>
  )
}
