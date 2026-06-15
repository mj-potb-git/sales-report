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

// Safety net: specific payment links MJ confirmed are AACIO-only. A sale that
// came through one of these belongs to AACIO even if its cluster was not
// tagged "AACIO" on the LakbayHub side. Matched against meta.payment_link.
// (Coaches: ANGEL, MARTIN, SHEILA, PRINCESS, MARIA — their dedicated AACIO links.)
const AACIO_PAYMENT_LINK_IDS = [
  '1779268082903', // MARTIN
  '1779268119560', // SHEILA
  '1779268142849', // PRINCESS
  '1779268182949', // MARIA
  '1778641884774', // ANGEL
]

// Whole-record predicate: AACIO if the cluster name matches OR the sale used a
// known AACIO payment link. Operates on a mapped record (team + meta.payment_link).
export function isExternalRecord(r) {
  if (isExternalCluster(r?.team)) return true
  const link = r?.meta?.payment_link || ''
  return AACIO_PAYMENT_LINK_IDS.some(id => link.includes(id))
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
export function mapLakbayHubRecord(r, idx) {
  const date    = r.date_paid || r.sales_call_date || null
  const amount  = Number(r.amount_paid) || 0
  const closer  = r.sales_closer?.trim() || ''
  const cluster = r.cluster_name?.trim() || ''

  // Data-quality flags so the dashboard can surface (instead of silently
  // dropping) records that LakbayHub left incomplete.
  // NOTE: sales_closer is null on ~100% of records (attribution lives in
  // cluster_name), so we only flag truly unattributed rows — no closer AND
  // no cluster — not every missing closer.
  const reviewReasons = []
  if (!date)              reviewReasons.push('no date')         // can't be placed in any period
  if (!amount)            reviewReasons.push('zero amount')     // paid record with no amount
  if (!closer && !cluster) reviewReasons.push('no attribution') // no closer AND no cluster

  return {
    sales_agent: closer || 'Unassigned',
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
    },
  }
}
