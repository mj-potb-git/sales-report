// LakbayHub utilities API client.
// All requests go through the Vite proxy at /api/lakbay so the API origin
// is consistent in production-style deployments (and so we can inject auth
// later without touching call sites).

const BASE = '/api/lakbay'

async function get(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new Error(`LakbayHub API ${res.status}: ${res.statusText}`)
  const json = await res.json()
  if (!json.status) throw new Error(json.message || 'LakbayHub API error')
  return json.data ?? []
}

export const fetchSignupsReport = () => get('/signups/sales-report')

// AACIO external-team sales live in LakbayHub under clusters named either
// "AACIO <coach>" or "EXTERNAL COACH - <coach>". Keyword match so any future
// external coach is auto-included.
// Rule (per MJ): cluster name containing "aacio" or "external" → belongs to
// AACIO, excluded from every POTB view (Acquisition / Insights / Operations).
export const isExternalCluster = (team) => /external|aacio/i.test(team || '')

// Whole-record predicate: AACIO purely by CLUSTER PREFIX. The same coach does
// both jobs, distinguished by their cluster tag: "AACIO <coach>" / "EXTERNAL
// COACH - <coach>" → AACIO; "ACQUISITION - <coach>" (and "2GO - FREE ACCOUNT")
// → POTB acquisition. Clusters are now cleanly tagged, so the old payment-link
// override was dropped (it was mis-moving legit "ACQUISITION -" sales to AACIO).
export function isExternalRecord(r) {
  return isExternalCluster(r?.team)
}

// LakbayHub leaves `sales_closer` blank on ~100% of records — the real closer
// is encoded in the cluster name (e.g. "ACQUISITION - MARTIN"). Extract it so
// attribution (Top Closer, per-agent breakdown) shows a real name instead of
// "Unassigned". Returns '' when the cluster has no recognizable coach name.
const titleCase = (s) => (s || '').split(/\s+/).map(w => w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w).join(' ')

// Display aliases — the LakbayHub cluster name isn't always what the team calls
// the coach. Per MJ, "Angel"/"Angelyn" is the agent they log as "JAS". Applied
// so every view (cards, Top Closer, per-agent, reports) reads the team's name.
export const COACH_DISPLAY_ALIAS = { angel: 'JAS', angelyn: 'JAS' }
const aliasCoach = (name) => COACH_DISPLAY_ALIAS[(name || '').toLowerCase()] || name

export function coachFromCluster(cluster) {
  const t = (cluster || '').trim()
  if (!t) return ''
  let m
  if ((m = t.match(/^acquisition\s*-\s*(.+)$/i)))     return aliasCoach(titleCase(m[1].trim()))
  if ((m = t.match(/external\s+coach\s*-\s*(.+)$/i))) return aliasCoach(titleCase(m[1].trim()))
  if ((m = t.match(/^aacio\s+(.+)$/i)))               return aliasCoach(titleCase(m[1].trim()))
  return ''
}

// ---------------------------------------------------------------------------
// Map a raw LakbayHub record → the internal schema the Sales tab expects.
//
// LakbayHub fields:
//   lead_name, email, sales_call_date, sales_closer, date_paid, amount_paid,
//   payment_screenshot, payment_link_used, cluster_name, cluster_id,
//   payment_status, payment_option_used, account_status, facebook_profile,
//   package_avail
//
// Our internal Sales schema:
//   sales_agent, team, date, sales_amount, signup_count, transaction_id,
//   customer_name
//
// Extra LakbayHub fields are preserved on the mapped record under `meta` so
// drill-down views can surface them without re-fetching.
// A single POTB/AACIO sale is at most a few hundred-K; anything above this is a
// data-entry typo (an extra run of zeros — e.g. a ₱30B record under "ACQUISITION
// - PRINCESS" that blew up her SRP and the revenue totals). Such a typo is almost
// always a mistyped FULL payment, so instead of dropping it to 0 we CORRECT it to
// the package's full price (the real intended amount) and flag it for review. The
// original value is kept in meta.raw_amount.
const MAX_REASONABLE_AMOUNT = 1_000_000

// Standard full price per package (confirmed from the data's modal amounts).
export function packageFullPrice(pkg) {
  const p = (pkg || '').toUpperCase()
  if (p.includes('ADVENTURER')) return 69990
  if (p.includes('TRAVELPRE'))  return 14999   // TRAVELPRENEUR / common "TRAVELPRENUER" misspelling
  if (p.includes('STARTER'))    return 9999
  return null
}

export function mapLakbayHubRecord(r, idx) {
  const date       = r.date_paid || r.sales_call_date || null
  const rawAmount  = Number(r.amount_paid) || 0
  const suspicious = rawAmount > MAX_REASONABLE_AMOUNT
  const fullPrice  = packageFullPrice(r.package_avail)
  // Correct an absurd typo to the package's full price (best-guess intended
  // value); fall back to 0 only if the package is unknown.
  const amount     = suspicious ? (fullPrice || 0) : rawAmount
  const closer  = r.sales_closer?.trim() || ''
  const cluster = r.cluster_name?.trim() || ''

  // Data-quality flags so the dashboard can surface (instead of silently
  // dropping) records that LakbayHub left incomplete.
  // NOTE: sales_closer is null on ~100% of records (attribution lives in
  // cluster_name), so we only flag truly unattributed rows — no closer AND
  // no cluster — not every missing closer.
  const reviewReasons = []
  if (!date)              reviewReasons.push('no date')         // can't be placed in any period
  if (suspicious)         reviewReasons.push(`amount typo (₱${rawAmount.toLocaleString()}) — corrected to ${fullPrice ? '₱' + fullPrice.toLocaleString() + ' (full package price)' : '₱0'}`)
  else if (!amount)       reviewReasons.push('zero amount')     // paid record with no amount
  if (!closer && !cluster) reviewReasons.push('no attribution') // no closer AND no cluster

  return {
    sales_agent: closer || coachFromCluster(cluster) || 'Unassigned',
    team:        r.cluster_name?.trim() || 'No Cluster',
    date,
    sales_amount: amount,
    signup_count: 1,
    transaction_id: `LBH-${idx}-${(r.email || 'unknown').replace(/[^a-z0-9]/gi, '')}`,
    customer_name: r.lead_name || 'Unknown',
    needsReview:   reviewReasons.length > 0,
    reviewReasons,
    meta: {
      email:          r.email,
      payment_status: r.payment_status,
      account_status: r.account_status,
      package:        r.package_avail,
      facebook:       r.facebook_profile,
      payment_link:   r.payment_link_used,
      cluster_id:     r.cluster_id,
      ...(suspicious ? { raw_amount: rawAmount } : {}),
    },
  }
}
