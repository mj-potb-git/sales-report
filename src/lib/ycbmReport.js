// Accumulating store of uploaded YCBM report bookings, per account
// ('acquisition' | 'aacio'). The YCBM export only reaches ~30 days back, so MJ
// uploads regularly and we ACCUMULATE: new bookings are added, ones we've seen
// before (same booking Id) are UPDATED with the latest values (time/duration
// can change), and nothing already saved is lost as the export window slides.
//
// This is the source of truth when present (the live API undercounts busy days).
// Persisted in localStorage; components subscribe to re-render on change.

const KEY = (account) => `potb_ycbm_report_store_${account}`
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

function read(account) {
  try {
    const raw = localStorage.getItem(KEY(account))
    if (!raw) return {}
    const o = JSON.parse(raw)
    return o && typeof o === 'object' ? o : {}
  } catch { return {} }
}
function write(account, map) {
  try { localStorage.setItem(KEY(account), JSON.stringify(map)) } catch { /* quota */ }
}

/**
 * Merge freshly-parsed report bookings into the accumulated store.
 * Dedups by booking Id: new → added; already-seen → updated (latest wins).
 * Returns { added, updated, total }.
 */
export function mergeReport(account, bookings) {
  const store = read(account)
  let added = 0, updated = 0
  for (const b of bookings) {
    if (store[b.id]) updated++; else added++
    store[b.id] = b
  }
  write(account, store)
  notify()
  return { added, updated, total: Object.keys(store).length }
}

/** All accumulated report bookings for an account. */
export function getReportBookings(account) {
  return Object.values(read(account))
}

/** Summary: total, date range, last-updated. */
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
  try { localStorage.removeItem(KEY(account)) } catch { /* ignore */ }
  notify()
}

/**
 * Union the live API bookings with the accumulated report.
 *
 * The live API is COMPLETE and CORRECT for the bookings it returns (full coach
 * via teamMember + real true/false noShow — verified: a past week returns 0
 * nulls). Its only weakness is COVERAGE: it silently drops some bookings on
 * busy same-minute slots (YCBM's 10/page + `from`-cursor limit) and can't reach
 * far back. The uploaded report has every booking but its columns can be thin
 * (blank Team/No-Show in some exports).
 *
 * So: LIVE is authoritative for shared bookings (never let a thin report blank
 * clobber a good live coach/attendance); the report only ADDS bookings the live
 * feed is missing, and back-fills individual fields the live record lacks.
 */
export function mergeWithReport(apiBookings, account) {
  const liveById = new Map(apiBookings.map(b => [b.id, b]))
  const map = new Map(liveById)
  for (const r of getReportBookings(account)) {
    const live = liveById.get(r.id)
    if (!live) {
      // Booking the live feed never returned (older than its window, or dropped
      // on a busy slot) — take the report's copy as-is.
      map.set(r.id, r)
    } else {
      // Booking in both: keep live, but back-fill any field live is missing
      // from the report (so a thin export can never erase good live data).
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
