// Fusioo Booking Transactions client.
// Used by the Officers tab to attribute revenue to specific Account Officers
// (sales agents) — LakbayHub records have sales_closer=null so they can't
// power agent-level analytics on their own.
//
// Auth: 10-year Bearer token via Credentials Grant, injected server-side by
// the Vite proxy at /api/fusioo.

const BASE = '/api/fusioo'
const BOOKING_TX_APP_ID = 'ib549c26f3ff64497b314a14d26d8cd2e' // Booking Transactions app
const PAGE_SIZE = 200

async function get(path) {
  const res = await fetch(`${BASE}${path}`, { headers: { Accept: 'application/json' } })
  if (!res.ok) {
    let msg = `Fusioo API ${res.status}`
    // eslint-disable-next-line no-empty
    try { const j = await res.json(); msg = j.message || j.error_description || msg } catch {}
    throw new Error(msg)
  }
  return res.json()
}

// --- Endpoints ------------------------------------------------------------

/** List all apps in the workspace (one-time discovery) */
export function fetchApps() {
  return get('/apps').then(j => j.data || [])
}

/** Get a single app's schema (fields, types) */
export function fetchAppSchema(appId = BOOKING_TX_APP_ID) {
  return get(`/apps/${appId}`).then(j => j.data)
}

// Module-level cache + in-flight dedup so React Strict Mode + multiple
// component mounts don't trigger N parallel paginated fetches (which hammers
// Fusioo and never finishes).
let _cache = null
let _cacheAt = 0
let _inFlight = null
const CACHE_TTL_MS = 60_000

/**
 * Fetch booking transactions, paginated (transaction_date desc). The loop
 * breaks as soon as a short page returns, so it only fetches as many pages as
 * there is data — `maxPages` is just a runaway ceiling, NOT a fixed page count.
 *
 * NOTE: there were ~2,700 records as of Jun 2026. The old 5-page (1,000) cap
 * silently dropped everything before ~Sept 2025 (~1,700 records / ₱72M),
 * breaking All-Time and older-month officer views. Ceiling raised to 40 pages
 * (8,000 records) for headroom; normal loads stop after ~14 pages.
 */
export async function fetchAllBookingTransactions({
  appId = BOOKING_TX_APP_ID,
  maxPages = 40,           // ceiling only — early-break stops at the real last page
  force = false,
} = {}) {
  const now = Date.now()
  if (!force && _cache && (now - _cacheAt) < CACHE_TTL_MS) return _cache
  if (_inFlight) return _inFlight

  _inFlight = (async () => {
    const all = []
    for (let i = 0; i < maxPages; i++) {
      const offset = i * PAGE_SIZE
      const j = await get(`/records/apps/${appId}?limit=${PAGE_SIZE}&offset=${offset}&sort_by=transaction_date&order=desc`)
      const page = j.data || []
      all.push(...page)
      if (page.length < PAGE_SIZE) break
    }
    _cache = all
    _cacheAt = Date.now()
    _inFlight = null
    return all
  })()

  return _inFlight
}

// Lightweight fetch for views that only need RECENT transactions (e.g. the TV
// board's this-month totals). Records come back newest-first, so we stop
// paginating as soon as a page's oldest row predates `sinceDate` — usually just
// 1-2 pages instead of ~14. This keeps Fusioo well under its hourly rate limit
// even with the board polling and multiple screens open. Separate cache so it
// never clobbers the full-history cache used by the Officers tab.
let _recentCache = null
let _recentAt = 0
let _recentInFlight = null
const RECENT_TTL_MS = 90_000 // 90s — short enough that the TV picks up new officer sales quickly

export async function fetchRecentBookingTransactions({
  sinceDate,
  appId = BOOKING_TX_APP_ID,
  maxPages = 40,
  force = false,
} = {}) {
  const now = Date.now()
  if (!force && _recentCache && (now - _recentAt) < RECENT_TTL_MS) return _recentCache
  if (_recentInFlight) return _recentInFlight

  const cutoff = sinceDate ? new Date(sinceDate).getTime() : 0

  _recentInFlight = (async () => {
    const all = []
    for (let i = 0; i < maxPages; i++) {
      const offset = i * PAGE_SIZE
      const j = await get(`/records/apps/${appId}?limit=${PAGE_SIZE}&offset=${offset}&sort_by=transaction_date&order=desc`)
      const page = j.data || []
      all.push(...page)
      if (page.length < PAGE_SIZE) break
      // Stop once the oldest row on this page is before the cutoff date.
      const last = page[page.length - 1]
      const lastMs = new Date(last?.transaction_date || last?.created || 0).getTime()
      if (cutoff && lastMs < cutoff) break
    }
    _recentCache = all
    _recentAt = Date.now()
    _recentInFlight = null
    return all
  })()

  return _recentInFlight
}

// --- Field name -> normalized agent/team helpers --------------------------

function firstStr(val) {
  if (val == null) return null
  if (Array.isArray(val)) return val[0] || null
  return String(val)
}

/**
 * Map a raw Fusioo Booking Transaction record to a normalized shape that
 * matches what the AccountOfficersTab expects (similar to LakbayHub records
 * but with agent attribution).
 */
// Fusioo stores the real money in `total_payment_breakdown`, a string like
// "35558 - Amount Paid  / 0 - Balance / 0 - Refund". Parse the actual cash
// collected, the outstanding balance (= Accounts Receivable), and any refund.
function parseBreakdown(s) {
  const str = String(s || '')
  const num = (re) => { const m = str.match(re); return m ? Number(m[1].replace(/,/g, '')) : 0 }
  return {
    paid:    num(/(-?[\d.,]+)\s*-\s*Amount Paid/i),
    balance: num(/(-?[\d.,]+)\s*-\s*Balance/i),
    refund:  num(/(-?[\d.,]+)\s*-\s*Refund/i),
  }
}

export function mapBookingTransaction(raw) {
  const agent = firstStr(raw.agent_name) || 'Unassigned'
  // Normalize whitespace — Fusioo has inconsistent values like "POTB  International"
  // (double space) that would otherwise group/display as a separate team.
  const team  = (firstStr(raw.team_name) || 'No Team').replace(/\s+/g, ' ').trim()
  const status = firstStr(raw.status) || ''
  const txnType = firstStr(raw.transaction_type) || ''
  const paymentType = firstStr(raw.payment_type) || ''
  const bd = parseBreakdown(raw.total_payment_breakdown)
  const srp = Number(raw.total_package_price) || 0
  const isFull = /full/i.test(paymentType)
  const receivable = Math.max(0, bd.balance)        // money still to collect (AR)
  const isInstallment = !isFull && (receivable > 0 || /install|dp|partial|down/i.test(paymentType))
  // The real supplier cost is often NOT encoded yet — Fusioo leaves a ₱300
  // placeholder (being removed at source). Treat 300 (or 0) as "cost not yet
  // encoded": expose cost/profit as null so the dashboard shows "—" instead of
  // a fake ₱300 cost and an inflated profit. Only a real (>0, ≠300) cost counts.
  const rawCost = Number(raw.total_cost) || 0
  const costEncoded = rawCost > 0 && rawCost !== 300
  // Profit is only REALIZED when the booking is FULLY PAID (per MJ). A DP /
  // installment with an outstanding balance has no realized profit yet.
  const srInv = firstStr(raw.for_sr_inv) || ''
  const fullyPaid = /fully\s*paid/i.test(srInv) || receivable === 0
  // Attribute realized profit to WHEN it was fully paid. Fusioo has no clean
  // "date fully paid" field (processed_date is empty), so we use last_modified
  // as the closest proxy (the day the record was last updated → typically when
  // the balance was settled). CAVEAT: last_modified shifts on ANY later edit
  // (e.g. encoding the cost), which can move the profit month — a dedicated
  // "Date Fully Paid" field in Fusioo would make this exact.
  const paidDate = fullyPaid ? ((raw.last_modified || raw.transaction_date || '').slice(0, 10) || null) : null
  return {
    transaction_id: raw.id,
    sales_agent:    agent,
    team:           team,
    date:           raw.transaction_date || raw.created?.slice(0, 10) || null,
    // SALES = ACTUAL CASH collected (Amount Paid), NOT the SRP/package price.
    // For a FULL PAYMENT this equals the package price; for an INSTALLMENT it's
    // the down payment / partial paid so far. The unpaid remainder is `receivable`.
    sales_amount:   bd.paid,
    srp,                              // total package price (reference only)
    receivable,                       // outstanding balance = Accounts Receivable
    refund:         bd.refund,
    isFull,
    isInstallment,
    paymentLabel:   isFull ? 'Full Payment' : (isInstallment ? 'DP / Installment' : (paymentType || '—')),
    // null when the supplier cost hasn't been encoded yet (no fake ₱300)
    cost:           costEncoded ? rawCost : null,
    // Realized profit ONLY when fully paid AND cost encoded — else null ("—").
    // A DP/installment shows no profit until the balance is fully paid.
    profit:         (fullyPaid && costEncoded) ? (Number(raw.total_profit) || 0) : null,
    costEncoded,
    fullyPaid,
    paidDate,       // full-payment month for profit attribution (proxy: last_modified)
    signup_count:   1,
    customer_name:  '', // Fusioo customer is a separate app_link; resolution is a future enhancement
    meta: {
      status,
      transaction_type:    txnType,
      processed_date:      raw.processed_date,
      created:             raw.created,
      payment_type:        paymentType,
      srp,
      amount_paid:         bd.paid,
      balance:             bd.balance,
      refund:              bd.refund,
      type_of_package:     firstStr(raw.type_of_package),
      mop_used:            raw.mop_used_by_customer,
      duration:            raw.duration,
      travel_date:         raw.travel_date,
      gdx:                 raw.gdx,
    },
  }
}

// --- Aggregation helpers --------------------------------------------------

/**
 * Group records by agent and compute totals.
 *
 * An officer's `team` is their DOMINANT team (the one most of their bookings
 * fall under) — NOT whichever record happened to be first. Fusioo `team_name`
 * is per-booking, so a mostly-International officer with one stray Domestic
 * deal (e.g. Mike Jomel: 23 Intl / 1 Domestic) should still read International.
 * `teamMix` keeps the per-division split for hybrid (cross-selling) views.
 */
export function totalsByAgent(records) {
  const map = new Map()
  for (const r of records) {
    const name = r.sales_agent || 'Unassigned'
    if (!map.has(name)) map.set(name, { name, team: '—', sales: 0, profit: 0, txnCount: 0, records: [], _teams: {} })
    const entry = map.get(name)
    entry.sales    += r.sales_amount || 0
    entry.profit   += r.profit || 0
    entry.txnCount += 1
    entry.records.push(r)
    const t = r.team || 'No Team'
    entry._teams[t] = (entry._teams[t] || 0) + 1
  }
  return [...map.values()].map(e => {
    // dominant team = most bookings; tie-break by name for stability
    const mix = Object.entries(e._teams)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    e.team = mix[0]?.name || '—'
    e.teamMix = mix                       // [{name, count}] per division
    e.crossTeam = mix.length > 1          // sold across >1 division
    delete e._teams
    return e
  }).sort((a, b) => b.sales - a.sales)
}

/** Group records by team and compute totals */
export function totalsByTeam(records) {
  const map = new Map()
  for (const r of records) {
    const team = r.team || 'No Team'
    if (!map.has(team)) map.set(team, { name: team, sales: 0, profit: 0, txnCount: 0, agents: new Set() })
    const entry = map.get(team)
    entry.sales    += r.sales_amount || 0
    entry.profit   += r.profit || 0
    entry.txnCount += 1
    entry.agents.add(r.sales_agent)
  }
  return [...map.values()]
    .map(t => ({ ...t, agentCount: t.agents.size }))
    .sort((a, b) => b.sales - a.sales)
}
