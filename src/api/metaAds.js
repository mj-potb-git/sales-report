// Per-AD performance from the Meta Marketing API, for the Ads tab.
// Goal: surface which ads generate leads/conversations cheaply, and flag the
// ones quietly burning budget with little/no result so MJ can turn them off.
//
// All calls go through the /api/meta proxy (token injected server-side).

const BASE = '/api/meta'

async function get(path) {
  const res = await fetch(`${BASE}${path}`, { headers: { Accept: 'application/json' } })
  if (!res.ok) {
    let err = `Meta API ${res.status}`
    try { const j = await res.json(); err = j.error?.message || err } catch { /* ignore */ }
    throw new Error(err)
  }
  return res.json()
}

// Meta date_preset only accepts these day counts; otherwise use time_range.
const SUPPORTED = new Set([3, 7, 14, 28, 30, 90])
function dateRangeQuery(days) {
  if (SUPPORTED.has(days)) return `date_preset=last_${days}d`
  const now = new Date()
  const since = new Date(now.getTime() - (days - 1) * 86400000)
  const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return `time_range=${encodeURIComponent(JSON.stringify({ since: ymd(since), until: ymd(now) }))}`
}

// A Meta "lead" can arrive under several action_type names; sum them all.
const LEAD_TYPES = [
  'onsite_conversion.lead',
  'offsite_complete_registration_add_meta_leads',
  'offsite_search_add_meta_leads',
  'onsite_web_lead',
  'lead',
]
// Messenger conversations started — POTB also books via Messenger, so a new
// conversation is a real lead-gen outcome.
const MSG_TYPES = ['onsite_conversion.messaging_conversation_started_7d']

const num = v => Number(v) || 0
function sumActions(actions, types) {
  if (!Array.isArray(actions)) return 0
  return actions.filter(a => types.includes(a.action_type)).reduce((s, a) => s + num(a.value), 0)
}

/**
 * Verdict for a single ad given the account's average cost-per-result.
 * tag: 'off' | 'watch' | 'winner' | 'ok' | 'paused'
 */
function verdictFor(ad, avgCpr) {
  if (ad.status !== 'ACTIVE') return { tag: 'paused', label: 'Naka-OFF', reasons: [] }
  const reasons = []
  const peso = n => `₱${Math.round(n).toLocaleString()}`

  // Burning budget with nothing to show.
  if (ad.results === 0 && ad.spend >= 300) {
    return { tag: 'off', label: 'I-OFF', reasons: [`${peso(ad.spend)} gastos, 0 lead/usapan`] }
  }
  // Way more expensive per result than the account average.
  if (ad.cpr != null && avgCpr && ad.spend >= 500 && ad.cpr > 2.5 * avgCpr) {
    return { tag: 'off', label: 'I-OFF', reasons: [`CPL ${peso(ad.cpr)} — ${(ad.cpr / avgCpr).toFixed(1)}× ng average (${peso(avgCpr)})`] }
  }
  // Pricey but still converting — watch it.
  if (ad.cpr != null && avgCpr && ad.cpr > 1.5 * avgCpr) {
    reasons.push(`Mahal ang CPL: ${peso(ad.cpr)} vs avg ${peso(avgCpr)}`)
    return { tag: 'watch', label: 'Bantayan', reasons }
  }
  // Cheap per result + decent volume — keep/scale.
  if (ad.cpr != null && avgCpr && ad.cpr <= avgCpr && ad.results >= 5) {
    return { tag: 'winner', label: 'Panalo', reasons: [`Mura ang CPL (${peso(ad.cpr)}) + maganda ang dami`] }
  }
  return { tag: 'ok', label: 'OK', reasons: [] }
}

/**
 * Fetch per-ad performance for the last `days`, joined with each ad's on/off
 * status, with a computed verdict per ad and an account summary.
 */
export async function fetchAdPerformance({ days = 30 } = {}) {
  const fields = 'ad_id,ad_name,campaign_name,adset_name,spend,impressions,clicks,actions'
  const [insightsJson, adsJson] = await Promise.all([
    get(`/insights?level=ad&fields=${fields}&${dateRangeQuery(days)}&limit=1000`),
    get(`/ads?fields=id,name,effective_status&limit=1000`).catch(() => ({ data: [] })),
  ])
  const statusById = new Map((adsJson.data || []).map(a => [a.id, a.effective_status]))

  let totalSpend = 0, totalLeads = 0, totalMsg = 0
  const ads = (insightsJson.data || []).map(row => {
    const spend = Math.round(num(row.spend))
    const leads = sumActions(row.actions, LEAD_TYPES)
    const msg = sumActions(row.actions, MSG_TYPES)
    const results = leads + msg
    totalSpend += spend; totalLeads += leads; totalMsg += msg
    return {
      id: row.ad_id,
      name: row.ad_name || '(walang pangalan)',
      campaign: row.campaign_name || '',
      adset: row.adset_name || '',
      status: statusById.get(row.ad_id) || 'UNKNOWN',
      spend, leads, msg, results,
      impressions: num(row.impressions),
      clicks: num(row.clicks),
      cpr: results > 0 ? Math.round(spend / results) : null, // cost per result (lead+msg)
    }
  })

  const totalResults = totalLeads + totalMsg
  const avgCpr = totalResults > 0 ? totalSpend / totalResults : 0
  for (const ad of ads) ad.verdict = verdictFor(ad, avgCpr)
  ads.sort((a, b) => b.spend - a.spend)

  const activeAds = ads.filter(a => a.status === 'ACTIVE')
  const toTurnOff = activeAds.filter(a => a.verdict.tag === 'off')
  const wastedSpend = toTurnOff.reduce((s, a) => s + a.spend, 0)

  return {
    ads,
    summary: {
      totalSpend, totalLeads, totalMsg, totalResults,
      avgCpr: Math.round(avgCpr),
      adCount: ads.length,
      activeCount: activeAds.length,
      turnOffCount: toTurnOff.length,
      wastedSpend,
    },
    toTurnOff,
  }
}
