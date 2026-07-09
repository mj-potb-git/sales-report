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

// PURCHASES — the money outcome. Meta reports the same purchase under several
// aliases; `omni_purchase` is its de-duplicated cross-channel count (and the
// matching `action_values` entry is the revenue). We pick the single highest-
// priority type that's present so we never double-count across aliases.
const PURCHASE_PRIORITY = [
  'omni_purchase',
  'onsite_web_purchase',
  'onsite_conversion.purchase',
  'offsite_conversion.fb_pixel_purchase',
  'purchase',
]

const num = v => Number(v) || 0
function sumActions(actions, types) {
  if (!Array.isArray(actions)) return 0
  return actions.filter(a => types.includes(a.action_type)).reduce((s, a) => s + num(a.value), 0)
}
// First present type in the priority list (no summing → no alias double-count).
// Works for both `actions` (count) and `action_values` (revenue) — same shape.
function pickByPriority(list, types) {
  if (!Array.isArray(list)) return 0
  for (const t of types) {
    const hit = list.find(a => a.action_type === t)
    if (hit && num(hit.value) > 0) return num(hit.value)
  }
  return 0
}
const purchaseCount = actions => pickByPriority(actions, PURCHASE_PRIORITY)
const purchaseValue = values => pickByPriority(values, PURCHASE_PRIORITY)

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
  const fields = 'ad_id,ad_name,campaign_name,adset_name,spend,impressions,clicks,ctr,frequency,actions,action_values'
  const histFields = 'ad_id,ad_name,campaign_name,spend,actions'
  const [insightsJson, adsJson, acctJson, histJson] = await Promise.all([
    get(`/insights?level=ad&fields=${fields}&${timeRangeQuery(since, until)}&limit=1000`),
    get(`/ads?fields=id,name,effective_status&limit=1000`).catch(() => ({ data: [] })),
    get(`?fields=id`).catch(() => ({})),
    // Lifetime record per ad — used to find OFF ads that historically performed
    // well (cheap cost/lead, good volume) and are worth turning back ON.
    get(`/insights?level=ad&fields=${histFields}&date_preset=maximum&limit=1000`).catch(() => ({ data: [] })),
  ])
  const accountNum = String(acctJson.id || '').replace(/^act_/, '')
  const statusById = new Map((adsJson.data || []).map(a => [a.id, a.effective_status]))

  let totalSpend = 0, totalLeads = 0, totalMsg = 0, totalPurchases = 0, totalRevenue = 0
  const ads = (insightsJson.data || []).map(row => {
    const spend = Math.round(num(row.spend))
    const leads = sumActions(row.actions, LEAD_TYPES)
    const msg = sumActions(row.actions, MSG_TYPES)
    const results = leads + msg
    const purchases = purchaseCount(row.actions)
    const revenue = Math.round(purchaseValue(row.action_values))
    totalSpend += spend; totalLeads += leads; totalMsg += msg
    totalPurchases += purchases; totalRevenue += revenue
    return {
      id: row.ad_id,
      name: row.ad_name || '(no name)',
      campaign: row.campaign_name || '',
      adset: row.adset_name || '',
      status: statusById.get(row.ad_id) || 'ARCHIVED',
      spend, leads, msg, results,
      purchases, revenue,
      cpp: purchases > 0 ? Math.round(spend / purchases) : null,   // cost per purchase
      roas: spend > 0 && revenue > 0 ? revenue / spend : null,     // return on ad spend (x)
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

  // PURCHASE WINNERS — the ads that actually drove sales in this period, ranked
  // by number of purchases (then revenue). These are the ones to scale up.
  const purchaseWinners = ads.filter(a => a.purchases > 0)
    .sort((a, b) => b.purchases - a.purchases || b.revenue - a.revenue)

  // --- "Turn ON" suggestions ------------------------------------------------
  // OFF ads with a strong LIFETIME record (cheap cost/lead + real volume) are
  // worth re-activating. Judged on lifetime numbers, not the selected period
  // (a paused ad shows 0 in the current period).
  let histSpend = 0, histResults = 0
  const histById = new Map()
  for (const row of (histJson.data || [])) {
    const sp = Math.round(num(row.spend))
    const res = sumActions(row.actions, LEAD_TYPES) + sumActions(row.actions, MSG_TYPES)
    histSpend += sp; histResults += res
    histById.set(row.ad_id, {
      name: row.ad_name || '(no name)',
      campaign: row.campaign_name || '',
      spend: sp, results: res,
      cpr: res > 0 ? Math.round(sp / res) : null,
    })
  }
  const histAvgCpr = histResults > 0 ? histSpend / histResults : 0
  const toTurnOn = []
  for (const [adId, status] of statusById) {
    if (status !== 'PAUSED') continue            // ad-level paused (campaign still runnable)
    const h = histById.get(adId)
    if (!h || h.cpr == null) continue
    if (h.results >= 20 && histAvgCpr && h.cpr <= histAvgCpr) {
      toTurnOn.push({
        id: adId, name: h.name, campaign: h.campaign,
        histSpend: h.spend, histResults: h.results, histCpr: h.cpr,
        link: adManagerLink(accountNum, adId),
      })
    }
  }
  toTurnOn.sort((a, b) => a.histCpr - b.histCpr)

  // Per-campaign rollup (active + paused combined; ranked by spend).
  const campMap = new Map()
  for (const a of ads) {
    const k = a.campaign || '(no campaign)'
    if (!campMap.has(k)) campMap.set(k, { campaign: k, spend: 0, leads: 0, msg: 0, results: 0, purchases: 0, revenue: 0, ads: 0 })
    const c = campMap.get(k)
    c.spend += a.spend; c.leads += a.leads; c.msg += a.msg; c.results += a.results
    c.purchases += a.purchases; c.revenue += a.revenue; c.ads += 1
  }
  const campaigns = [...campMap.values()]
    .map(c => ({
      ...c,
      cpr: c.results > 0 ? Math.round(c.spend / c.results) : null,
      roas: c.spend > 0 && c.revenue > 0 ? c.revenue / c.spend : null,
    }))
    .sort((a, b) => b.spend - a.spend)

  return {
    ads, campaigns, toTurnOff, winners, toTurnOn, purchaseWinners,
    accountNum,
    range: { since, until },
    histAvgCpr: Math.round(histAvgCpr),
    summary: {
      totalSpend, totalLeads, totalMsg, totalResults,
      totalPurchases, totalRevenue,
      avgCpr: Math.round(avgCpr),
      cpp: totalPurchases > 0 ? Math.round(totalSpend / totalPurchases) : null,
      roas: totalSpend > 0 && totalRevenue > 0 ? totalRevenue / totalSpend : null,
      adCount: ads.length,
      activeCount: activeAds.length,
      turnOffCount: toTurnOff.length,
      winnerCount: winners.length,
      turnOnCount: toTurnOn.length,
      purchaseWinnerCount: purchaseWinners.length,
      wastedSpend,
    },
  }
}
