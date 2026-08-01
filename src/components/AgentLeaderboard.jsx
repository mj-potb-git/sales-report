// Reusable per-agent (and per-team) leaderboard + client drill-down.
// Same look/behavior as the Acquisition tab's Agents/Teams view, but pulled out
// so any tab (Acquisition, AACIO) can reuse it against its own record set.
//
//   records    — ALL dated sales records for this audience (drill-down filters
//                by agent + the selected period internally).
//   customers  — invoice customers (getInvoiceCustomers / getExternalInvoiceCustomers)
//                for the per-client payment history in the drill-down.
//   periodId / monthKey / customDates — the SAME period filter the parent uses,
//                so a clicked agent shows exactly that window's sales.
import { useMemo, useState } from 'react'
import { ChevronRight, ArrowLeft, Search, TrendingUp, Users } from 'lucide-react'
import { periodRange, periodLabelFor } from '../lib/periods'
import { sum, totalsByAgent, totalsByTeam, formatPHP, formatPHPCompact } from '../api/lakbay'

const PRIMARY = '#1B4F4F'

function SummaryCard({ icon: Icon, label, value }) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-col gap-2">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#E8F4F4' }}>
        <Icon size={18} style={{ color: PRIMARY }} />
      </div>
      <div>
        <p className="text-xl font-bold text-gray-900 truncate">{value}</p>
        <p className="text-xs text-gray-500 mt-0.5">{label}</p>
      </div>
    </div>
  )
}

// One agent's clients within the selected period — one row per client, with the
// amount paid THIS period, plus any payments in other months (indicator only).
function AgentDetail({ agent, allRecords, customers = [], periodId, monthKey, customDates = [], onBack }) {
  const isCustom = periodId === 'custom' && customDates.length > 0
  const fromKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d) }
  let start, end, periodLabel
  if (isCustom) {
    const s = [...customDates].sort()
    start = fromKey(s[0]); start.setHours(0, 0, 0, 0)
    end = fromKey(s[s.length - 1]); end.setHours(23, 59, 59, 999)
    periodLabel = customDates.length === 1 ? '1 custom day' : `${customDates.length} custom days`
  } else {
    const base = periodRange(periodId, monthKey); start = base.start; end = base.end
    periodLabel = periodLabelFor(periodId, monthKey)
  }
  const customSet = new Set(customDates)
  const filtered = allRecords
    .filter(r => r.sales_agent === agent.name && r.date)
    .filter(r => {
      const t = new Date(r.date).getTime()
      if (t < start.getTime() || t > end.getTime()) return false
      return !isCustom || customSet.has(r.date)
    })
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))

  const totalSales = sum(filtered, 'sales_amount')
  const fmtDate = (d) => d ? new Date(d + (String(d).length <= 10 ? 'T00:00:00' : '')).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
  const coachCustomers = customers.filter(c => c.coach === agent.name)
  const custByEmail = new Map(coachCustomers.map(c => [(c.email || '').toLowerCase(), c]))
  const custByName  = new Map(coachCustomers.map(c => [(c.customer_name || '').toLowerCase(), c]))
  const clientMap = new Map()
  for (const r of filtered) {
    const key = ((r.meta?.email || r.customer_name || '').toLowerCase()).trim()
    if (!clientMap.has(key)) {
      const cust = custByEmail.get((r.meta?.email || '').toLowerCase())
               || custByName.get((r.customer_name || '').toLowerCase()) || null
      clientMap.set(key, { record: r, cust, periodAmount: 0, periodPayments: [] })
    }
    const e = clientMap.get(key)
    e.periodAmount += (r.sales_amount || 0)
    e.periodPayments.push(r)
  }
  const clientRows = [...clientMap.values()]
    .sort((a, b) => (b.record.date || '').localeCompare(a.record.date || ''))
  const periodInvoiceIds = new Set(filtered.map(r => r.transaction_id))
  const otherMonthPayments = (c) =>
    (c?.invoices || []).filter(i => i.isPaid && i.paidDate && !periodInvoiceIds.has(i.invoice_id))
  const typeLabel = (t) => t === 'down_payment' ? 'DP' : t === 'full' ? 'Full' : t === 'balance' ? 'Balance' : 'Pay'

  return (
    <div className="flex flex-col gap-4 pb-24 sm:pb-6">
      <button onClick={onBack} className="self-start flex items-center gap-1 text-sm text-gray-500 hover:text-[#1B4F4F] transition-colors">
        <ArrowLeft size={14} /> Back to agents
      </button>

      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-lg font-bold" style={{ backgroundColor: PRIMARY }}>
            {agent.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-lg font-bold text-gray-900">{agent.name}</p>
            <p className="text-sm text-gray-500">{agent.team}</p>
          </div>
          <span className="ml-auto text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">{periodLabel}</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-5">
          <SummaryCard icon={TrendingUp} label={`Sales · ${periodLabel}`} value={formatPHP(totalSales)} />
          <SummaryCard icon={Users}      label="Clients"                  value={String(clientRows.length)} />
          <SummaryCard icon={Users}      label="Payments"                 value={String(filtered.length)} />
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-700">Clients ({clientRows.length}) · {periodLabel}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">Isang row bawat kliyente. Ang bilang dito = bayad sa {periodLabel} LANG. Kung may bayad sa ibang buwan (hal. full sa July), nasa "Other months" — doon bibilangin.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                {['Customer', 'Package', `Paid · ${periodLabel}`, 'Other months', `${periodLabel} total`].map(h => (
                  <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {clientRows.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No clients in the selected filter.</td></tr>
              ) : clientRows.map(({ record, cust, periodAmount, periodPayments }) => {
                const others = otherMonthPayments(cust)
                const pkg = ((cust?.package || record.meta?.package || '').replace(/\s*package\s*/i, '').trim()) || '—'
                return (
                  <tr key={record.transaction_id} className="hover:bg-gray-50 align-top">
                    <td className="px-4 py-2.5 text-gray-800">{record.customer_name}</td>
                    <td className="px-4 py-2.5 text-gray-500">{pkg}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {periodPayments.map((r, i) => (
                        <div key={i}>
                          <span className="font-semibold text-gray-800">{typeLabel(r.meta?.payment_type)} {formatPHP(r.sales_amount)}</span>
                          <span className="text-[11px] text-gray-400"> · {fmtDate(r.date)}</span>
                        </div>
                      ))}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {others.length === 0
                        ? <span className="text-gray-300">—</span>
                        : others.map((i, idx) => (
                            <div key={idx} className="text-[11px] text-amber-600">
                              {typeLabel(i.paymentType)} {formatPHP(i.amount)} · {fmtDate(i.paidDate)}
                            </div>
                          ))}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap font-semibold text-gray-900">
                      {formatPHP(periodAmount)}
                      {cust && !cust.isFullyPaid && <div className="text-[10px] text-amber-600 font-semibold">not fully paid</div>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {clientRows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td className="px-4 py-2.5 font-semibold text-gray-700" colSpan={4}>TOTAL · {periodLabel} ({clientRows.length} client{clientRows.length > 1 ? 's' : ''})</td>
                  <td className="px-4 py-2.5 font-bold whitespace-nowrap" style={{ color: PRIMARY }}>{formatPHP(totalSales)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}

// A team (cluster) → list its agents ranked, clickable into AgentDetail.
function TeamDetail({ team, onBack, onAgentClick }) {
  return (
    <div className="flex flex-col gap-4">
      <button onClick={onBack} className="self-start flex items-center gap-1 text-sm text-gray-500 hover:text-[#1B4F4F] transition-colors">
        <ArrowLeft size={14} /> Back to teams
      </button>
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <p className="text-lg font-bold text-gray-900">{team.name}</p>
        <p className="text-sm text-gray-500">{team.agents.length} agents · {formatPHP(team.sales)}</p>
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100"><p className="text-sm font-semibold text-gray-700">Agent Ranking</p></div>
        <div className="divide-y divide-gray-50">
          {team.agents.map((a, i) => (
            <button key={a.name} onClick={() => onAgentClick(a)}
              className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-3">
                <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${
                  i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-gray-200 text-gray-700' : i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'
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

export default function AgentLeaderboard({
  records = [], rangedRecords = [], customers = [],
  periodId, monthKey, customDates = [], periodLabel,
  title = 'Per-Agent Leaderboard', subtitle,
}) {
  const [view, setView] = useState('agents')
  const [search, setSearch] = useState('')
  const [selectedAgent, setSelectedAgent] = useState(null)
  const [selectedTeam, setSelectedTeam] = useState(null)

  const byAgent = useMemo(() => totalsByAgent(rangedRecords), [rangedRecords])
  const byTeam  = useMemo(() => totalsByTeam(rangedRecords),  [rangedRecords])

  if (selectedAgent) {
    return <AgentDetail agent={selectedAgent} allRecords={records} customers={customers}
      periodId={periodId} monthKey={monthKey} customDates={customDates}
      onBack={() => setSelectedAgent(null)} />
  }
  if (selectedTeam) {
    return <TeamDetail team={selectedTeam} onBack={() => setSelectedTeam(null)} onAgentClick={setSelectedAgent} />
  }

  const filteredAgents = byAgent.filter(a => !search || a.name.toLowerCase().includes(search.toLowerCase()))
  const filteredTeams  = byTeam.filter(t => !search || t.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
          {(subtitle || periodLabel) && <p className="text-[11px] text-gray-400 mt-0.5">{subtitle || `Per-agent sales · ${periodLabel}`}</p>}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
            {['agents', 'teams'].map(t => (
              <button key={t} onClick={() => setView(t)}
                className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all capitalize ${
                  view === t ? 'bg-white text-[#1B4F4F] shadow-sm font-semibold' : 'text-gray-500 hover:text-gray-700'
                }`}>{t}</button>
            ))}
          </div>
          <div className="relative flex-1 sm:max-w-xs min-w-[140px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={`Search ${view}…`}
              className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#1B4F4F] transition-colors" />
          </div>
        </div>
      </div>

      {view === 'agents' ? (<>
        {/* Desktop leaderboard */}
        <div className="hidden sm:block overflow-x-auto">
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
                <tr key={a.name} onClick={() => setSelectedAgent(a)} className="cursor-pointer hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-2.5">
                    <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${
                      i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-gray-200 text-gray-700' : i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'
                    }`}>{i + 1}</span>
                  </td>
                  <td className="px-4 py-2.5 font-medium text-gray-900">{a.name}</td>
                  <td className="px-4 py-2.5 text-gray-500"><span className="px-2 py-0.5 bg-teal-50 text-teal-700 rounded-md text-xs">{a.team}</span></td>
                  <td className="px-4 py-2.5 font-semibold text-gray-900">{formatPHP(a.sales)}</td>
                  <td className="px-4 py-2.5 text-gray-600">{a.signups}</td>
                  <td className="px-4 py-2.5 text-gray-500">{a.txnCount}</td>
                  <td className="px-4 py-2.5"><ChevronRight size={14} className="text-gray-400" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Mobile cards */}
        <div className="sm:hidden flex flex-col gap-2">
          {filteredAgents.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-400">No agents match</div>
          ) : filteredAgents.map((a, i) => (
            <button key={a.name} onClick={() => setSelectedAgent(a)}
              className="w-full text-left bg-white rounded-2xl border border-gray-100 shadow-sm p-3.5 flex items-center gap-3">
              <span className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0 ${
                i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-gray-200 text-gray-700' : i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'
              }`}>{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-900 truncate">{a.name}</p>
                <p className="text-xs text-gray-500 truncate">{a.team} · {a.signups} sign-ups · {a.txnCount} txns</p>
              </div>
              <p className="font-bold text-gray-900 flex-shrink-0">{formatPHPCompact(a.sales)}</p>
              <ChevronRight size={16} className="text-gray-400 flex-shrink-0" />
            </button>
          ))}
        </div>
      </>) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filteredTeams.length === 0 ? (
            <div className="col-span-full text-center py-8 text-gray-400">No teams match</div>
          ) : filteredTeams.map((t, i) => (
            <button key={t.name} onClick={() => setSelectedTeam(t)}
              className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-left hover:border-[#1B4F4F] hover:shadow transition-all">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${
                      i === 0 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'
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
  )
}
