import { useMemo } from 'react'
import { Lightbulb, AlertTriangle, TrendingUp, Zap } from 'lucide-react'
import {
  filterByRange, rangeFor, sameDayLastWeek, sum,
  paceProjection, lastSignupByCluster, aggregateBy,
  formatPHP, formatPHPCompact,
} from '../../api/lakbay'
import { getSettings } from '../../lib/settings'

// Returns an array of { tone, Icon, text } cards to surface as quick insights
function deriveInsights(records, target) {
  const insights = []
  const now = new Date()

  // Today vs same day last week
  const today  = rangeFor('daily', now)
  const lwDay  = sameDayLastWeek(now)
  const ts     = sum(filterByRange(records, today.start, today.end), 'sales_amount')
  const lws    = sum(filterByRange(records, lwDay.start, lwDay.end), 'sales_amount')
  if (lws > 0) {
    const diff = Math.round(((ts - lws) / lws) * 100)
    if (Math.abs(diff) >= 20) {
      insights.push({
        tone: diff > 0 ? 'good' : 'warn',
        Icon: TrendingUp,
        text: `Today is ${diff > 0 ? '+' : ''}${diff}% ${diff > 0 ? 'ahead of' : 'behind'} the same day last week (${formatPHPCompact(ts)} vs ${formatPHPCompact(lws)}).`,
      })
    }
  }

  // Dormant clusters
  const clusters = lastSignupByCluster(records)
  const dormant  = clusters.filter(c => c.daysSinceLast >= 7)
  if (dormant.length > 0) {
    insights.push({
      tone: 'warn',
      Icon: AlertTriangle,
      text: `${dormant.length} cluster${dormant.length === 1 ? '' : 's'} ha${dormant.length === 1 ? 's' : 've'} had no sign-ups in 7+ days: ${dormant.map(c => c.name).join(', ')}.`,
    })
  }

  // Pace vs monthly target
  const p = paceProjection(records, target, now)
  if (p.targetPercent >= 100) {
    insights.push({
      tone: 'good',
      Icon: Zap,
      text: `🎉 Monthly target HIT! At ${p.targetPercent}% with ${p.daysInMonth - p.daysElapsed} day(s) remaining.`,
    })
  } else if (p.paceVsTarget >= 0) {
    insights.push({
      tone: 'good',
      Icon: TrendingUp,
      text: `Ahead of target pace by ${formatPHPCompact(p.paceVsTarget)}. Projected to finish at ${formatPHPCompact(p.projected)} (${Math.round((p.projected / target) * 100)}% of target).`,
    })
  } else {
    insights.push({
      tone: 'warn',
      Icon: AlertTriangle,
      text: `Behind target by ${formatPHPCompact(Math.abs(p.paceVsTarget))}. Need ${formatPHPCompact(Math.max(0, (target - p.mtd) / Math.max(1, p.daysInMonth - p.daysElapsed)))}/day for the rest of the month.`,
    })
  }

  // Top package this month
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const mtd = filterByRange(records, monthStart, now)
  const topPackage = aggregateBy(mtd, 'meta.package')[0]
  if (topPackage) {
    insights.push({
      tone: 'info',
      Icon: Lightbulb,
      text: `Top package this month: "${topPackage.name}" — ${topPackage.count} sold for ${formatPHP(topPackage.sales)}.`,
    })
  }

  // Pending payments value
  const pending = mtd.filter(r => r.meta?.payment_status === 'PENDING')
  if (pending.length > 0) {
    insights.push({
      tone: 'info',
      Icon: Lightbulb,
      text: `${pending.length} pending payment${pending.length === 1 ? '' : 's'} worth ${formatPHPCompact(sum(pending, 'sales_amount'))} — follow up to convert.`,
    })
  }

  return insights
}

export default function SmartInsights({ records }) {
  const { monthlyTarget } = getSettings()
  const insights = useMemo(() => deriveInsights(records, monthlyTarget), [records, monthlyTarget])
  if (insights.length === 0) return null

  const tones = {
    good: 'bg-emerald-50 border-emerald-100 text-emerald-800',
    warn: 'bg-amber-50  border-amber-100  text-amber-800',
    info: 'bg-blue-50   border-blue-100   text-blue-800',
  }

  return (
    <section>
      <h2 className="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">
        <Lightbulb size={15} className="text-amber-500" /> Smart Insights
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {insights.map((ins, i) => (
          <div key={i} className={`flex items-start gap-2 p-3 rounded-xl border text-sm ${tones[ins.tone]}`}>
            <ins.Icon size={15} className="mt-0.5 flex-shrink-0" />
            <span>{ins.text}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
