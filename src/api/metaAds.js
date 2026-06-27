// Per-AD performance from the Meta Marketing API, for the Ads tab.
// Goal: surface which ads generate leads/conversations cheaply (scale these),
// and which are quietly burning budget with little/no result (turn these off).
// Each ad links straight to Meta Ads Manager so it can be toggled there.
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

const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
function timeRangeQuery(since, until) {
  return `time_range=${encodeURIComponent(JSON.stringify({ since, until }))}`
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

const peso = n => `₱${Math.round(n).toLocaleString()}`

/**
 * Verdict for a single ad given the account's average cost-per-result.
 * tag: 'off' | 'watch' | 'winner' | 'ok' | 'paused'
 */
function verdictFor(ad, avgCpr) {
  if (ad.status !== 'ACTIVE') return { tag: 'paused', label: 'Off', reasons: [] }
  const reasons = []

  // Burning budget with nothing to show.
  if (ad.results === 0 && ad.spend >= 300) {
    return { tag: 'off', label: 'Turn off', reasons: [`${peso(ad.spend)} spent, 0 leads/chats`] }
  }
  // Way more expensive per result than the account average.
  if (ad.cpr != null && avgCpr && ad.spend >= 500 && ad.cpr > 2.5 * avgCpr) {
    return { tag: 'off', label: 'Turn off', reasons: [`Cost/lead ${peso(ad.cpr)} — ${(ad.cpr / avgCpr).toFixed(1)}× the average (${peso(avgCpr)})`] }
  }
  // Audience fatigue — being shown too often, usually with rising cost.
  if (ad.frequency >= 4 && ad.cpr != null && avgCpr && ad.cpr > avgCpr) {
    reasons.push(`Ad fatigue: seen ${ad.frequency.toFixed(1)}× per person`)
  }
  // Pricey but still converting — watch it.
  if (ad.cpr != null && avgCpr && ad.cpr > 1.5 * avgCpr) {
    reasons.unshift(`Pricey cost/lead: ${peso(ad.cpr)} vs avg ${peso(avgCpr)}`)
    return { tag: 'watch', label: 'Watch', reasons }
  }
  if (reasons.length) return { tag: 'watch', label: 'Watch', reasons }
  // Cheap per result + decent volume — keep/scale.
  if (ad.cpr != null && avgCpr && ad.cpr <= avgCpr && ad.results >= 5) {
    return { tag: 'winner', label: 'Winner', reasons: [`Cheap cost/lead (${peso(ad.cpr)}) + good volume`] }
  }
  return { tag: 'ok', label: 'OK', reasons: [] }
}

// Meta Ads Manager deep link that opens with this ad selected.
function adManagerLink(accountNum, adId) {
  if (!accountNum || !adId) return null
  return `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${accountNum}&selected_ad_ids=${adId}`
}

/**
 * Fetch per-ad performance for a date range (since/until = 'YYYY-MM-DD'),
 * joined with each ad's on/off status, with a verdict + Ads Manager link per ad
 * and an account summary, winners list, turn-off list, and per-campaign rollup.
 */
export async function fetchAdPerformance({ since, until } = {}) {
  // Default to last 30 days if no range supplied.
  if (!since || !until) {
    const now = new Date(); const from = new Date(now.getTime() - 29 * 86400000)
    since = ymd(from); until = ymd(now)
  }
  const fields = 'ad_id,ad_name,campaign_name,adset_name,spend,impressions,clicks,ctr,frequency,actions'
  const [insightsJson, adsJson, acctJson] = await Promise.all([
    get(`/insights?level=ad&fields=${fields}&${timeRangeQuery(since, until)}&limit=1000`),
    get(`/ads?fields=id,name,effective_status&limit=1000`).catch(() => ({ data: [] })),
    get(`?fields=id`).catch(() => ({})),
  ])
  const accountNum = String(acctJson.id || '').replace(/^act_/, '')
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
      name: row.ad_name || '(no name)',
      campaign: row.campaign_name || '',
      adset: row.adset_name || '',
      status: statusById.get(row.ad_id) || 'ARCHIVED',
      spend, leads, msg, results,
      impressions: num(row.impressions),
      clicks: num(row.clicks),
      ctr: num(row.ctr),               // % link clicks / impressions
      frequency: num(row.frequency),   // avg times shown per person
      cpr: results > 0 ? Math.round(spend / results) : null,
      link: adManagerLink(accountNum, row.ad_id),
    }
  })

  const totalResults = totalLeads + totalMsg
  const avgCpr = totalResults > 0 ? totalSpend / totalResults : 0
  for (const ad of ads) ad.verdict = verdictFor(ad, avgCpr)
  ads.sort((a, b) => b.spend - a.spend)

  const activeAds = ads.filter(a => a.status === 'ACTIVE')
  const toTurnOff = activeAds.filter(a => a.verdict.tag === 'off')
  const winners = activeAds.filter(a => a.verdict.tag === 'winner')
    .sort((a, b) => (a.cpr ?? Infinity) - (b.cpr ?? Infinity))
  const wastedSpend = toTurnOff.reduce((s, a) => s + a.spend, 0)

  // Per-campaign rollup (active + paused combined; ranked by spend).
  const campMap = new Map()
  for (const a of ads) {
    const k = a.campaign || '(no campaign)'
    if (!campMap.has(k)) campMap.set(k, { campaign: k, spend: 0, leads: 0, msg: 0, results: 0, ads: 0 })
    const c = campMap.get(k)
    c.spend += a.spend; c.leads += a.leads; c.msg += a.msg; c.results += a.results; c.ads += 1
  }
  const campaigns = [...campMap.values()]
    .map(c => ({ ...c, cpr: c.results > 0 ? Math.round(c.spend / c.results) : null }))
    .sort((a, b) => b.spend - a.spend)

  return {
    ads, campaigns, toTurnOff, winners,
    accountNum,
    range: { since, until },
    summary: {
      totalSpend, totalLeads, totalMsg, totalResults,
      avgCpr: Math.round(avgCpr),
      adCount: ads.length,
      activeCount: activeAds.length,
      turnOffCount: toTurnOff.length,
      winnerCount: winners.length,
      wastedSpend,
    },
  }
}
