import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { CreditCard, ShieldCheck } from 'lucide-react'
import { aggregateBy, formatPHP } from '../../api/lakbay'

const PALETTE_PAYMENT = {
  PAID:     '#16a34a',
  PENDING:  '#f59e0b',
  REFUNDED: '#dc2626',
  Unknown:  '#94a3b8',
}
const PALETTE_ACCOUNT = {
  ACTIVATED: '#1B4F4F',
  PENDING:   '#f59e0b',
  DEACTIVATED: '#dc2626',
  Unknown:   '#94a3b8',
}

function Donut({ data, palette, title, icon: Icon }) {
  const total = data.reduce((a, b) => a + b.count, 0)
  const enriched = data.map(d => ({ ...d, color: palette[d.name] ?? '#64748b' }))

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
      <div className="flex items-center gap-2 mb-2 text-gray-700 text-sm font-semibold">
        <Icon size={14} /> {title}
      </div>
      <div className="relative">
        <ResponsiveContainer width="100%" height={180}>
          <PieChart>
            <Pie data={enriched} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="count">
              {enriched.map((e, i) => <Cell key={i} fill={e.color} />)}
            </Pie>
            <Tooltip formatter={(v, n, p) => [`${v} (${formatPHP(p.payload.sales)})`, p.payload.name]} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900 leading-none">{total}</p>
            <p className="text-[11px] text-gray-500 mt-1">total</p>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-1.5 mt-3 pt-3 border-t border-gray-100">
        {enriched.map(d => (
          <div key={d.name} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
              <span className="text-gray-700">{d.name}</span>
            </div>
            <div className="text-gray-500">
              <span className="font-semibold text-gray-900">{d.count}</span>
              <span className="text-gray-400 mx-1">·</span>
              <span>{total > 0 ? Math.round((d.count / total) * 100) : 0}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function FunnelHealth({ records }) {
  const payment = aggregateBy(records, 'meta.payment_status')
  const account = aggregateBy(records, 'meta.account_status')
  return (
    <section>
      <h2 className="text-base font-semibold text-gray-800 mb-3">Funnel Health</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Donut data={payment} palette={PALETTE_PAYMENT} title="Payment Status" icon={CreditCard} />
        <Donut data={account} palette={PALETTE_ACCOUNT} title="Account Status" icon={ShieldCheck} />
      </div>
    </section>
  )
}
