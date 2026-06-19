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

const DEFAULT_FROM_DAYS_BACK    = 90    // ~3 months back so per-month coach reports cover recent months
const DEFAULT_TO_DAYS_FORWARD   = 30
const MAX_PAGES                 = 400
const PAGINATION_HARD_TIME_LIMIT = 120000 // 120s cap — wider window needs more headroom on cold load

function toISO(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

// Module-level cache so subsequent polls don't re-paginate from scratch.
// Stores the most-recent fetch result and the cursor we ended at.
let _bookingsCache = null  // { seen: Map, endedAt: number, window: { start, end } }

// Persist the cache to localStorage so a page reload renders instantly from
// the last successful fetch (then refreshes in the background) instead of
// re-paginating the full window — which can take 2-3 minutes on a cold load.
// v2: cache now stores the teamMember (coach) field — bump discards the old
// v1 cache so all bookings are re-fetched with the coach attached.
const LS_CACHE_KEY = 'potb_ycbm_bookings_cache_v2'

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

  let cursor = toISO(new Date(cursorMs))
  const startTime = Date.now()
  let pages = 0
  let latestSeenMs = cursorMs

  while (pages < MAX_PAGES && (Date.now() - startTime) < PAGINATION_HARD_TIME_LIMIT) {
    const page = await get(`/bookings?from=${encodeURIComponent(cursor)}&fields=${BOOKING_FIELDS}`)
    if (!Array.isArray(page) || page.length === 0) break

    let progressed = false
    for (const b of page) {
      seen.set(b.id, b) // overwrite (refresh) is fine
      const t = new Date(b.startsAt).getTime()
      if (t > latestSeenMs) {
        latestSeenMs = t
        progressed = true
      }
    }

    if (!progressed) break // cursor stuck → done
    if (latestSeenMs > endOfWindow.getTime()) break

    cursor = toISO(new Date(latestSeenMs + 1000))
    pages++
  }

  _bookingsCache = {
    seen: new Map(seen),
    endedAt: latestSeenMs,
    window: { start: startOfWindow.getTime(), end: endOfWindow.getTime() },
  }
  persistCache()

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
    noShow: raw.noShow === true,   // YCBM's own attendance flag (source of truth)
    coach: cleanCoachName(raw.teamMember?.name),   // assigned coach (Team), or null
    coachEmail: raw.teamMember?.email ?? null,
    startsAt: raw.startsAt,
    endsAt: raw.endsAt,
    timeZone: raw.timeZone,
    raw,
  }
}
