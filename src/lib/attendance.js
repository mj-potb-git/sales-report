// Attendance tracker for YCBM bookings.
// YCBM does not track show-ups/no-shows in their API, so we maintain it
// client-side in localStorage. Easy to migrate to a Supabase table later
// (see comments at bottom for schema).
//
// Status values:
//   'showed'  — customer attended the session
//   'no_show' — customer didn't show up
//   undefined — not yet marked

const STORAGE_KEY = 'salesDashboard.attendance.v1'

function readStored() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

function writeStored(map) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  window.dispatchEvent(new Event('attendance-changed'))
}

/** Get status for one booking. Returns 'showed' | 'no_show' | undefined */
export function getStatus(bookingId) {
  const stored = readStored()
  return stored[bookingId]?.status
}

/** Get the full attendance map. Returns { [bookingId]: { status, notedAt } } */
export function getAllAttendance() {
  return readStored()
}

/** Cycle: undefined → showed → no_show → undefined */
export function cycleStatus(bookingId) {
  const stored = readStored()
  const cur = stored[bookingId]?.status
  const next = cur === undefined ? 'showed'
             : cur === 'showed'  ? 'no_show'
             : undefined
  if (next === undefined) delete stored[bookingId]
  else                    stored[bookingId] = { status: next, notedAt: new Date().toISOString() }
  writeStored(stored)
  return next
}

/** Set explicitly */
export function setStatus(bookingId, status) {
  const stored = readStored()
  if (!status) delete stored[bookingId]
  else         stored[bookingId] = { status, notedAt: new Date().toISOString() }
  writeStored(stored)
}

/** Aggregate stats over a list of bookings */
export function attendanceStats(bookings) {
  const map = readStored()
  let showed = 0, noShow = 0, unset = 0
  for (const b of bookings) {
    const s = map[b.id]?.status
    if (s === 'showed')  showed++
    else if (s === 'no_show') noShow++
    else unset++
  }
  const tracked = showed + noShow
  const showUpRate = tracked > 0 ? Math.round((showed / tracked) * 100) : null
  return { showed, noShow, unset, tracked, total: bookings.length, showUpRate }
}

/** Subscribe to changes (returns unsubscribe fn) */
export function subscribeAttendance(handler) {
  const fn = () => handler()
  window.addEventListener('attendance-changed', fn)
  return () => window.removeEventListener('attendance-changed', fn)
}

// ---------------------------------------------------------------------------
// Bulk operations & auto-inference helpers
// ---------------------------------------------------------------------------

/** Apply a status to many bookings at once (single localStorage write) */
export function bulkSet(updates) {
  const stored = readStored()
  for (const { bookingId, status } of updates) {
    if (!status) delete stored[bookingId]
    else         stored[bookingId] = { status, notedAt: new Date().toISOString() }
  }
  writeStored(stored)
}

/** Clear all attendance markings */
export function clearAll() {
  localStorage.removeItem(STORAGE_KEY)
  window.dispatchEvent(new Event('attendance-changed'))
}

// Normalize a name for comparison: lowercase, strip punctuation, collapse spaces
function normalizeName(s) {
  return (s || '').toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim()
}

// Get the first name (first word) for loose matching
function firstName(s) {
  return normalizeName(s).split(' ')[0] || ''
}

/**
 * Infer attendance from LakbayHub sales records.
 * Strategy:
 *  - 'sales_then_unset'    — matched-to-sale = showed; rest stay unset
 *  - 'sales_then_no_show'  — matched-to-sale = showed; rest = no_show
 *  - 'all_showed'          — mark every past booking as showed
 *  - 'all_no_show'         — mark every past booking as no_show
 *
 * Returns an array of { bookingId, status, reason } updates ready for bulkSet.
 * Only acts on past, non-cancelled bookings.
 */
export function inferAttendance(bookings, salesRecords, strategy = 'sales_then_no_show') {
  // Index sales by date for fast lookup
  const salesByDate = new Map()
  for (const s of salesRecords) {
    if (!s.date) continue
    if (!salesByDate.has(s.date)) salesByDate.set(s.date, [])
    salesByDate.get(s.date).push(s)
  }

  const updates = []
  const now = Date.now()
  const MATCH_WINDOW_DAYS = 3 // how far before/after the booking to look

  for (const b of bookings) {
    const t = new Date(b.startsAt).getTime()
    if (t > now) continue                       // skip future
    if (b.raw?.cancelled) continue              // skip cancelled

    let matched = false
    if (strategy === 'sales_then_unset' || strategy === 'sales_then_no_show') {
      const bFirst = firstName(b.name)
      const bookingDateMs = new Date(b.startsAt).setHours(0, 0, 0, 0)

      for (let off = -MATCH_WINDOW_DAYS; off <= MATCH_WINDOW_DAYS; off++) {
        const d = new Date(bookingDateMs + off * 86400000)
        const k = d.toISOString().slice(0, 10)
        const sales = salesByDate.get(k)
        if (!sales) continue
        if (sales.some(s => firstName(s.customer_name) === bFirst)) {
          matched = true
          break
        }
      }
    }

    let status
    if (strategy === 'all_showed')         status = 'showed'
    else if (strategy === 'all_no_show')   status = 'no_show'
    else if (matched)                       status = 'showed'
    else if (strategy === 'sales_then_no_show') status = 'no_show'
    else                                    status = null // sales_then_unset: leave alone

    if (status) updates.push({ bookingId: b.id, status, reason: matched ? 'matched a paid sale' : 'no matching sale' })
  }

  return updates
}

// -------------------------------------------------------------
// Supabase migration sketch (future): create a `booking_attendance` table:
//
// create table public.booking_attendance (
//   booking_id text primary key,
//   status     text not null check (status in ('showed','no_show')),
//   noted_at   timestamptz not null default now(),
//   note       text
// );
// alter table public.booking_attendance enable row level security;
// create policy "attendance_read" on public.booking_attendance for select to anon, authenticated using (true);
// create policy "attendance_write" on public.booking_attendance for insert to authenticated with check (true);
// create policy "attendance_update" on public.booking_attendance for update to authenticated using (true);
//
// Then replace localStorage read/write with supabase.from('booking_attendance').upsert/.select.
