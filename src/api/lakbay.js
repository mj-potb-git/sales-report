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
//
// AUDIENCE SPLIT: fetchSalesRecords() returns POTB-internal records only.
// EXTERNAL COACH cluster sales are split out of the same fetch and exposed
// via getExternalSalesRecords() — consumed by the AACIO tab + overview card.

import { getSupabase } from './supabase'
import { mockSalesRecords } from '../data/mockSalesData'
import { isExternalRecord } from './lakbayhub'
import { fetchInvoices, groupInvoicesByCustomer, invalidateInvoiceCache } from './invoices'
import {
  applyOverrides, startSaleOverridePoller, subscribeSaleOverrides,
} from '../lib/saleDateOverrides'

// Map one clean invoice → the internal sales-record schema every view already
// consumes. A PAID invoice becomes a dated sale attributed to its payment date
// (so DP-month vs balance-month split falls out for free). An unpaid invoice
// becomes a dateless "pending payment" row for the Needs Review / DP list.
// signup_count is 0 for a balance payment so a DP+balance member counts as one
// sign-up, not two (revenue still sums both).
function invoiceToRecord(inv) {
  const reasons = []
  if (!inv.isPaid) reasons.push('pending payment')
  if (inv.rawAmount) reasons.push(`amount typo (₱${inv.rawAmount.toLocaleString()}) — corrected`)
  if (!inv.coach && !inv.cluster) reasons.push('no attribution')
  return {
    sales_agent: inv.coach || 'Unassigned',
    team: inv.cluster || 'No Cluster',
    date: inv.isPaid ? inv.paidDate : null,
    sales_amount: inv.amount,
    signup_count: inv.paymentType === 'balance' ? 0 : 1,
    transaction_id: inv.invoice_id,
    customer_name: inv.customer_name,
    needsReview: reasons.length > 0,
    reviewReasons: reasons,
    _external: inv.isExternal,
    meta: {
      email: inv.email,
      package: inv.package,
      payment_status: inv.status,
      payment_type: inv.paymentType,
      cluster_id: inv.clusterId,
      invoice_id: inv.invoice_id,
      paidDate: inv.paidDate,
      createdDate: inv.createdDate,
      ...(inv.rawAmount ? { raw_amount: inv.rawAmount } : {}),
    },
  }
}

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

// Which source the most recent data actually came from, so the UI can warn
// when it's showing stale/fallback data instead of live LakbayHub.
//   'live'  — fresh from LakbayHub API
//   'cache' — Supabase historical cache (LakbayHub unreachable/401)
//   'mock'  — local seed (both live + Supabase failed/empty)
let salesSource = 'live'
export function getSalesSource() { return salesSource }

// Records LakbayHub left incomplete (missing date / zero amount / no closer).
// Surfaced in a "Needs Review" panel instead of being silently dropped.
let reviewRecords = []
export function getReviewRecords() { return reviewRecords }

// EXTERNAL COACH cluster sales — these belong to the AACIO tab, NOT to any
// POTB view. fetchSalesRecords() returns POTB-only records; the external
// split rides the same fetch (one API hit, two audiences) and is read via
// this getter. Overrides re-apply on read so date corrections stay in sync.
let externalRecords = []
export function getExternalSalesRecords() { return applyOverrides(externalRecords) }

// Raw clean invoices (all statuses, POTB + external) from the last fetch, so
// customer-level views (Down Payments tracker, drill-down, pending/DP count)
// can group payments per member without re-fetching.
let allInvoices = []
export function getInvoiceCustomers() {
  return groupInvoicesByCustomer(allInvoices.filter(i => !i.isExternal))
}
export function getExternalInvoiceCustomers() {
  return groupInvoicesByCustomer(allInvoices.filter(i => i.isExternal))
}

function buildReview(records) {
  return records
    .map((r) => {
      const reasons = Array.isArray(r.reviewReasons) ? r.reviewReasons.slice() : []
      if (reasons.length === 0) {
        const noCloser = !r.sales_agent || r.sales_agent === 'Unassigned'
        const noTeam   = !r.team || r.team === 'No Cluster'
        if (!r.date) reasons.push('no date')
        if (!Number(r.sales_amount)) reasons.push('zero amount')
        if (noCloser && noTeam) reasons.push('no attribution')
      }
      return reasons.length ? { ...r, reviewReasons: reasons } : null
    })
    .filter(Boolean)
}

// In-memory shadow of the last successful LakbayHub fetch — survives the
// rate-limit window so the UI keeps showing real data instead of mock seed.
let lastRealData = null
let _lastRealAt  = 0

async function fetchFresh(force = false) {
  // 1. Live LakbayHub INVOICES API -------------------------------------------
  // Per-payment source of truth. Each PAID invoice → a dated sale on its
  // payment date; unpaid invoices → pending review rows. External (AACIO)
  // invoices are split out for the AACIO tab exactly like before.
  if (Date.now() < rateLimitedUntil) {
    console.warn('[lakbay] rate-limited; using last known real data if available')
    if (lastRealData) return lastRealData
  } else {
    try {
      // Pass force through so a manual Refresh re-pulls invoices from LakbayHub
      // (picks up source edits like a newly-assigned cluster) instead of the
      // invoice module's cached copy.
      const invoices = await fetchInvoices({ force })
      if (Array.isArray(invoices) && invoices.length > 0) {
        allInvoices = invoices
        const recs = invoices.map(invoiceToRecord)
        // External split: keep ALL external recs (paid + pending) so the AACIO
        // tab can show both its sales and its pending list.
        externalRecords = recs.filter(r => r._external)
        const potb = recs.filter(r => !r._external)
        const mapped = potb.filter(r => r.date)           // PAID + dated feed aggregations
        // Review = only PAID rows with a data-quality issue (typo / no
        // attribution). Pending/DP is a customer-level concept surfaced via
        // getInvoiceCustomers(), not one row per unpaid payment link.
        reviewRecords = buildReview(mapped)
        if (mapped.length > 0) {
          console.info(`[lakbay] Loaded ${mapped.length} POTB paid + ${externalRecords.length} external invoices (${reviewRecords.length} need review)`)
          lastRealData = mapped
          _lastRealAt = Date.now()
          salesSource = 'live'
          return mapped
        }
      }
      console.warn('[lakbay] Invoices API returned no records, trying Supabase')
    } catch (err) {
      if (/too many requests|rate limit|429/i.test(err.message)) {
        rateLimitedUntil = Date.now() + RATE_LIMIT_BACKOFF_MS
        console.warn(`[lakbay] rate-limited; backing off ${RATE_LIMIT_BACKOFF_MS / 1000}s`)
        if (lastRealData) return lastRealData
      } else {
        console.warn('[lakbay] Invoices API failed:', err.message)
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
      salesSource = 'cache'
      externalRecords = data.filter(isExternalRecord)
      const potb = data.filter(r => !isExternalRecord(r))
      reviewRecords = buildReview(potb)
      return potb
    }
    console.warn('[lakbay] Supabase cache empty, using mock')
  } catch (err) {
    console.warn('[lakbay] Supabase query failed, using mock:', err.message)
  }

  // 3. Mock fallback ---------------------------------------------------------
  console.info(`[lakbay] Loaded ${mockSalesRecords.length} mock records`)
  salesSource = 'mock'
  externalRecords = mockSalesRecords.filter(isExternalRecord)
  return mockSalesRecords.filter(r => !isExternalRecord(r))
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

  inFlight = fetchFresh(force)
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

/** Force-clear the cache (for manual refresh buttons) — also drops the invoice
 *  module cache so the next fetch re-pulls from LakbayHub (source edits show). */
export function invalidateSalesCache() {
  cachedData = null
  cachedAt = 0
  rateLimitedUntil = 0
  invalidateInvoiceCache()
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

// Exact peso value with centavos (2 decimal places), e.g. ₱13,200.00 — used
// where MJ needs the precise amount, not a rounded/compact figure.
export const formatPHP2 = n =>
  '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

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
