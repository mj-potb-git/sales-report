// Meta Marketing API client.
// All requests pass through /api/meta which the Vite dev server rewrites to
// https://graph.facebook.com/v21.0/<adAccountId>/<rest> with the access
// token appended server-side. Token never reaches the browser.

const BASE = '/api/meta'

async function get(path) {
  const res = await fetch(`${BASE}${path}`, { headers: { Accept: 'application/json' } })
  if (!res.ok) {
    let err = `Meta API ${res.status}`
    try { const j = await res.json(); err = j.error?.message || err } catch {}
    throw new Error(err)
  }
  return res.json()
}

// Account-level info (name, currency, status, lifetime spend)
export function fetchMetaAccount() {
  return get('?fields=name,account_status,currency,timezone_name,amount_spent,balance')
}

// Daily insights for the last N days (default 14). time_increment=1 means
// one row per day. Each row carries spend + actions array.
export function fetchMetaInsights({ days = 14 } = {}) {
  const datePreset = `last_${days}d`
  const fields = [
    'spend',
    'impressions',
    'clicks',
    'reach',
    'ctr',
    'cpc',
    'cpm',
    'actions',
    'cost_per_action_type',
    'date_start',
    'date_stop',
  ].join(',')
  return get(`/insights?fields=${fields}&date_preset=${datePreset}&time_increment=1&limit=500`).then(j => j.data || [])
}

// Lifetime insights across the whole account (single row, no breakdown)
export function fetchMetaSummary({ days = 14 } = {}) {
  const datePreset = `last_${days}d`
  const fields = ['spend', 'impressions', 'clicks', 'actions', 'cost_per_action_type', 'cpm', 'ctr'].join(',')
  return get(`/insights?fields=${fields}&date_preset=${datePreset}`).then(j => (j.data?.[0] ?? null))
}

// ---------------------------------------------------------------------------
// Action-type helpers
//
// Meta groups "actions" into many action_type values. For POTB we care about:
//   - leads:  onsite_conversion.lead, offsite_complete_registration_add_meta_leads,
//             offsite_search_add_meta_leads, lead
//   - clicks: link_click
//   - purchases: offsite_conversion.fb_pixel_purchase, purchase, omni_purchase
//
// `actions` is an array like [{ action_type, value }]. This helper sums values
// across a configurable list of action_types and returns a number.

const LEAD_TYPES = [
  'onsite_conversion.lead',
  'offsite_complete_registration_add_meta_leads',
  'offsite_search_add_meta_leads',
  'lead',
]

export function sumActions(actions, types) {
  if (!Array.isArray(actions)) return 0
  return actions
    .filter(a => types.includes(a.action_type))
    .reduce((total, a) => total + (Number(a.value) || 0), 0)
}

export const sumLeads = actions => sumActions(actions, LEAD_TYPES)

// Map raw insights row → normalized daily metric
export function mapInsightDay(row) {
  return {
    date:    row.date_start, // YYYY-MM-DD
    spend:   Number(row.spend) || 0,
    impressions: Number(row.impressions) || 0,
    clicks:  Number(row.clicks) || 0,
    leads:   sumLeads(row.actions),
    ctr:     Number(row.ctr) || 0,
    cpc:     Number(row.cpc) || 0,
    cpm:     Number(row.cpm) || 0,
    actions: row.actions || [],
  }
}

// Returns a Map<YYYY-MM-DD, mappedRow>
export async function fetchMetaDailyMap({ days = 14 } = {}) {
  const rows = await fetchMetaInsights({ days })
  const map = new Map()
  for (const r of rows) {
    const m = mapInsightDay(r)
    map.set(m.date, m)
  }
  return map
}
