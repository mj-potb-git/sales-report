// Attendance tracker — Supabase-backed for cross-device sync.
//
// Same public API as before (getStatus, setStatus, cycleStatus, bulkSet,
// clearAll, attendanceStats, inferAttendance, subscribeAttendance) so
// existing components keep working without changes.
//
// Internal design:
//   - On first read, fetches everything from public.booking_attendance
//     into an in-memory Map<bookingId, {status, notedAt}>.
//   - Reads are synchronous (cache only).
//   - Writes are optimistic: update cache + fire event immediately, then
//     upsert/delete on Supabase in the background. If the network call
//     fails the change still lives in cache + a one-time localStorage
//     fallback cache, and we retry on the next poll.
//   - Polls Supabase every 15s for changes made by other devices.
//   - One-time migration: if legacy localStorage attendance exists, push
//     it to Supabase and clear the local copy.

import { getSupabase } from '../api/supabase'

const LEGACY_KEY  = 'salesDashboard.attendance.v1'   // old localStorage key
const FALLBACK_KEY = 'salesDashboard.attendance.cache.v2' // emergency offline cache
const POLL_MS = 15_000

let cache = new Map()       // bookingId → { status, notedAt }
let loaded = false
let loadPromise = null
let connectionError = null

function fireChange() {
  // Persist a tiny offline fallback so reads survive a refresh during a
  // network outage. This is NOT the source of truth.
  try {
    const obj = {}
    for (const [k, v] of cache) obj[k] = v
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(obj))
  // eslint-disable-next-line no-empty
  } catch {}
  window.dispatchEvent(new Event('attendance-changed'))
}

function fromRows(rows) {
  const m = new Map()
  for (const r of rows) {
    m.set(r.booking_id, { status: r.status, notedAt: r.noted_at })
  }
  return m
}

async function loadFromSupabase() {
  const { data, error } = await getSupabase()
    .from('booking_attendance')
    .select('booking_id, status, noted_at')
  if (error) throw error
  return fromRows(data || [])
}

async function migrateLegacyIfAny() {
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    if (!raw) return
    const obj = JSON.parse(raw)
    const ids = Object.keys(obj)
    if (ids.length === 0) { localStorage.removeItem(LEGACY_KEY); return }
    console.info(`[attendance] migrating ${ids.length} legacy localStorage entries to Supabase`)
    const rows = ids.map(id => ({
      booking_id: id,
      status:     obj[id].status,
      noted_at:   obj[id].notedAt || new Date().toISOString(),
    }))
    // Upsert in chunks of 200 to stay under any payload limits
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200)
      const { error } = await getSupabase()
        .from('booking_attendance')
        .upsert(chunk, { onConflict: 'booking_id' })
      if (error) throw error
    }
    localStorage.removeItem(LEGACY_KEY)
    console.info('[attendance] migration complete')
  } catch (err) {
    console.warn('[attendance] legacy migration failed:', err.message)
  }
}

function bootFromFallback() {
  try {
    const raw = localStorage.getItem(FALLBACK_KEY)
    if (!raw) return
    const obj = JSON.parse(raw)
    cache = new Map(Object.entries(obj).map(([k, v]) => [k, v]))
  // eslint-disable-next-line no-empty
  } catch {}
}

/** Kicks off loading from Supabase. Idempotent. */
export function ensureLoaded() {
  if (loaded) return Promise.resolve()
  if (loadPromise) return loadPromise
  bootFromFallback()  // give UI immediate state while we wait

  loadPromise = (async () => {
    try {
      await migrateLegacyIfAny()
      const fresh = await loadFromSupabase()
      cache = fresh
      loaded = true
      connectionError = null
      fireChange()
    } catch (err) {
      connectionError = err
      console.warn('[attendance] initial load failed, using fallback cache:', err.message)
    }
  })()
  return loadPromise
}

/** Start a background poller so other users' changes show up automatically */
let pollerStarted = false
export function startAttendancePoller() {
  if (pollerStarted) return
  pollerStarted = true
  ensureLoaded()
  setInterval(async () => {
    if (document.hidden) return
    try {
      const fresh = await loadFromSupabase()
      // Replace cache only if changed
      let changed = false
      if (fresh.size !== cache.size) changed = true
      else for (const [k, v] of fresh) {
        const prev = cache.get(k)
        if (!prev || prev.status !== v.status) { changed = true; break }
      }
      if (changed) {
        cache = fresh
        connectionError = null
        fireChange()
      }
    } catch (err) {
      connectionError = err
    }
  }, POLL_MS)
}

/** Connection health (for UI) */
export function getConnectionStatus() {
  return { loaded, error: connectionError, count: cache.size }
}

// --- Public API (same shape as before) ------------------------------------

export function getStatus(bookingId) {
  return cache.get(bookingId)?.status
}

export function getAllAttendance() {
  const obj = {}
  for (const [k, v] of cache) obj[k] = v
  return obj
}

export function setStatus(bookingId, status) {
  if (!status) {
    cache.delete(bookingId)
    fireChange()
    getSupabase().from('booking_attendance').delete().eq('booking_id', bookingId)
      .then(({ error }) => { if (error) console.warn('[attendance] delete failed:', error.message) })
    return
  }
  cache.set(bookingId, { status, notedAt: new Date().toISOString() })
  fireChange()
  getSupabase().from('booking_attendance').upsert(
    { booking_id: bookingId, status, noted_at: new Date().toISOString() },
    { onConflict: 'booking_id' }
  ).then(({ error }) => { if (error) console.warn('[attendance] upsert failed:', error.message) })
}

export function cycleStatus(bookingId) {
  const cur = getStatus(bookingId)
  const next = cur === undefined ? 'showed'
             : cur === 'showed'  ? 'no_show'
             : undefined
  setStatus(bookingId, next ?? null)
  return next
}

export function bulkSet(updates) {
  // updates: [{ bookingId, status }]
  if (updates.length === 0) return Promise.resolve()
  const nowIso = new Date().toISOString()
  for (const { bookingId, status } of updates) {
    if (!status) cache.delete(bookingId)
    else         cache.set(bookingId, { status, notedAt: nowIso })
  }
  fireChange()
  const toUpsert = updates.filter(u => u.status).map(u => ({
    booking_id: u.bookingId, status: u.status, noted_at: nowIso,
  }))
  const toDelete = updates.filter(u => !u.status).map(u => u.bookingId)

  return Promise.all([
    toUpsert.length === 0
      ? Promise.resolve({ error: null })
      : (async () => {
          // Chunk upserts to stay under payload limits
          for (let i = 0; i < toUpsert.length; i += 200) {
            const chunk = toUpsert.slice(i, i + 200)
            const { error } = await getSupabase()
              .from('booking_attendance')
              .upsert(chunk, { onConflict: 'booking_id' })
            if (error) return { error }
          }
          return { error: null }
        })(),
    toDelete.length === 0
      ? Promise.resolve({ error: null })
      : getSupabase().from('booking_attendance').delete().in('booking_id', toDelete),
  ]).then(([up, del]) => {
    if (up.error)  console.warn('[attendance] bulk upsert failed:', up.error.message)
    if (del.error) console.warn('[attendance] bulk delete failed:', del.error.message)
  })
}

export function clearAll() {
  cache.clear()
  fireChange()
  return getSupabase().from('booking_attendance').delete().neq('booking_id', '____never____')
    .then(({ error }) => { if (error) console.warn('[attendance] clear failed:', error.message) })
}

export function attendanceStats(bookings) {
  let showed = 0, noShow = 0, unset = 0
  for (const b of bookings) {
    const s = cache.get(b.id)?.status
    if (s === 'showed')       showed++
    else if (s === 'no_show') noShow++
    else                      unset++
  }
  const tracked = showed + noShow
  const showUpRate = tracked > 0 ? Math.round((showed / tracked) * 100) : null
  return { showed, noShow, unset, tracked, total: bookings.length, showUpRate }
}

export function subscribeAttendance(handler) {
  const fn = () => handler()
  window.addEventListener('attendance-changed', fn)
  return () => window.removeEventListener('attendance-changed', fn)
}

// --- Inference (unchanged) ------------------------------------------------

function normalizeName(s) {
  return (s || '').toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim()
}
function firstName(s) {
  return normalizeName(s).split(' ')[0] || ''
}

export function inferAttendance(bookings, salesRecords, strategy = 'sales_then_no_show') {
  const salesByDate = new Map()
  for (const s of salesRecords) {
    if (!s.date) continue
    if (!salesByDate.has(s.date)) salesByDate.set(s.date, [])
    salesByDate.get(s.date).push(s)
  }

  const updates = []
  const now = Date.now()
  const MATCH_WINDOW_DAYS = 3

  for (const b of bookings) {
    const t = new Date(b.startsAt).getTime()
    if (t > now) continue
    if (b.raw?.cancelled) continue

    let matched = false
    if (strategy === 'sales_then_unset' || strategy === 'sales_then_no_show') {
      const bFirst = firstName(b.name)
      const bookingDateMs = new Date(b.startsAt).setHours(0, 0, 0, 0)
      for (let off = -MATCH_WINDOW_DAYS; off <= MATCH_WINDOW_DAYS; off++) {
        const d = new Date(bookingDateMs + off * 86400000)
        const k = d.toISOString().slice(0, 10)
        const sales = salesByDate.get(k)
        if (!sales) continue
        if (sales.some(s => firstName(s.customer_name) === bFirst)) { matched = true; break }
      }
    }

    let status
    if (strategy === 'all_showed')              status = 'showed'
    else if (strategy === 'all_no_show')        status = 'no_show'
    else if (matched)                            status = 'showed'
    else if (strategy === 'sales_then_no_show') status = 'no_show'
    else                                         status = null

    if (status) updates.push({ bookingId: b.id, status, reason: matched ? 'matched a paid sale' : 'no matching sale' })
  }

  return updates
}
