// Operations dashboard alerts — surfaces urgent ops-side issues
// (data freshness, ROAS drops, dormant clusters, low show-up, ad waste,
// rate limits, target risk). Works alongside the existing Sales-tab
// SmartInsights (which focuses on sales/funnel insights).

import { Sparkles, AlertTriangle, TrendingUp, TrendingDown, Zap, Lightbulb, CheckCircle2, BellOff } from 'lucide-react'
import { formatPHPCompact } from '../../api/lakbay'

function Pill({ tone, Icon, title, body }) {
  const tones = {
    danger: 'bg-red-50 border-red-200 text-red-900',
    warn:   'bg-amber-50 border-amber-200 text-amber-900',
    good:   'bg-emerald-50 border-emerald-200 text-emerald-900',
    info:   'bg-blue-50 border-blue-200 text-blue-900',
  }
  return (
    <div className={`flex items-start gap-2.5 p-3 rounded-xl border text-sm ${tones[tone]}`}>
      <Icon size={15} className="mt-0.5 flex-shrink-0" />
      <div className="min-w-0">
        <p className="font-semibold leading-tight">{title}</p>
        {body && <p className="text-xs mt-0.5 opacity-90">{body}</p>}
      </div>
    </div>
  )
}

/**
 * Inputs:
 *   totals      = window totals { bookings, sales, salesCount, spend, leads, showed, noShow, cancelled }
 *   perDay      = per-day rows (with .leads, .spend, .salesAmount, .roas, .cpl, .arPct, .showUpPct...)
 *   delta       = period-over-period % { sales, bookings, spend, leads }
 *   period      = { id, label, compareLabel, days }
 *   metaError   = error object from Meta fetch (if any)
 *   ycbmRefreshing = bool
 *   ratesPaused = bool (LakbayHub rate-limited)
 */
export default function OpsAlerts({
  totals = {}, perDay = [], delta = {}, period = {},
  metaError = null, ratesPaused = false,
  overallShowUpRate = null, overallBookToSale = 0,
  totalAttendance = 0,
}) {
  const alerts = []

  // --- Data freshness / connection ----------------------------------------
  if (metaError) {
    alerts.push({
      tone: 'danger',
      Icon: AlertTriangle,
      title: 'Meta Ads disconnected',
      body: 'Token expired or invalid. Settings tab → Meta Ads Connection → follow the recovery guide.',
    })
  }
  if (ratesPaused) {
    alerts.push({
      tone: 'warn',
      Icon: BellOff,
      title: 'LakbayHub rate-limited — using last known data',
      body: 'Polling will retry automatically in ~2 minutes.',
    })
  }

  // --- ROAS health ---------------------------------------------------------
  const validRoas = perDay.filter(d => d.roas !== null).map(d => d.roas)
  const avgRoas = validRoas.length > 0
    ? Math.round(validRoas.reduce((a, b) => a + b, 0) / validRoas.length)
    : null
  if (avgRoas !== null) {
    if (avgRoas >= 300) {
      alerts.push({ tone: 'good', Icon: Zap, title: `Excellent ROAS · ${avgRoas}% avg`, body: `For every ₱100 ad spend, returning ₱${avgRoas}. Scale this!` })
    } else if (avgRoas >= 150) {
      alerts.push({ tone: 'info', Icon: TrendingUp, title: `Healthy ROAS · ${avgRoas}% avg`, body: 'Profitable. Look for the days at peak to identify what to replicate.' })
    } else if (avgRoas > 0) {
      alerts.push({ tone: 'warn', Icon: TrendingDown, title: `Low ROAS · ${avgRoas}% avg`, body: 'Ad spend barely paying back. Check creative quality and audience.' })
    }
  }

  // Days with high spend but 0 leads / 0 sales
  const wasteDays = perDay.filter(d => d.spend >= 5000 && d.leads === 0)
  if (wasteDays.length > 0) {
    alerts.push({
      tone: 'danger', Icon: AlertTriangle,
      title: `${wasteDays.length} day(s) with high ad spend but 0 leads`,
      body: `Total wasted: ${formatPHPCompact(wasteDays.reduce((a, d) => a + d.spend, 0))}. Check pixel events + ad approval status.`,
    })
  }

  const zeroSaleDays = perDay.filter(d => d.spend >= 8000 && d.salesCount === 0)
  if (zeroSaleDays.length > 0) {
    alerts.push({
      tone: 'warn', Icon: AlertTriangle,
      title: `${zeroSaleDays.length} day(s) with ad spend ≥ ₱8k but 0 sales`,
      body: 'Could be a sales-cycle lag, or low closer follow-through. Cross-check with show-up rate.',
    })
  }

  // --- Sign-up / Sales trend ----------------------------------------------
  if (delta.sales !== undefined && delta.sales !== null) {
    if (delta.sales <= -30) {
      alerts.push({
        tone: 'danger', Icon: TrendingDown,
        title: `Revenue down ${Math.abs(delta.sales)}% ${period.compareLabel}`,
        body: 'Significant drop. Review cluster activity + ad performance for the period.',
      })
    } else if (delta.sales >= 30) {
      alerts.push({
        tone: 'good', Icon: TrendingUp,
        title: `Revenue up ${delta.sales}% ${period.compareLabel}!`,
        body: 'Document what changed so this can be repeated.',
      })
    }
  }

  // --- Show-up rate insights ----------------------------------------------
  if (overallShowUpRate !== null) {
    if (overallShowUpRate < 30) {
      alerts.push({
        tone: 'danger', Icon: AlertTriangle,
        title: `Show-up rate critical · ${overallShowUpRate}%`,
        body: `Only ${totals.showed} of ${totalAttendance} marked attendees showed. Try sending more session reminders.`,
      })
    } else if (overallShowUpRate < 50) {
      alerts.push({
        tone: 'warn', Icon: TrendingDown,
        title: `Show-up rate below 50% · ${overallShowUpRate}%`,
        body: 'Standard for cold leads; aim for 60%+ via reminder cadence.',
      })
    } else if (overallShowUpRate >= 70) {
      alerts.push({
        tone: 'good', Icon: CheckCircle2,
        title: `Strong show-up · ${overallShowUpRate}%`,
        body: 'Above-industry rate. Replicate the reminder cadence elsewhere.',
      })
    }
  }
  if (overallShowUpRate === null && totals.bookings > 0) {
    alerts.push({
      tone: 'info', Icon: Lightbulb,
      title: 'No attendance tracked yet for this window',
      body: 'Bookings tab → Auto-fill → Smart Match — auto-populates from matching sales.',
    })
  }

  // --- Conversion ---------------------------------------------------------
  if (overallBookToSale > 0 && overallBookToSale < 10 && totals.bookings >= 20) {
    alerts.push({
      tone: 'warn', Icon: TrendingDown,
      title: `Booking → Sale conversion at ${overallBookToSale}%`,
      body: 'Industry average for coaching is 15-25%. Audit closing call quality.',
    })
  }

  // --- Best & worst day --------------------------------------------------
  const dayWithRevenue = perDay.filter(d => d.salesAmount > 0)
  if (dayWithRevenue.length >= 3) {
    const best  = [...dayWithRevenue].sort((a, b) => b.salesAmount - a.salesAmount)[0]
    const worst = [...dayWithRevenue].sort((a, b) => a.salesAmount - b.salesAmount)[0]
    if (best && worst && best.day.toDateString() !== worst.day.toDateString()) {
      alerts.push({
        tone: 'info', Icon: Sparkles,
        title: `Best day: ${best.day.toLocaleDateString('en-PH', { weekday: 'short' })}, ${best.day.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} (${formatPHPCompact(best.salesAmount)})`,
        body: `Lowest: ${worst.day.toLocaleDateString('en-PH', { weekday: 'short' })}, ${worst.day.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} (${formatPHPCompact(worst.salesAmount)}). What was different?`,
      })
    }
  }

  // --- CPL trend ---------------------------------------------------------
  const validCpl = perDay.filter(d => d.cpl !== null).map((d, i) => ({ cpl: d.cpl, i }))
  if (validCpl.length >= 4) {
    const firstHalf  = validCpl.slice(0, Math.floor(validCpl.length / 2))
    const secondHalf = validCpl.slice(Math.floor(validCpl.length / 2))
    const avg = arr => arr.reduce((a, b) => a + b.cpl, 0) / arr.length
    const before = avg(firstHalf)
    const after = avg(secondHalf)
    if (before > 0) {
      const change = Math.round(((after - before) / before) * 100)
      if (change >= 25) {
        alerts.push({
          tone: 'warn', Icon: TrendingUp,
          title: `CPL trending up ${change}% in this window`,
          body: `From ${formatPHPCompact(before)} → ${formatPHPCompact(after)}. Audit fatigue or audience saturation.`,
        })
      } else if (change <= -20) {
        alerts.push({
          tone: 'good', Icon: TrendingDown,
          title: `CPL improving · down ${Math.abs(change)}% in this window`,
          body: `From ${formatPHPCompact(before)} → ${formatPHPCompact(after)}. Whatever you changed, keep it.`,
        })
      }
    }
  }

  if (alerts.length === 0) return null

  return (
    <section>
      <h2 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
        <Sparkles size={14} className="text-amber-500" /> Smart Alerts · {period.label}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {alerts.slice(0, 8).map((a, i) => (
          <Pill key={i} tone={a.tone} Icon={a.Icon} title={a.title} body={a.body} />
        ))}
      </div>
    </section>
  )
}
