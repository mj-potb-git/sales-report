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
