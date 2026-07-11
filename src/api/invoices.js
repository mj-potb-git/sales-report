// LakbayHub INVOICES client — the per-payment source of truth.
//
// Endpoint: /api/lakbay/signups/invoices?month=YYYY-MM  (proxied → x-app-key
// injected server-side). Returns ONE row per payment (invoice), unlike
// /signups/sales-report which collapses a member to one aggregate row.
//
// Why this matters: a member often pays a Down Payment one month and the
// balance in another. Invoices let us attribute each payment to the month it
// was actually paid (`paid_at`) — so the DP counts in the DP's month and the
// balance in the balance's month. It also surfaces members the aggregate
// report dropped entirely (e.g. fully-paid accounts with no date_paid).
//
// A single payment tops out at a few hundred K; anything above is a data-entry
// typo (an extra run of zeros) — corrected to the package full price and
// flagged, same guard as the aggregate mapper.

import { coachFromCluster, isExternalCluster, packageFullPrice } from './lakbayhub'

const BASE = '/api/lakbay'
const PAID_STATUSES = new Set(['PAID', 'SETTLED'])
const MAX_REASONABLE_AMOUNT = 1_000_000

async function getMonth(month) {
  const res = await fetch(`${BASE}/signups/invoices?month=${month}`, {
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new Error(`Invoices API ${res.status}: ${res.statusText}`)
  const json = await res.json()
  if (!json.status) throw new Error(json.message || 'Invoices API error')
  return json.data ?? []
}

// Rolling window of YYYY-MM strings, newest first, ending at the current month.
// PH time so the "current month" matches the team's calendar.
function recentMonths(n) {
  const now = new Date()
  const y = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', year: 'numeric' }).format(now))
  const m = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', month: 'numeric' }).format(now)) - 1
  const out = []
  for (let i = 0; i < n; i++) {
    const d = new Date(y, m - i, 1)
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

/** Map a raw invoice → clean internal shape. */
export function mapInvoice(inv) {
  const cluster = (inv.cluster_name || '').trim()
  const rawAmount = Number(inv.amount) || 0
  const suspicious = rawAmount > MAX_REASONABLE_AMOUNT
  const fullPrice = packageFullPrice(inv.package_avail)
  const amount = suspicious ? (fullPrice || 0) : rawAmount
  const status = String(inv.status || '').toUpperCase()
  const createdDate = inv.created_date || (inv.created_at ? String(inv.created_at).slice(0, 10) : null)
  // Payment date = when the customer actually PAID. For manual/bank payments the
  // API stamps paid_at from `reviewed_at` (admin approval), which can lag the
  // real payment by days — even into the next month. Per MJ, revenue is counted
  // on the payment date, so when paid_at came from reviewed_at we fall back to
  // the created/payment date instead of the (later) approval date.
  let paidDate = inv.paid_at || null
  if (paidDate && inv.paid_at_source === 'reviewed_at' && createdDate) {
    paidDate = createdDate
  }
  return {
    invoice_id: inv.invoice_id,
    xendit_id: inv.xendit_id,
    customer_name: inv.lead_name || 'Unknown',
    email: inv.email || '',
    amount,
    rawAmount: suspicious ? rawAmount : undefined,
    paidDate,                                       // YYYY-MM-DD when this payment landed
    approvalDate: inv.paid_at || null,              // raw paid_at (approval date) for reference
    paidAtSource: inv.paid_at_source || null,
    createdDate,
    status,
    isPaid: PAID_STATUSES.has(status),
    paymentType: (inv.payment_type || 'unknown').toLowerCase(),  // down_payment | balance | full | unknown
    paymentChannel: inv.payment_channel || null,
    paymentMethod: inv.payment_method || null,
    package: inv.package_avail || '',
    cluster,
    coach: coachFromCluster(cluster),
    isExternal: isExternalCluster(cluster),
    clusterId: inv.cluster_id || null,
  }
}

// --- Module cache (TTL + in-flight dedup + rate-limit backoff) --------------
const CACHE_TTL_MS = 30_000
const RATE_LIMIT_BACKOFF_MS = 120_000
let cache = null
let cachedAt = 0
let inFlight = null
let rateLimitedUntil = 0
let lastReal = null

/**
 * Fetch and merge invoices across the last `months` months (default 6, enough
 * to cover the 90-day period views). Deduped by invoice_id. Cached with TTL.
 * Returns [] and leaves `cache` null on total failure so callers can fall back.
 */
export async function fetchInvoices({ months = 6, force = false } = {}) {
  const now = Date.now()
  if (!force && cache && now - cachedAt < CACHE_TTL_MS) return cache
  if (inFlight) return inFlight
  if (now < rateLimitedUntil && lastReal) return lastReal

  inFlight = (async () => {
    const wanted = recentMonths(months)
    const results = await Promise.all(wanted.map(m => getMonth(m).catch(err => {
      if (/429|too many|rate limit/i.test(err.message)) rateLimitedUntil = Date.now() + RATE_LIMIT_BACKOFF_MS
      console.warn(`[invoices] month ${m} failed:`, err.message)
      return null
    })))
    if (results.every(r => r === null)) {
      // total failure — keep last known good
      if (lastReal) return lastReal
      throw new Error('All invoice month fetches failed')
    }
    const seen = new Set()
    const all = []
    for (const arr of results) {
      if (!Array.isArray(arr)) continue
      for (const inv of arr) {
        if (!inv?.invoice_id || seen.has(inv.invoice_id)) continue
        seen.add(inv.invoice_id)
        all.push(mapInvoice(inv))
      }
    }
    cache = all
    cachedAt = Date.now()
    lastReal = all
    console.info(`[invoices] loaded ${all.length} invoices across ${wanted.length} months`)
    return all
  })().finally(() => { inFlight = null })

  return inFlight
}

export function invalidateInvoiceCache() { cache = null; cachedAt = 0; rateLimitedUntil = 0 }

// Group a flat invoice list by member (email, falling back to name). Each entry
// carries the member's invoices sorted by date + derived DP/balance/full facts
// — used by the customer drill-down and the Down Payments tracker.
export function groupInvoicesByCustomer(invoices) {
  const map = new Map()
  for (const inv of invoices) {
    const key = (inv.email || inv.customer_name || 'unknown').toLowerCase().trim()
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(inv)
  }
  const out = []
  for (const [key, invs] of map) {
    invs.sort((a, b) => String(a.paidDate || a.createdDate || '').localeCompare(String(b.paidDate || b.createdDate || '')))
    const paid = invs.filter(i => i.isPaid)
    const totalPaid = paid.reduce((s, i) => s + i.amount, 0)
    const dp = invs.find(i => i.paymentType === 'down_payment')
    // A member's invoices can carry DIFFERENT packages (a Starter down payment
    // later upgraded to Travelpreneur, or a mis-tagged DP). Take the HIGHEST-tier
    // package they hold so the full price + balance are sized correctly — using
    // invs[0] alone mislabels an upgraded member and understates their balance.
    let pkg = invs[0].package
    let fullPrice = packageFullPrice(invs[0].package) || 0
    for (const i of invs) {
      const fp = packageFullPrice(i.package) || 0
      if (fp > fullPrice) { fullPrice = fp; pkg = i.package }
    }
    const paidByDate = paid.filter(i => i.paidDate).sort((a, b) => String(a.paidDate).localeCompare(String(b.paidDate)))
    const isFullyPaid = fullPrice ? totalPaid >= fullPrice : paid.some(i => i.paymentType === 'full')
    // "Had a DP" = paid in more than one go (DP + balance), not a single full payment.
    const hadDownPayment = Boolean(dp) || paid.length > 1 || (fullPrice ? totalPaid > 0 && totalPaid < fullPrice : false)
    out.push({
      key,
      customer_name: invs[0].customer_name,
      email: invs[0].email,
      package: pkg,
      coach: invs.find(i => i.coach)?.coach || '',
      cluster: invs.find(i => i.cluster)?.cluster || '',
      isExternal: invs.some(i => i.isExternal),
      invoices: invs,
      totalPaid,
      fullPrice: fullPrice || null,
      hadDownPayment,
      dpDate: dp?.paidDate || (hadDownPayment ? (paidByDate[0]?.paidDate || null) : null),
      // The full-payment date is when the LAST payment landed (completing the
      // package), not the first balance — a member can pay the balance in parts.
      fullPaymentDate: isFullyPaid ? (paidByDate[paidByDate.length - 1]?.paidDate || null) : null,
      isFullyPaid,
      hasPending: invs.some(i => !i.isPaid),
    })
  }
  return out
}
