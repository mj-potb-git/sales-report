// AACIO Lead-Quality data source — HighLevel (GoHighLevel white-label) surveys.
//
// Pulls survey submissions for the two POTB surveys, classifies each lead's
// employment (has job vs no job) from the free-text profession answer, and
// carries the Meta ad attribution (utm_content = Ad ID) so the Lead Quality tab
// can show WHICH ads generate employed vs unemployed leads, and what professions.
//
// Auth: the Private Integration Token is injected server-side by the Vite/Vercel
// `/api/hl` proxy (Bearer + Version header) — the browser never sees it.

const BASE = '/api/hl'
const LOCATION_ID = '9nIrusxEMf4Qc9PHi6Il'

// The two surveys MJ wants (others are excluded).
export const SURVEYS = {
  pQebFRyJwwdmwglXVFJC: 'Aacio POTB Survey',
  rClDnqaM5njW4Rmw8hUj: 'POTB Survey',
}
const SURVEY_IDS = new Set(Object.keys(SURVEYS))

// Survey question custom-field ids → meaning (mapped from the live data).
const F = {
  profession: 'tGnxwpczZS7I7DgkNRYs', // free-text occupation / "trabaho"
  goal:       'MtMMTi3d57KGTbAdW2Zy', // motivation
  income:     'tpp0F6quahidgS0cLHJm', // target monthly income
  budget:     '9P5JXg2YscShdGiijzUB', // available budget
  urgency:    'Wccphxke1XID5wa2zUFw', // when they want to start
  pkg:        'UiwSbefeyVnAGdzRanBU', // package interest
}

// --- Employment classifier ---------------------------------------------------
// The profession answer is free text (English + Taglish + typos). We bucket it
// and derive a has-job / no-job flag. This is a heuristic — `bucket: 'unclear'`
// is kept separate so it never inflates either side.
export const JOB_BUCKETS = {
  employed:      { label: 'Employed',           hasJob: true },
  self_employed: { label: 'Self-employed / Biz', hasJob: true },
  ofw:           { label: 'OFW / Overseas',      hasJob: true },
  unemployed:    { label: 'Unemployed',          hasJob: false },
  housewife:     { label: 'Housewife',           hasJob: false },
  student:       { label: 'Student',             hasJob: false },
  retired:       { label: 'Retired',             hasJob: false },
  unclear:       { label: 'Unclear',             hasJob: null },
}

export function classifyProfession(raw) {
  const s = String(raw || '').trim().toLowerCase()
  if (!s || s.length < 2 || /^(test|n\/?a|na|\.|-|\d+)$/.test(s)) return 'unclear'
  // No-job signals first (some contain "employ", so must precede the employed rule)
  if (/unemploy|jobless|no\s*job|walang\s*(pong\s*)?trabaho|wala\s*(po\s*)?(pa\s*)?(akong?\s*)?trabaho|\bwala\b|hindi\s*empleyado|not\s*(currently\s*)?employ|between\s*jobs|resigned|looking\s*for\s*(a\s*)?job|hanap\s*(pa\s*)?ng\s*trabaho/.test(s)) return 'unemployed'
  if (/retir|pensioner/.test(s)) return 'retired'
  if (/student|studente|nag.?aaral|graduating|undergrad|college\s*student/.test(s)) return 'student'
  if (/house\s*wife|housewife|plain\s*house|stay.?at.?home|full.?time\s*(mom|mother)|may\s*bahay|maybahay|homemaker|plain\s*mom/.test(s)) return 'housewife'
  if (/\bofw\b|overseas|abroad|seaman|seafarer|domestic\s*helper|\bdh\b|caregiver.*(abroad|overseas)|migrant/.test(s)) return 'ofw'
  if (/self.?employ|business|negosyo|entrepreneur|owner|freelanc|online\s*sell|reseller|sari.?sari|vendor|self\s*employ|businesswoman|businessman|proprietor/.test(s)) return 'self_employed'
  if (/employ|company|corporate|office|manager|supervisor|staff|\bagent\b|nurse|teacher|guro|professor|engineer|accountant|clerk|cashier|driver|call\s*center|\bbpo\b|government|gov'?t|police|military|soldier|admin|\bsales\b|technician|operator|worker|factory|secretary|encoder|virtual\s*assistant|\bva\b|hr\b|marketing|analyst|associate|crew|utility|guard|welder|electrician|plumber|chef|cook|waiter|barista|midwife|doctor|pharmacist|dentist|architect|lawyer|professional|call\s*agent|csr\b|rider|messenger|bookkeeper|auditor|consultant|coordinator|assistant|laborer|contractual|regular|probationary|banker|teller/.test(s)) return 'employed'
  return 'unclear'
}

// --- Mapping -----------------------------------------------------------------
function mapSubmission(s) {
  const o = s.others || {}
  const up = (o.eventData && o.eventData.url_params) || {}
  const professionRaw = String(o[F.profession] || '').trim()
  const bucket = classifyProfession(professionRaw)
  const hasJob = JOB_BUCKETS[bucket].hasJob
  return {
    id: s.id,
    surveyId: s.surveyId,
    surveyName: SURVEYS[s.surveyId] || s.surveyId,
    createdAt: s.createdAt || null,
    name: s.name || [o.first_name, o.last_name].filter(Boolean).join(' ').trim() || '—',
    email: s.email || o.email || '',
    city: o.city || '',
    profession: professionRaw,
    bucket,
    hasJob,               // true | false | null (unclear)
    goal: o[F.goal] || '',
    income: o[F.income] || '',
    budget: o[F.budget] || '',
    urgency: o[F.urgency] || '',
    pkg: o[F.pkg] || '',
    // Meta ad attribution
    platform: (up.utm_source || '').toLowerCase(),      // fb | ig | an
    adId: up.utm_content || '',                          // the specific AD
    adsetId: up.utm_term || '',
    campaignId: up.utm_campaign || up.utm_id || '',
  }
}

// --- Fetch (paginated + cached) ----------------------------------------------
const CACHE_TTL_MS = 5 * 60_000
let cache = null, cachedAt = 0, inFlight = null

async function getPage(page) {
  const url = `${BASE}/surveys/submissions?locationId=${LOCATION_ID}&limit=100&page=${page}`
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20000) })
  if (!res.ok) throw new Error(`HighLevel surveys API ${res.status}`)
  return res.json()
}

/**
 * Fetch ALL submissions for the two POTB surveys (paginated), mapped + classified.
 * Cached with TTL. Returns [] on failure (keeps last good).
 */
export async function fetchLeadQualitySubmissions({ force = false } = {}) {
  const now = Date.now()
  if (!force && cache && now - cachedAt < CACHE_TTL_MS) return cache
  if (inFlight) return inFlight

  inFlight = (async () => {
    // Page 1 tells us the total; fetch the rest in parallel batches (sequential
    // pagination over ~23 pages is too slow through the proxy).
    const first = await getPage(1)
    const total = (first.meta && first.meta.total) || (first.submissions || []).length
    const pages = Math.min(40, Math.max(1, Math.ceil(total / 100))) // safety cap ~4000
    const all = [first]
    const CONCURRENCY = 6
    for (let start = 2; start <= pages; start += CONCURRENCY) {
      const batch = []
      for (let p = start; p < start + CONCURRENCY && p <= pages; p++) batch.push(getPage(p).catch(() => null))
      all.push(...(await Promise.all(batch)))
    }
    const out = []
    for (const j of all) {
      if (!j) continue
      for (const s of (j.submissions || [])) if (SURVEY_IDS.has(s.surveyId)) out.push(mapSubmission(s))
    }
    cache = out
    cachedAt = Date.now()
    return out
  })().finally(() => { inFlight = null })

  return inFlight
}

export function invalidateLeadQualityCache() { cache = null; cachedAt = 0 }

// --- Aggregation -------------------------------------------------------------
/**
 * Group submissions by Meta Ad (utm_content). For each ad: total leads, has-job
 * vs no-job vs unclear counts, and the profession-bucket breakdown + top raw
 * professions. Sorted by no-job count desc (MJ wants to spot ads bringing
 * unemployed leads).
 */
export function groupByAd(subs) {
  const map = new Map()
  for (const s of subs) {
    const key = s.adId || '(no ad id)'
    let g = map.get(key)
    if (!g) {
      g = {
        adId: s.adId || '', platform: s.platform || '', adsetId: s.adsetId || '', campaignId: s.campaignId || '',
        total: 0, hasJob: 0, noJob: 0, unclear: 0,
        buckets: {}, professions: {},
      }
      map.set(key, g)
    }
    g.total++
    if (s.hasJob === true) g.hasJob++
    else if (s.hasJob === false) g.noJob++
    else g.unclear++
    g.buckets[s.bucket] = (g.buckets[s.bucket] || 0) + 1
    if (s.profession) g.professions[s.profession] = (g.professions[s.profession] || 0) + 1
    if (!g.platform && s.platform) g.platform = s.platform
    if (!g.adsetId && s.adsetId) g.adsetId = s.adsetId
    if (!g.campaignId && s.campaignId) g.campaignId = s.campaignId
  }
  const rows = [...map.values()].map(g => ({
    ...g,
    noJobPct: g.total ? Math.round((g.noJob / g.total) * 100) : 0,
    hasJobPct: g.total ? Math.round((g.hasJob / g.total) * 100) : 0,
    topProfessions: Object.entries(g.professions).sort((a, b) => b[1] - a[1]).slice(0, 5),
  }))
  rows.sort((a, b) => b.noJob - a.noJob || b.total - a.total)
  return rows
}

/** Overall totals across a submission list. */
export function summarize(subs) {
  const t = { total: subs.length, hasJob: 0, noJob: 0, unclear: 0, buckets: {}, ads: new Set() }
  for (const s of subs) {
    if (s.hasJob === true) t.hasJob++
    else if (s.hasJob === false) t.noJob++
    else t.unclear++
    t.buckets[s.bucket] = (t.buckets[s.bucket] || 0) + 1
    if (s.adId) t.ads.add(s.adId)
  }
  t.adCount = t.ads.size
  return t
}
