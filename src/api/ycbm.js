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

// YCBM omits `noShow` (and `answers`) from the default booking payload — they
// only appear when explicitly requested via the `fields` whitelist. We list
// every field the app relies on PLUS noShow so attendance reflects YCBM's own
// "No Show" marking (the team sets this in the YCBM UI; it's the source of truth).
const BOOKING_FIELDS = 'id,title,startsAt,endsAt,createdAt,cancelled,noShow,profileId,timeZone,location,accountId,tentative'

const DEFAULT_FROM_DAYS_BACK    = 30    // 1 month back — keeps initial load fast
const DEFAULT_TO_DAYS_FORWARD   = 30
const MAX_PAGES                 = 200
const PAGINATION_HARD_TIME_LIMIT = 60000  // 60s cap — anything longer means Vite proxy is overloaded

function toISO(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

// Module-level cache so subsequent polls don't re-paginate from scratch.
// Stores the most-recent fetch result and the cursor we ended at.
let _bookingsCache = null  // { seen: Map, endedAt: number, window: { start, end } }

export async function fetchBookings({
  fromDaysBack    = DEFAULT_FROM_DAYS_BACK,
  toDaysForward   = DEFAULT_TO_DAYS_FORWARD,
} = {}) {
  const now      = new Date()
  const startOfWindow = new Date(now.getTime() - fromDaysBack    * 86400000)
  const endOfWindow   = new Date(now.getTime() + toDaysForward   * 86400000)

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

  return [...seen.values()].filter(b => {
    const t = new Date(b.startsAt).getTime()
    return t >= startOfWindow.getTime() && t <= endOfWindow.getTime()
  })
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
    startsAt: raw.startsAt,
    endsAt: raw.endsAt,
    timeZone: raw.timeZone,
    raw,
  }
}
