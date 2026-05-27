import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

// Compact "+12% vs yesterday" / "-5% vs last week" indicator
export default function DeltaBadge({ delta, label, size = 'sm' }) {
  if (delta === null || delta === undefined || Number.isNaN(delta)) return null
  const up   = delta > 0
  const down = delta < 0
  const Icon = up ? TrendingUp : down ? TrendingDown : Minus
  const tone = up   ? 'text-emerald-600 bg-emerald-50'
             : down ? 'text-red-600 bg-red-50'
             :        'text-gray-500 bg-gray-50'
  const cls  = size === 'sm' ? 'text-[11px] px-1.5 py-0.5' : 'text-xs px-2 py-1'
  return (
    <span className={`inline-flex items-center gap-1 rounded-md font-semibold ${tone} ${cls}`}>
      <Icon size={11} />
      {Math.abs(delta)}%{label ? ` ${label}` : ''}
    </span>
  )
}
