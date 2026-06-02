// Sales data aggregation layer for Lakbay Hub signups.
//
// Source priority:
//   1. Live LakbayHub utilities API (/api/lakbay/signups/sales-report)
//   2. Supabase sales_records table (cached historical seed)
//   3. Local mock data (development fallback)
//
// Each step falls back to the next on failure or empty response.
//
// Shared cache + in-flight dedup so multiple components calling
// fetchSalesRecords() concurrently only hit LakbayHub once. This prevents
// rate limiting when Overview, Sales, and Dashboard tabs are all open.

import { getSupabase } from './supabase'
import { mockSalesRecords } from '../data/mockSalesData'
import { fetchSignupsReport, mapLakbayHubRecord } from './lakbayhub'
import {
  applyOverrides, startSaleOverridePoller, subscribeSaleOverrides,
} from '../lib/saleDateOverrides'

// Boot the sale-date-correction sync once, and re-process records whenever a
// correction changes so every report immediately reflects the true sale date.
startSaleOverridePoller()
subscribeSaleOverrides(() => { invalidateSalesCache() })

const CACHE_TTL_MS         = 20_000   // serve cached data for 20s
const RATE_LIMIT_BACKOFF_MS = 120_000  // after a 429/rate-limit, wait 2 min before retrying live

let cachedData   = null
let cachedAt     = 0
let inFlight     = null      // shared promise so concurrent callers reuse one fetch
let rateLimitedUntil = 0

// In-memory shadow of the last successful LakbayHub fetch — survives the
// rate-limit window so the UI keeps showing real data instead of mock seed.
let lastRealData = null
let _lastRealAt  = 0

async function fetchFresh() {
  // 1. Live LakbayHub API ----------------------------------------------------
  if (Date.now() < rateLimitedUntil) {
    console.warn('[lakbay] LakbayHub rate-limited; using last known real data if available')
    if (lastRealData) return lastRealData
  } else {
    try {
      const raw = await fetchSignupsReport()
      if (Array.isArray(raw) && raw.length > 0) {
        const mapped = raw
          .map((r, i) => mapLakbayHubRecord(r, i))
          .filter(r => r.date)
        if (mapped.length > 0) {
          console.info(`[lakbay] Loaded ${mapped.length} records from LakbayHub API`)
          lastRealData = mapped
          _lastRealAt = Date.now()
          return mapped
        }
      }
      console.warn('[lakbay] LakbayHub API returned no records, trying Supabase')
    } catch (err) {
      // Detect rate limit and back off
      if (/too many requests|rate limit|429/i.test(err.message)) {
        rateLimitedUntil = Date.now() + RATE_LIMIT_BACKOFF_MS
        console.warn(`[lakbay] LakbayHub rate-limited; backing off ${RATE_LIMIT_BACKOFF_MS / 1000}s`)
        if (lastRealData) {
          console.info(`[lakbay] Serving last-known ${lastRealData.length} real records`)
          return lastRealData
        }
      } else {
        console.warn('[lakbay] LakbayHub API failed:', err.message)
        if (lastRealData) return lastRealData
      }
    }
  }

  // 2. Supabase cache --------------------------------------------------------
  try {
    const { data, error } = await getSupabase()
      .from('sales_records')
      .select('transaction_id, sales_agent, team, date, sales_amount, signup_count, customer_name')
      .order('date', { ascending: false })
      .limit(5000)
    if (error) throw error
    if (data && data.length > 0) {
      console.info(`[lakbay] Loaded ${data.length} records from Supabase cache`)
      return data
    }
    console.warn('[lakbay] Supabase cache empty, using mock')
  } catch (err) {
    console.warn('[lakbay] Supabase query failed, using mock:', err.message)
  }

  // 3. Mock fallback ---------------------------------------------------------
  console.info(`[lakbay] Loaded ${mockSalesRecords.length} mock records`)
  return mockSalesRecords
}

/**
 * Public API. Returns cached data when fresh; otherwise triggers a single
 * background fetch even if many components call this concurrently.
 */
export async function fetchSalesRecords({ force = false } = {}) {
  const now = Date.now()
  if (!force && cachedData && (now - cachedAt) < CACHE_TTL_MS) {
    return cachedData
  }
  if (inFlight) return inFlight

  inFlight = fetchFresh()
    .then(data => {
      // Re-date any late-posted manual payments to their true close date
      const corrected = applyOverrides(data)
      cachedData = corrected
      cachedAt = Date.now()
      return corrected
    })
    .finally(() => { inFlight = null })

  return inFlight
}

/** Force-clear the cache (for manual refresh buttons) */
export function invalidateSalesCache() {
  cachedData = null
  cachedAt = 0
  rateLimitedUntil = 0
}

// --- Date helpers -----------------------------------------------------------

export function startOfDay(d) {
  const x = new Date(d); x.setHours(0, 0, 0, 0); return x
}

// Week is Monday → Sunday (per spec)
export function startOfWeek(d) {
  const x = startOfDay(d)
  const day = x.getDay() // 0 = Sun
  const diff = day === 0 ? -6 : 1 - day
  x.setDate(x.getDate() + diff)
  return x
}

export function endOfWeek(d) {
  const s = startOfWeek(d)
  const e = new Date(s); e.setDate(s.getDate() + 6); e.setHours(23, 59, 59, 999)
  return e
}

export function startOfMonth(d) {
  const x = startOfDay(d); x.setDate(1); return x
}

export function endOfMonth(d) {
  const x = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  x.setHours(23, 59, 59, 999); return x
}

// Parse YYYY-MM-DD as a local date (avoids TZ shifts from `new Date('2026-05-26')`)
export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// --- Range filtering --------------------------------------------------------

export function filterByRange(records, start, end) {
  const s = start.getTime(), e = end.getTime()
  return records.filter(r => {
    const t = parseDate(r.date).getTime()
    return t >= s && t <= e
  })
}

export function rangeFor(period, anchor = new Date()) {
  switch (period) {
    case 'daily':   return { start: startOfDay(anchor),   end: new Date(startOfDay(anchor).getTime() + 86399999) }
    case 'weekly':  return { start: startOfWeek(anchor),  end: endOfWeek(anchor) }
    case 'monthly': return { start: startOfMonth(anchor), end: endOfMonth(anchor) }
    default:        return { start: startOfMonth(anchor), end: endOfMonth(anchor) }
  }
}

// --- Aggregation ------------------------------------------------------------

export function sum(records, field) {
  return records.reduce((acc, r) => acc + (r[field] || 0), 0)
}

export function groupBy(records, key) {
  const map = new Map()
  for (const r of records) {
    const k = r[key]
    if (!map.has(k)) map.set(k, [])
    map.get(k).push(r)
  }
  return map
}

export function totalsByAgent(records) {
  const grouped = groupBy(records, 'sales_agent')
  return [...grouped.entries()].map(([name, recs]) => ({
    name,
    team: recs[0].team,
    sales:   sum(recs, 'sales_amount'),
    signups: sum(recs, 'signup_count'),
    txnCount: recs.length,
    records: recs,
  })).sort((a, b) => b.sales - a.sales)
}

export function totalsByTeam(records) {
  const grouped = groupBy(records, 'team')
  return [...grouped.entries()].map(([name, recs]) => {
    const agentsInTeam = totalsByAgent(recs)
    return {
      name,
      sales:    sum(recs, 'sales_amount'),
      signups:  sum(recs, 'signup_count'),
      agents:   agentsInTeam,
      records:  recs,
    }
  }).sort((a, b) => b.sales - a.sales)
}

export function dailyTrend(records, days = 14, anchor = new Date()) {
  const end = startOfDay(anchor)
  const buckets = []
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(end.getTime() - i * 86400000)
    const next = new Date(day.getTime() + 86400000)
    const dayRecs = records.filter(r => {
      const t = parseDate(r.date).getTime()
      return t >= day.getTime() && t < next.getTime()
    })
    buckets.push({
      date: day.toISOString().slice(5, 10), // MM-DD
      label: day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      sales: sum(dayRecs, 'sales_amount'),
      signups: sum(dayRecs, 'signup_count'),
    })
  }
  return buckets
}

// --- Manager-focused helpers ------------------------------------------------

// Returns 24 hourly buckets for a single day, useful for an hourly heatmap.
// Note: most LakbayHub records only carry a `date_paid` date, not a timestamp.
// When the date matches, the record is bucketed to the "midnight" slot or to
// the createdAt hour if available via meta. For now this groups by date only,
// returning a single bucket — but the API hook is here for when timestamps
// become available.
export function hourlyDistribution(records, anchor = new Date()) {
  const day  = startOfDay(anchor)
  const next = new Date(day.getTime() + 86400000)
  const buckets = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    label: h === 0 ? '12AM' : h < 12 ? `${h}AM` : h === 12 ? '12PM' : `${h - 12}PM`,
    sales: 0,
    signups: 0,
  }))
  for (const r of records) {
    const t = parseDate(r.date).getTime()
    if (t < day.getTime() || t >= next.getTime()) continue
    // Without timestamps we can't really place them by hour — fall back to
    // putting everything into the current hour so the chart still shows life.
    const hour = new Date().getHours()
    buckets[hour].sales   += r.sales_amount || 0
    buckets[hour].signups += r.signup_count || 0
  }
  return buckets
}

// Compare two ranges (current vs prior) and return delta info
export function comparePeriods(records, currentStart, currentEnd, priorStart, priorEnd) {
  const current = filterByRange(records, currentStart, currentEnd)
  const prior   = filterByRange(records, priorStart, priorEnd)
  const cur = { sales: sum(current, 'sales_amount'), signups: sum(current, 'signup_count'), txns: current.length }
  const pri = { sales: sum(prior,   'sales_amount'), signups: sum(prior,   'signup_count'), txns: prior.length }
  const pct = (curV, priV) => priV === 0 ? (curV > 0 ? 100 : 0) : Math.round(((curV - priV) / priV) * 100)
  return {
    current: cur,
    prior:   pri,
    delta: {
      sales:   pct(cur.sales,   pri.sales),
      signups: pct(cur.signups, pri.signups),
      txns:    pct(cur.txns,    pri.txns),
    },
  }
}

// Aggregate records by a field (e.g. payment_status, package, account_status).
// Looks in `r.meta.<field>` first (LakbayHub extras), then top-level.
export function aggregateBy(records, fieldPath) {
  const parts = fieldPath.split('.')
  const get = r => parts.reduce((acc, k) => acc?.[k], r)

  const map = new Map()
  for (const r of records) {
    const key = get(r) ?? 'Unknown'
    if (!map.has(key)) map.set(key, { name: key, count: 0, sales: 0 })
    const entry = map.get(key)
    entry.count += 1
    entry.sales += r.sales_amount || 0
  }
  return [...map.values()].sort((a, b) => b.sales - a.sales)
}

// For each cluster (team), how long ago was the most recent signup?
export function lastSignupByCluster(records) {
  const grouped = groupBy(records, 'team')
  const today = startOfDay(new Date())
  const tomorrow = new Date(today.getTime() + 86400000)
  return [...grouped.entries()].map(([name, recs]) => {
    const dates = recs.map(r => parseDate(r.date).getTime())
    const latestMs = Math.max(...dates)
    const todayRecs = recs.filter(r => {
      const t = parseDate(r.date).getTime()
      return t >= today.getTime() && t < tomorrow.getTime()
    })
    return {
      name,
      lastSignupAt: new Date(latestMs),
      daysSinceLast: Math.floor((Date.now() - latestMs) / 86400000),
      todayCount: todayRecs.length,
      todaySales: sum(todayRecs, 'sales_amount'),
    }
  }).sort((a, b) => b.lastSignupAt - a.lastSignupAt)
}

// Project this month's run-rate forward. Returns { mtd, daysElapsed, daysInMonth, projected, targetPercent, paceVsTarget }
export function paceProjection(records, target, anchor = new Date()) {
  const mStart = startOfMonth(anchor)
  const mEnd   = endOfMonth(anchor)
  const mtd    = sum(filterByRange(records, mStart, mEnd), 'sales_amount')
  const today  = startOfDay(anchor)
  const daysElapsed   = Math.max(1, Math.floor((today - mStart) / 86400000) + 1)
  const daysInMonth   = Math.floor((mEnd - mStart) / 86400000) + 1
  const dailyRunRate  = mtd / daysElapsed
  const projected     = Math.round(dailyRunRate * daysInMonth)
  const targetPercent = target > 0 ? Math.round((mtd / target) * 100) : 0
  const expectedByNow = target > 0 ? (target * daysElapsed) / daysInMonth : 0
  const paceVsTarget  = mtd - expectedByNow // positive = ahead, negative = behind
  return { mtd, daysElapsed, daysInMonth, projected, targetPercent, paceVsTarget, dailyRunRate }
}

// "2 hours ago", "3 days ago"
export function timeAgo(date) {
  if (!date) return '—'
  const ms = Date.now() - (date instanceof Date ? date.getTime() : new Date(date).getTime())
  const mins = Math.floor(ms / 60000)
  if (mins < 1)   return 'just now'
  if (mins < 60)  return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30)  return `${days}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Convenience formatters
export const formatPHP = n =>
  '₱' + Math.round(n).toLocaleString('en-PH')

export const formatPHPCompact = n => {
  if (n >= 1_000_000) return '₱' + (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000)     return '₱' + (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'k'
  return formatPHP(n)
}

export function previousPeriodRange(period, anchor = new Date()) {
  const cur = rangeFor(period, anchor)
  if (period === 'daily') {
    const prior = new Date(anchor.getTime() - 86400000)
    return rangeFor('daily', prior)
  }
  if (period === 'weekly') {
    const prior = new Date(anchor.getTime() - 7 * 86400000)
    return rangeFor('weekly', prior)
  }
  if (period === 'monthly') {
    const prior = new Date(anchor.getFullYear(), anchor.getMonth() - 1, 15)
    return rangeFor('monthly', prior)
  }
  return cur
}

// Same date last week
export function sameDayLastWeek(anchor = new Date()) {
  const d = new Date(anchor.getTime() - 7 * 86400000)
  return rangeFor('daily', d)
}
