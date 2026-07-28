// Acquisition Monthly Score Card — standalone site at /kpi.
//
// One weighted KPI scorecard per acquisition agent, per month. Everything is
// auto-computed from live YCBM + LakbayHub data EXCEPT the QA score and memo,
// which MJ types inline (saved to Supabase, synced across devices).
//
// Layout mirrors MJ's spreadsheet: gold header, KPI table (Sales KPI /
// Description / Actual / Target / Weight), a summary strip, and a KPI
// Calculator that shows the weighted breakdown + final score.

import { useEffect, useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import useKpiData, { scoreCard, weightsFor } from './useKpiData'
import { fetchKpiManual, saveKpiManual } from './kpiManual'

// --- Month helpers ----------------------------------------------------------

function currentMonthKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// Last 12 months as { key: 'YYYY-MM', label: 'July 2026' }.
function monthOptions() {
  const opts = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    opts.push({ key, label })
  }
  return opts
}

function monthLabel(key) {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

const pct = (n, digits = 0) => `${Number(n || 0).toFixed(digits)}%`

// --- Component --------------------------------------------------------------

export default function KpiApp() {
  const [month, setMonth] = useState(currentMonthKey())
  const { agents, loading, lastFetched } = useKpiData(month)
  // Weights are month-dependent (July 2026 onwards shifts Show-up/Closing).
  const WEIGHTS = weightsFor(month)

  const [selectedKey, setSelectedKey] = useState(null)
  const [manualMap, setManualMap] = useState({})
  const [saving, setSaving] = useState(false)

  // Load the month's manual inputs whenever the month changes.
  useEffect(() => {
    let alive = true
    fetchKpiManual(month).then(m => { if (alive) setManualMap(m) })
    return () => { alive = false }
  }, [month])

  // Keep a valid selection as the roster loads / month changes.
  useEffect(() => {
    if (agents.length === 0) return
    if (!agents.some(a => a.key === selectedKey)) setSelectedKey(agents[0].key)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents, month])

  const card = agents.find(a => a.key === selectedKey) || agents[0] || null
  const manual = card ? manualMap[card.key] : null
  const score = useMemo(() => (card ? scoreCard(card, manual, month) : null), [card, manual, month])

  async function persist(patch) {
    if (!card) return
    // Optimistic local update.
    setManualMap(m => ({ ...m, [card.key]: { ...(m[card.key] || {}), agent_key: card.key, month, ...patch } }))
    setSaving(true)
    try {
      await saveKpiManual(card.key, month, patch)
    } catch (err) {
      console.warn('[kpi] save failed:', err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="kpi-root">
      <KpiStyles />

      {/* Controls (hidden when printing) */}
      <div className="kpi-controls">
        <div className="kpi-ctrl">
          <label>Agent</label>
          <select value={card?.key || ''} onChange={e => setSelectedKey(e.target.value)}>
            {agents.length === 0 && <option>{loading ? 'Naglo-load…' : 'Walang agent'}</option>}
            {agents.map(a => (
              <option key={a.key} value={a.key}>{a.name}</option>
            ))}
          </select>
        </div>
        <div className="kpi-ctrl">
          <label>Buwan</label>
          <select value={month} onChange={e => setMonth(e.target.value)}>
            {monthOptions().map(o => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="kpi-ctrl-note">
          {loading ? 'Kinukuha ang live data…'
            : lastFetched ? `Live · ${agents.length} agent${agents.length === 1 ? '' : 's'}`
            : ''}
          {saving && ' · Sini-save…'}
        </div>
      </div>

      {/* The printable card */}
      <div className="kpi-card">
        {/* Gold title band */}
        <div className="kpi-band">MONTHLY&nbsp;&nbsp;|&nbsp;&nbsp;SCORE CARD</div>

        {/* Employee row */}
        <div className="kpi-emprow">
          <div className="kpi-emplabel">EMPLOYEE NAME</div>
          <div className="kpi-empname">{card ? card.name : (loading ? 'Naglo-load…' : '—')}</div>
          <button className="kpi-export" onClick={() => window.print()}>
            <Download size={16} /> Export PDF
          </button>
          <div className="kpi-month">{monthLabel(month)}</div>
        </div>

        {/* KPI table */}
        <table className="kpi-table">
          <thead>
            <tr>
              <th>Sales KPI</th>
              <th>Description</th>
              <th className="c">Actual</th>
              <th className="c">Target</th>
              <th className="c">Weight</th>
            </tr>
          </thead>
          <tbody>
            {/* Show up rate */}
            <tr>
              <td className="kpi-name">Show up rate</td>
              <td className="kpi-desc"># of Show ups / Total Bookings x 100</td>
              <td className="c kpi-actual">{card ? card.showUps : 0}</td>
              <td className="c kpi-target">{score ? score.showUpTargetPct : 30}% of {card ? card.totalBookings : 0} bookings</td>
              <td className="c kpi-weight">{WEIGHTS.showUp}%</td>
            </tr>
            {/* Closing rate */}
            <tr>
              <td className="kpi-name">Closing Rate</td>
              <td className="kpi-desc">Total Sign Ups / # Show Ups x 100</td>
              <td className="c kpi-actual">{card ? card.signUps : 0}</td>
              <td className="c kpi-target">{score ? score.closingTargetPct : 30}% of {card ? card.showUps : 0} show-ups</td>
              <td className="c kpi-weight">{WEIGHTS.closing}%</td>
            </tr>
            {/* Adventurers sign up */}
            <tr>
              <td className="kpi-name">Adventurers sign up</td>
              <td className="kpi-desc"># Adventurer Signups / Total Signups x 100</td>
              <td className="c kpi-actual">
                {card ? card.adventurer : 0} Adv.
                <div className="kpi-actual-sub">
                  {card ? card.travelpreneur : 0} TP / {card ? card.starter : 0} Str.
                </div>
              </td>
              <td className="c kpi-target">{score ? score.advTargetPct : 10}% of {score ? score.totalSignups : 0} sign-ups</td>
              <td className="c kpi-weight">{WEIGHTS.adventurer}%</td>
            </tr>
            {/* QA Score — manual */}
            <tr>
              <td className="kpi-name">QA Score</td>
              <td className="kpi-desc">QA Score Rating (manual input)</td>
              <td className="c kpi-actual">
                <div className="kpi-input-wrap">
                  <input
                    type="number" min="0" max="100" step="0.1"
                    className="kpi-input"
                    value={manual?.qa_score ?? ''}
                    placeholder="0"
                    disabled={!card}
                    onChange={e => {
                      const v = e.target.value === '' ? null : Math.max(0, Math.min(100, Number(e.target.value)))
                      persist({ qa_score: v })
                    }}
                  />
                  <span>%</span>
                </div>
              </td>
              <td className="c kpi-target">100%</td>
              <td className="c kpi-weight">{WEIGHTS.qa}%</td>
            </tr>
            {/* Memo — manual */}
            <tr>
              <td className="kpi-name">MEMO</td>
              <td className="kpi-desc">No memo = {WEIGHTS.memo}%, Has memo = 0%</td>
              <td className="c kpi-actual">
                <div className="kpi-memo-toggle">
                  <button
                    className={!manual?.has_memo ? 'on' : ''}
                    disabled={!card}
                    onClick={() => persist({ has_memo: false })}
                  >No Memo</button>
                  <button
                    className={manual?.has_memo ? 'on danger' : ''}
                    disabled={!card}
                    onClick={() => persist({ has_memo: true })}
                  >Has Memo</button>
                </div>
              </td>
              <td className="c kpi-target">No Memo</td>
              <td className="c kpi-weight">{WEIGHTS.memo}%</td>
            </tr>
          </tbody>
        </table>

        {/* Summary strip */}
        <div className="kpi-summary">
          <span>Total Bookings: <b>{card ? card.totalBookings : 0}</b></span>
          <span>Showed Up: <b>{card ? card.showUps : 0}</b></span>
          <span>Sign Ups: <b>{card ? card.signUps : 0}</b></span>
          <span>Adventurers: <b>{card ? card.adventurer : 0}</b></span>
          <span>Travelpreneur: <b>{card ? card.travelpreneur : 0}</b></span>
          <span>Starter: <b>{card ? card.starter : 0}</b></span>
          <span>QA Score: <b>{manual?.qa_score != null ? pct(manual.qa_score, 1) : '—'}</b></span>
          <span>Memo: <b>{manual?.has_memo ? 'Yes' : 'None'}</b></span>
        </div>

        {/* KPI Calculator */}
        <div className="kpi-calc-band">KPI CALCULATOR</div>
        {score && (
          <div className="kpi-calc">
            <CalcRow label="Show up rate" formula={`${card.showUps}/${card.totalBookings} = ${pct(score.showUpRate, 1)} vs ${score.showUpTargetPct}% target`}
                     weight={WEIGHTS.showUp} points={score.points.showUp} />
            <CalcRow label="Closing Rate" formula={`${card.signUps}/${card.showUps} = ${pct(score.closingRate, 1)} vs ${score.closingTargetPct}% target`}
                     weight={WEIGHTS.closing} points={score.points.closing} />
            <CalcRow label="Adventurers sign up" formula={`${card.adventurer}/${score.totalSignups} = ${pct(score.advRate, 1)} vs ${score.advTargetPct}% target`}
                     weight={WEIGHTS.adventurer} points={score.points.adventurer} />
            <CalcRow label="QA Score" formula={score.qaScore != null ? pct(score.qaScore, 1) : 'not yet rated'}
                     weight={WEIGHTS.qa} points={score.points.qa} />
            <CalcRow label="Memo" formula={score.hasMemo ? 'Has memo' : 'No memo'}
                     weight={WEIGHTS.memo} points={score.points.memo} />
            <div className="kpi-calc-total">
              <span>TOTAL KPI SCORE</span>
              <span className="kpi-total-val">{score.total.toFixed(1)}%</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function CalcRow({ label, formula, weight, points }) {
  return (
    <div className="kpi-calc-row">
      <span className="kpi-calc-label">{label}</span>
      <span className="kpi-calc-formula">{formula}</span>
      <span className="kpi-calc-weight">×{weight}%</span>
      <span className="kpi-calc-points">{points.toFixed(1)}</span>
    </div>
  )
}

// --- Styles -----------------------------------------------------------------

function KpiStyles() {
  return (
    <style>{`
    .kpi-root { min-height: 100vh; background: #eef2f6; padding: 28px 16px 60px;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #1f2937; }
    .kpi-controls { max-width: 1180px; margin: 0 auto 18px; display: flex; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
    .kpi-ctrl { display: flex; flex-direction: column; gap: 5px; }
    .kpi-ctrl label { font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #6b7280; }
    .kpi-ctrl select { min-width: 220px; padding: 9px 12px; border: 1px solid #cbd5e1; border-radius: 9px;
      font-size: 15px; font-weight: 600; background: #fff; color: #1f2937; cursor: pointer; }
    .kpi-ctrl-note { margin-left: auto; font-size: 13px; color: #64748b; font-weight: 600; padding-bottom: 9px; }

    .kpi-card { max-width: 1180px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden;
      box-shadow: 0 10px 40px rgba(15,23,42,0.10); border: 1px solid #e2e8f0; }
    .kpi-band { background: linear-gradient(90deg,#f6c33d,#f0a92a); color: #3a2c00; text-align: center;
      font-size: 26px; font-weight: 900; letter-spacing: 0.02em; padding: 18px; }

    .kpi-emprow { display: flex; align-items: stretch; border-bottom: 1px solid #e5e7eb; }
    .kpi-emplabel { background: #16233d; color: #fff; font-weight: 800; font-size: 14px; letter-spacing: 0.03em;
      display: flex; align-items: center; padding: 0 22px; }
    .kpi-empname { flex: 1; display: flex; align-items: center; padding: 16px 22px; font-size: 22px; font-weight: 700; color: #111827; }
    .kpi-export { align-self: center; margin-right: 16px; display: inline-flex; align-items: center; gap: 7px;
      background: #2b9fd6; color: #fff; border: none; border-radius: 8px; padding: 9px 16px; font-size: 14px;
      font-weight: 700; cursor: pointer; box-shadow: 0 2px 8px rgba(43,159,214,0.35); }
    .kpi-export:hover { background: #1f8ac0; }
    .kpi-month { display: flex; align-items: center; padding: 0 26px; font-size: 20px; font-weight: 800; color: #d69a1e;
      border-left: 1px solid #e5e7eb; }

    .kpi-table { width: 100%; border-collapse: collapse; }
    .kpi-table thead th { background: #dbeefb; color: #2f6fa0; font-size: 14px; font-weight: 700; padding: 12px 18px;
      text-align: left; border-bottom: 1px solid #cfe3f4; }
    .kpi-table thead th.c { text-align: center; }
    .kpi-table td { padding: 16px 18px; border-bottom: 1px solid #eef2f6; vertical-align: middle; }
    .kpi-table td.c { text-align: center; }
    .kpi-table tbody tr:nth-child(odd) td { background: #fffdf6; }
    .kpi-name { font-size: 17px; font-weight: 800; color: #1f2937; }
    .kpi-desc { font-size: 13.5px; color: #8a6d3b; }
    .kpi-actual { font-size: 20px; font-weight: 800; color: #111827; }
    .kpi-actual-sub { font-size: 12px; font-weight: 600; color: #9ca3af; margin-top: 2px; }
    .kpi-target { font-size: 15px; color: #9ca3af; font-weight: 600; }
    .kpi-weight { font-size: 17px; font-weight: 800; color: #374151; }

    .kpi-input-wrap { display: inline-flex; align-items: center; gap: 4px; }
    .kpi-input { width: 78px; padding: 7px 8px; border: 1.5px solid #2b9fd6; border-radius: 7px; font-size: 17px;
      font-weight: 800; text-align: center; color: #111827; }
    .kpi-input:focus { outline: none; box-shadow: 0 0 0 3px rgba(43,159,214,0.18); }
    .kpi-input-wrap span { font-size: 15px; font-weight: 700; color: #6b7280; }

    .kpi-memo-toggle { display: inline-flex; border: 1px solid #d1d5db; border-radius: 8px; overflow: hidden; }
    .kpi-memo-toggle button { padding: 8px 14px; font-size: 13px; font-weight: 700; border: none; background: #fff;
      color: #6b7280; cursor: pointer; }
    .kpi-memo-toggle button + button { border-left: 1px solid #d1d5db; }
    .kpi-memo-toggle button.on { background: #16a34a; color: #fff; }
    .kpi-memo-toggle button.on.danger { background: #dc2626; }

    .kpi-summary { display: flex; flex-wrap: wrap; gap: 18px; padding: 14px 22px; background: #f3f8fc;
      border-bottom: 1px solid #e5e7eb; font-size: 14px; color: #475569; }
    .kpi-summary b { color: #16233d; font-weight: 800; }

    .kpi-calc-band { background: #16233d; color: #fff; text-align: center; font-size: 18px; font-weight: 800;
      letter-spacing: 0.04em; padding: 12px; }
    .kpi-calc { padding: 10px 22px 22px; }
    .kpi-calc-row { display: grid; grid-template-columns: 1.4fr 2fr 0.6fr 0.6fr; align-items: center; gap: 10px;
      padding: 10px 4px; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
    .kpi-calc-label { font-weight: 800; color: #1f2937; }
    .kpi-calc-formula { color: #64748b; font-variant-numeric: tabular-nums; }
    .kpi-calc-weight { text-align: right; color: #94a3b8; font-weight: 700; }
    .kpi-calc-points { text-align: right; font-weight: 800; color: #2b9fd6; font-variant-numeric: tabular-nums; }
    .kpi-calc-total { display: flex; justify-content: space-between; align-items: center; margin-top: 14px;
      padding: 16px 20px; background: linear-gradient(90deg,#16233d,#24365c); color: #fff; border-radius: 10px; }
    .kpi-calc-total span:first-child { font-size: 15px; font-weight: 800; letter-spacing: 0.06em; }
    .kpi-total-val { font-size: 30px; font-weight: 900; color: #f6c33d; }

    @media print {
      .kpi-root { background: #fff; padding: 0; }
      .kpi-controls { display: none; }
      .kpi-export { display: none; }
      .kpi-card { box-shadow: none; border: none; max-width: none; }
    }
    `}</style>
  )
}
