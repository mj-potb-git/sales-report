const BASE = '/api/ycbm'

async function get(path) {
  const res = await fetch(`${BASE}${path}`, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`)
  return res.json()
}

// YCBM's /bookings endpoint returns at most ~10-20 records per call, sorted by
// startsAt ascending from the `from` cursor. Without `from` it returns only
// future bookings. To collect a full historical window we paginate by
// progressively advancing `from` to the last seen booking's start time.
//
// Default window: 30 days back to 60 days forward.

// YCBM omits `noShow`, `answers`, and `teamMember` from the default booking
// payload — they only appear when explicitly requested via the `fields`
// whitelist. NOTE: a nested object like teamMember needs BOTH the parent AND
// its sub-fields listed (`teamMember,teamMember.name,teamMember.email`) — per
// YCBM staff on their forum — otherwise it comes back as an empty `{}`.
// teamMember = the assigned coach (the "Team" column in YCBM's report export).
const BOOKING_FIELDS = 'id,title,startsAt,endsAt,createdAt,cancelled,noShow,profileId,timeZone,location,accountId,tentative,teamMember,teamMember.name,teamMember.email'

// "Maria of Pinoy Online Travel Biz" / "Coach Shiela" → "Maria" / "Shiela".
// NOTE: do NOT merge names across the two separate YCBM accounts (e.g.
// Princess↔Romelyn, Angel↔Angelyn are the same people but on different YCBMs).
// Each tab shows ONLY its own account's coaches — Bookings/Acquisition use the
// main YCBM, AACIO uses its own — so we never mix one team's names into another.
export function cleanCoachName(name) {
  const c = (name || '')
    .replace(/^coach\s+/i, '')
    .replace(/\s+of\s+pinoy.*$/i, '')
    .trim()
  return c || null
}

// YCBM paginates only ~10 records/page, oldest-first from the `from` cursor, so
// a wide back-window crawls for a long time before reaching recent dates.
// Measured locally: 25d = ~75 pages / 28s. But on Vercel each page is a
// serverless round-trip (~1.5-2s), so 75 pages ≈ 150s — OVER the 120s cap, and
// the crawl was cut off before reaching the current week (Booked showed 0 live).
// 14d back ≈ ~40 pages ≈ 60-80s even on Vercel → finishes in one poll and the
// current week populates. Older history comes from the uploaded report (exact)
// via mergeWithReport; the incremental/resumable crawl extends coverage anyway.
const DEFAULT_FROM_DAYS_BACK    = 14    // ~2 weeks — finishes within budget even on slow serverless
const DEFAULT_TO_DAYS_FORWARD   = 10
const MAX_PAGES                 = 400
const PAGINATION_HARD_TIME_LIMIT = 120000 // 120s cap

function toISO(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

// Module-level cache so subsequent polls don't re-paginate from scratch.
// Stores the most-recent fetch result and the cursor we ended at.
let _bookingsCache = null  // { seen: Map, endedAt: number, window: { start, end } }

// Persist the cache to localStorage so a page reload renders instantly from
// the last successful fetch (then refreshes in the background) instead of
// re-paginating the full window — which can take 2-3 minutes on a cold load.
// v3: widened to 90 days back — bump discards the old 30-day cache so stale /
// partial data is never shown while the fuller window re-fetches.
// v5: window narrowed to 25d back + crawl made resilient/incremental — bump
// discards any stale wide-window cache that a reload would otherwise resume,
// forcing a clean crawl so the current week populates correctly.
const LS_CACHE_KEY = 'potb_ycbm_bookings_cache_v5'

function persistCache() {
  try {
    if (!_bookingsCache) return
    localStorage.setItem(LS_CACHE_KEY, JSON.stringify({
      bookings: [..._bookingsCache.seen.values()],
      endedAt:  _bookingsCache.endedAt,
      window:   _bookingsCache.window,
    }))
  } catch { /* localStorage unavailable / quota — non-fatal */ }
}

function hydrateCache() {
  if (_bookingsCache) return
  try {
    const raw = localStorage.getItem(LS_CACHE_KEY)
    if (!raw) return
    const saved = JSON.parse(raw)
    if (!Array.isArray(saved?.bookings)) return
    _bookingsCache = {
      seen:    new Map(saved.bookings.map(b => [b.id, b])),
      endedAt: saved.endedAt || 0,
      window:  saved.window || { start: 0, end: 0 },
    }
  } catch { /* corrupt cache — ignore */ }
}

export async function fetchBookings({
  fromDaysBack    = DEFAULT_FROM_DAYS_BACK,
  toDaysForward   = DEFAULT_TO_DAYS_FORWARD,
} = {}) {
  hydrateCache()  // seed from localStorage on first call after a reload

  // Round to start-of-day so the window (and thus the cache key) is stable
  // across calls within the same day — otherwise the ms-level drift in `now`
  // would invalidate the cache on every poll and force a full re-paginate.
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0)
  const startOfWindow = new Date(dayStart.getTime() - fromDaysBack  * 86400000)
  const endOfWindow   = new Date(dayStart.getTime() + (toDaysForward + 1) * 86400000 - 1)

  // FAST PATH: let the server paginate (one request) instead of crawling ~40
  // pages from the browser — which is too slow on Vercel and left the current
  // week empty. Falls through to the client crawl below if the endpoint is
  // unavailable (older deploy) or returns nothing.
  try {
    const qs = new URLSearchParams({ account: 'ycbm', fromDaysBack: String(fromDaysBack), toDaysForward: String(toDaysForward) })
    const res = await fetch(`/api/ycbm-bookings?${qs}`, { headers: { Accept: 'application/json' } })
    if (res.ok) {
      const arr = await res.json()
      if (Array.isArray(arr) && arr.length) {
        _bookingsCache = {
          seen: new Map(arr.map(b => [b.id, b])),
          endedAt: endOfWindow.getTime(),
          window: { start: startOfWindow.getTime(), end: endOfWindow.getTime() },
        }
        persistCache()
        return arr
      }
    }
  } catch { /* endpoint missing/failed — fall back to the client crawl */ }

  // Seed from cache when the window matches (subsequent polls). We'll still
  // re-fetch the "tail" (from latest-seen + 1s onward) to pick up new bookings.
  let seen = new Map()
  let cursorMs = startOfWindow.getTime()

  if (_bookingsCache && _bookingsCache.window.start === startOfWindow.getTime()
                    && _bookingsCache.window.end   === endOfWindow.getTime()) {
    seen = new Map(_bookingsCache.seen)
    // Refresh: start from the cached end cursor (-2 days, so we catch updates)
    cursorMs = Math.max(startOfWindow.getTime(), _bookingsCache.endedAt - 2 * 86400000)
  }

  const startTime = Date.now()
  let pages = 0
  let latestSeenMs = cursorMs

  // The API returns ≤10 bookings/page sorted by startsAt asc, and has NO offset
  // param — `from` is the only cursor. Many bookings share an EXACT startsAt
  // (group slots like 10AM/3PM). Advancing the cursor to maxStartsAt+1s would
  // skip same-second records that didn't fit in the page, undercounting badly.
  // Fix: advance the cursor to the boundary startsAt itself (no +1s) and dedup
  // by id, so overlapping records are absorbed and none are skipped.
  // Commit progress to the module + localStorage cache. Called PERIODICALLY
  // during the crawl (not just at the end) so an interruption — a new 15s poll,
  // a component unmount, or a single failed page over the ~75-request crawl —
  // never throws away what we already fetched. Because endedAt advances with
  // each commit and the window key is stable, the NEXT call resumes from the
  // cached frontier instead of restarting at -25d. That makes a cold load that
  // can't finish in one shot converge across a few polls instead of looping.
  const commit = () => {
    _bookingsCache = {
      seen: new Map(seen),
      endedAt: latestSeenMs,
      window: { start: startOfWindow.getTime(), end: endOfWindow.getTime() },
    }
    persistCache()
  }

  while (pages < MAX_PAGES && (Date.now() - startTime) < PAGINATION_HARD_TIME_LIMIT) {
    let page
    try {
      page = await get(`/bookings?from=${encodeURIComponent(toISO(new Date(cursorMs)))}&fields=${BOOKING_FIELDS}`)
    } catch {
      // A transient page failure (rate-limit / network blip) must NOT discard
      // the whole crawl. Keep what we have; the next poll resumes from here.
      break
    }
    if (!Array.isArray(page) || page.length === 0) break

    let maxTs = cursorMs
    for (const b of page) {
      seen.set(b.id, b)
      const t = new Date(b.startsAt).getTime()
      if (t > maxTs) maxTs = t
    }
    if (maxTs > latestSeenMs) latestSeenMs = maxTs
    if (pages % 5 === 0) commit()       // checkpoint progress as we go
    if (maxTs > endOfWindow.getTime()) break
    if (page.length < 10) break  // short page = no more bookings

    // Advance to the boundary timestamp (dedup absorbs overlap). If the whole
    // page sat on one second (a >10 cluster), nudge +1s to escape it.
    cursorMs = (maxTs > cursorMs) ? maxTs : (cursorMs + 1000)
    pages++
  }

  commit()

  return [...seen.values()].filter(b => {
    const t = new Date(b.startsAt).getTime()
    return t >= startOfWindow.getTime() && t <= endOfWindow.getTime()
  })
}

// Synchronously return the last cached bookings (from localStorage) so the UI
// can render instantly on load while a fresh fetch runs in the background.
export function getCachedBookings() {
  hydrateCache()
  return _bookingsCache ? [..._bookingsCache.seen.values()] : []
}

export const fetchProfiles = () => get('/profiles')
export const fetchAccount  = () => get('')

// Parse "FirstName and AppointmentType" into { name, appointmentType }
export function parseTitle(title) {
  if (!title) return { name: 'Unknown', appointmentType: '' }
  const i = title.indexOf(' and ')
  if (i === -1) return { name: title, appointmentType: '' }
  return { name: title.slice(0, i).trim(), appointmentType: title.slice(i + 5).trim() }
}

// Compute duration in minutes between two ISO datetimes
export function durationMinutes(startsAt, endsAt) {
  const start = new Date(startsAt).getTime()
  const end   = new Date(endsAt).getTime()
  return Math.round((end - start) / 60000)
}

// Format duration for display
export function formatDuration(mins) {
  if (mins >= 60 && mins % 60 === 0) return `${mins / 60} hour${mins / 60 > 1 ? 's' : ''}`
  if (mins >= 60) return `${Math.floor(mins / 60)}h ${mins % 60}m`
  return `${mins} min`
}

// Format ISO startsAt → { date: "Tue May 26, 2026", time: "8:00 PM" }
export function formatDateTime(startsAt) {
  const d = new Date(startsAt)
  const date = d.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  })
  const time = d.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
  return { date, time }
}

// Map raw API booking → display model used by components
export function mapBooking(raw, profilesById) {
  const { name, appointmentType: parsedType } = parseTitle(raw.title)
  const profile = profilesById?.[raw.profileId]
  const { date, time } = formatDateTime(raw.startsAt)
  const mins = durationMinutes(raw.startsAt, raw.endsAt)

  return {
    id: raw.id,
    name,
    date,
    time,
    duration: formatDuration(mins),
    durationMinutes: mins,
    team: profile?.subdomain ?? 'unknown',
    appointmentType: profile?.title ?? parsedType,
    status: raw.cancelled ? 'Cancelled' : (raw.noShow ? 'No Show' : null),
    // Tri-state attendance. Coaches mark every concluded session (finish →
    // noShow:false = SHOWED · no-show → noShow:true), so both bools are REAL
    // marks (a past week returns 0 nulls, verified). Only an ABSENT field
    // (future/not-yet-concluded) maps to null → upcoming downstream.
    noShow: raw.noShow === true ? true : raw.noShow === false ? false : null,
    coach: cleanCoachName(raw.teamMember?.name),   // assigned coach (Team), or null
    coachEmail: raw.teamMember?.email ?? null,
    startsAt: raw.startsAt,
    endsAt: raw.endsAt,
    timeZone: raw.timeZone,
    raw,
  }
}
