// Accumulating store of uploaded YCBM report bookings, per account
// ('acquisition' = POTB YCBM | 'aacio' = AACIO YCBM).
//
// The YCBM v1 API can't fully paginate busy slots (>10 bookings sharing an exact
// start time can't be retrieved), so MJ uploads the exact YCBM CSV export and we
// ACCUMULATE: new bookings are added, ones we've seen (same Id) are updated,
// nothing already saved is lost as the export window slides.
//
// SHARED via Supabase (public.ycbm_reports): the uploader writes once and every
// invited viewer reads the same report — they never need to upload anything.
// localStorage is kept only as an instant-render + offline fallback cache (NOT
// the source of truth). Reads are synchronous (in-memory); writes update memory
// + localStorage immediately, then upsert to Supabase in the background; a poll
// pulls other users' uploads. This is the source of truth when present (the live
// API undercounts busy days).

import { getSupabase } from '../api/supabase'

const ACCOUNTS = ['acquisition', 'aacio']
const LS_KEY = (account) => `potb_ycbm_report_store_${account}`
const POLL_MS = 30_000

const listeners = new Set()
function notify() { listeners.forEach(fn => { try { fn() } catch { /* ignore */ } }) }
export function subscribeReport(handler) { listeners.add(handler); return () => listeners.delete(handler) }

const cleanCoach = (n) => (n || '').replace(/^coach\s+/i, '').replace(/\s+of\s+pinoy.*$/i, '').trim() || null

// Welcome Orientation is a general session, NOT a coaching/sales booking.
// Shared so every coaching view excludes it identically (so totals tally).
export const isOrientation = (b) =>
  /orientation/i.test(b.appointmentType || '') ||
  /orientation/i.test(b.team || '') ||
  /orientation/i.test(b.raw?.title || '')

// --- CSV parse ---------------------------------------------------------------
function parseCSV(text) {
  const rows = []; let i = 0, f = '', row = [], q = false
  while (i < text.length) {
    const c = text[i]
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++ } else q = false } else f += c }
    else { if (c === '"') q = true; else if (c === ',') { row.push(f); f = '' } else if (c === '\n') { row.push(f); rows.push(row); row = []; f = '' } else if (c === '\r') { /*skip*/ } else f += c }
    i++
  }
  if (f.length || row.length) { row.push(f); rows.push(row) }
  return rows
}

// Parse a YCBM report export → normalized bookings matching the API booking
// shape (id, name, startsAt, cancelled, status, noShow, coach, team, appointmentType).
export function parseReportCSV(text) {
  const rows = parseCSV(text)
  if (!rows.length) throw new Error('Walang laman ang file.')
  const h = rows[0].map(s => s.trim()); const ix = (n) => h.indexOf(n)
  const cId = ix('Id'), cTitle = ix('Title'), cProf = ix('Profile'), cStart = ix('Start'),
        cEnd = ix('End'), cNo = ix('No Show'), cCanc = ix('Cancelled'), cTeam = ix('Team'),
        cFn = ix('FNAME'), cMade = ix('Booking Made')
  if (cStart < 0 || cTeam < 0 || cId < 0) {
    throw new Error('Hindi YCBM report — kulang ang Id/Start/Team columns (i-export sa YCBM → Bookings → Export).')
  }
  const out = []
  for (const r of rows.slice(1)) {
    if (r.length < 6) continue
    const m = (r[cStart] || '').match(/(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/)
    if (!m || !r[cId]) continue
    const startsAt = `${m[1]}T${m[2]}:${m[3]}:00`
    const me = (r[cEnd] || '').match(/(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/)
    const mm = (cMade >= 0 ? (r[cMade] || '') : '').match(/(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/)
    const title = r[cTitle] || ''
    // No-Show: only an explicit "true"/"false" is a real mark. A BLANK cell
    // means "not yet marked" → null (NOT false/showed). Treating blanks as
    // "showed" was inflating show-up to ~100%.
    const noRaw = (cNo >= 0 ? (r[cNo] || '') : '').trim().toLowerCase()
    const noShow = noRaw === 'true' ? true : noRaw === 'false' ? false : null
    out.push({
      id: r[cId],
      name: (cFn >= 0 && r[cFn]) ? r[cFn] : (title.includes(' and ') ? title.split(' and ')[0].trim() : title),
      startsAt,
      endsAt: me ? `${me[1]}T${me[2]}:${me[3]}:00` : startsAt,
      createdAt: mm ? `${mm[1]}T${mm[2]}:${mm[3]}:00` : null,
      hour: Number(m[2]),                   // for AACIO slot matrix
      cancelled: (r[cCanc] || '').toLowerCase() === 'true',
      status: (r[cCanc] || '').toLowerCase() === 'true' ? 'Cancelled' : null,
      noShow,
      coach: cleanCoach(r[cTeam]),
      team: r[cProf] || '',                 // profile subdomain (orientation detection)
      appointmentType: r[cProf] || '',
      raw: { title, source: 'report' },
    })
  }
  return out
}

// --- In-memory store (source for synchronous reads) --------------------------
// account → { [bookingId]: booking }
const _store = {}
const _updatedAt = {}   // account → Supabase updated_at (skip re-download if unchanged)

function readLS(account) {
  try {
    const raw = localStorage.getItem(LS_KEY(account))
    if (!raw) return {}
    const o = JSON.parse(raw)
    return o && typeof o === 'object' ? o : {}
  } catch { return {} }
}
function writeLS(account, map) {
  try { localStorage.setItem(LS_KEY(account), JSON.stringify(map)) } catch { /* quota */ }
}

// Seed instantly from localStorage so the UI renders without waiting on network.
for (const acc of ACCOUNTS) _store[acc] = readLS(acc)

// --- Supabase sync (shared across all viewers) -------------------------------
async function loadFromSupabase(account) {
  const { data, error } = await getSupabase()
    .from('ycbm_reports')
    .select('bookings, updated_at')
    .eq('account', account)
    .maybeSingle()
  if (error) throw error
  if (!data) return false   // no shared row yet
  const arr = Array.isArray(data.bookings) ? data.bookings : []
  const map = {}
  for (const b of arr) map[b.id] = b
  _store[account] = map
  _updatedAt[account] = data.updated_at
  writeLS(account, map)
  return true
}

async function pushToSupabase(account) {
  const arr = Object.values(_store[account] || {})
  const updated_at = new Date().toISOString()
  const { error } = await getSupabase()
    .from('ycbm_reports')
    .upsert({ account, bookings: arr, updated_at }, { onConflict: 'account' })
  if (error) { console.warn(`[ycbmReport] push failed (${account}):`, error.message); return }
  _updatedAt[account] = updated_at
}

let _started = false
/** Boot the shared-report sync. Idempotent — call once on app load. */
export function startReportSync() {
  if (_started) return
  _started = true

  ;(async () => {
    for (const acc of ACCOUNTS) {
      try {
        const ok = await loadFromSupabase(acc)
        if (ok) { notify(); continue }
        // No shared row yet — migrate any local-only report up so it becomes
        // visible to all viewers (e.g. a report uploaded before this change).
        const local = readLS(acc)
        if (Object.keys(local).length) {
          _store[acc] = local
          await pushToSupabase(acc)
          notify()
        }
      } catch (err) {
        console.warn(`[ycbmReport] initial load failed (${acc}):`, err.message)
      }
    }
  })()

  // Poll for other users' uploads. Cheap: check updated_at first, only pull the
  // full blob when it actually changed.
  setInterval(async () => {
    if (document.hidden) return
    for (const acc of ACCOUNTS) {
      try {
        const { data, error } = await getSupabase()
          .from('ycbm_reports')
          .select('updated_at')
          .eq('account', acc)
          .maybeSingle()
        if (error || !data) continue
        if (data.updated_at !== _updatedAt[acc]) {
          await loadFromSupabase(acc)
          notify()
        }
      } catch { /* transient — retry next tick */ }
    }
  }, POLL_MS)
}

/**
 * Merge freshly-parsed report bookings into the accumulated store.
 * Dedups by booking Id: new → added; already-seen → updated (latest wins).
 * Updates memory + localStorage immediately, then pushes the shared copy to
 * Supabase in the background. Returns { added, updated, total }.
 */
export function mergeReport(account, bookings) {
  const store = _store[account] || (_store[account] = {})
  let added = 0, updated = 0
  for (const b of bookings) {
    if (store[b.id]) updated++; else added++
    store[b.id] = b
  }
  writeLS(account, store)
  notify()
  pushToSupabase(account)   // background — share with all viewers
  return { added, updated, total: Object.keys(store).length }
}

/** All accumulated report bookings for an account. */
export function getReportBookings(account) {
  return Object.values(_store[account] || {})
}

/** Summary: total, date range. */
export function getReportMeta(account) {
  const arr = getReportBookings(account)
  if (!arr.length) return null
  const times = arr.map(b => new Date(b.startsAt).getTime()).filter(t => !isNaN(t)).sort((a, b) => a - b)
  const fmt = (ms) => new Date(ms).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
  const minMs = times.length ? times[0] : null
  const maxMs = times.length ? times[times.length - 1] : null
  return {
    total: arr.length,
    dateMin: minMs != null ? fmt(minMs) : '', dateMax: maxMs != null ? fmt(maxMs) : '',
    minMs, maxMs,
  }
}

export function clearReport(account) {
  _store[account] = {}
  try { localStorage.removeItem(LS_KEY(account)) } catch { /* ignore */ }
  notify()
  getSupabase().from('ycbm_reports').delete().eq('account', account)
    .then(({ error }) => { if (error) console.warn(`[ycbmReport] clear failed (${account}):`, error.message) })
}

/**
 * Union the live API bookings with the accumulated report.
 *
 * The live API is COMPLETE and CORRECT for the bookings it returns (full coach +
 * real true/false noShow). Its weakness is COVERAGE: it can't paginate busy
 * same-time slots, so it silently drops bookings there. The uploaded report has
 * every booking. So: LIVE is authoritative for shared booking ids (never let a
 * thin report blank clobber good live data); the report only ADDS bookings the
 * live feed is missing, and back-fills fields live lacks.
 */
export function mergeWithReport(apiBookings, account) {
  const liveById = new Map(apiBookings.map(b => [b.id, b]))
  const map = new Map(liveById)
  for (const r of getReportBookings(account)) {
    const live = liveById.get(r.id)
    if (!live) {
      map.set(r.id, r)
    } else {
      map.set(r.id, {
        ...r,
        ...live,
        coach:  live.coach || r.coach,
        noShow: (live.noShow === true || live.noShow === false) ? live.noShow : r.noShow,
      })
    }
  }
  return [...map.values()]
}
