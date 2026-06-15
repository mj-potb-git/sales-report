// Uniform period model shared by every tab's selector.
// Options: Yesterday · Today · This Week (Mon–Sun) · Monthly (pick any month).
// Plus a free Custom date selection (handled by DateRangePicker per tab).
//
// All dates use LOCAL components (PHT) — never UTC — to match the rest of the app.

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
function endOfDay(d)   { const x = new Date(d); x.setHours(23, 59, 59, 999); return x }
function startOfWeekMon(d) {
  const x = startOfDay(d)
  const day = x.getDay()            // 0 = Sun
  const diff = day === 0 ? -6 : 1 - day
  x.setDate(x.getDate() + diff)
  return x
}
function ymKey(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }

export const UNIFORM_PERIODS = [
  { id: 'yesterday', label: 'Yesterday', compareLabel: 'vs prior day' },
  { id: 'today',     label: 'Today',     compareLabel: 'vs yesterday' },
  { id: 'week',      label: 'This Week', compareLabel: 'vs last week' },
  { id: 'month',     label: 'Monthly',   compareLabel: 'vs prior month' },
]

// 'All Time' is opt-in per tab (not in the default pill set) — pass
// PERIODS_WITH_ALL to <PeriodBar periods={...} /> to expose it. Used by AACIO
// so all external sales (across months) show without changing the period.
export const ALL_TIME_PERIOD = { id: 'all', label: 'All Time', compareLabel: '' }
export const PERIODS_WITH_ALL = [...UNIFORM_PERIODS, ALL_TIME_PERIOD]

/** 'YYYY-MM' → Date(first of that month). Defaults to the current month. */
export function monthFromKey(key) {
  if (!key) { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1) }
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1)
}

/** Most-recent N months as { key:'YYYY-MM', label:'June 2026' } (newest first). */
export function monthOptions(count = 12, anchor = new Date()) {
  const out = []
  for (let i = 0; i < count; i++) {
    const d = new Date(anchor.getFullYear(), anchor.getMonth() - i, 1)
    out.push({ key: ymKey(d), label: d.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }) })
  }
  return out
}

export const currentMonthKey = () => ymKey(new Date())

/**
 * Latest 'YYYY-MM' that actually has data, from a list of 'YYYY-MM-DD' date
 * strings. Lets a tab open on the most recent month WITH activity instead of a
 * possibly-empty current month. Returns null if none.
 */
export function latestMonthKey(dateStrings = []) {
  let max = null
  for (const d of dateStrings) {
    if (d && typeof d === 'string' && (!max || d > max)) max = d
  }
  return max ? max.slice(0, 7) : null
}

/** { start, end } Date range for a period (monthKey only used when id==='month'). */
export function periodRange(periodId, monthKey, anchor = new Date()) {
  if (periodId === 'yesterday') {
    const y = startOfDay(new Date(anchor.getTime() - 86400000))
    return { start: y, end: endOfDay(y) }
  }
  if (periodId === 'week') {
    const s = startOfWeekMon(anchor)
    return { start: s, end: endOfDay(new Date(s.getTime() + 6 * 86400000)) }
  }
  if (periodId === 'month') {
    const m = monthFromKey(monthKey)
    return { start: startOfDay(m), end: endOfDay(new Date(m.getFullYear(), m.getMonth() + 1, 0)) }
  }
  if (periodId === 'all') {
    // Wide window covering all history + future bookings (YCBM books ~60d fwd).
    return { start: new Date(2000, 0, 1), end: endOfDay(new Date(anchor.getFullYear() + 1, 11, 31)) }
  }
  // today (default)
  const t = startOfDay(anchor)
  return { start: t, end: endOfDay(t) }
}

/** Day-start Dates spanning the period (oldest → newest) — for matrix columns. */
export function periodDays(periodId, monthKey, anchor = new Date()) {
  const { start, end } = periodRange(periodId, monthKey, anchor)
  const days = []
  for (let t = startOfDay(start).getTime(); t <= end.getTime(); t += 86400000) days.push(new Date(t))
  return days
}

/** Human label for the active period. */
export function periodLabelFor(periodId, monthKey) {
  if (periodId === 'month') return monthFromKey(monthKey).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })
  if (periodId === 'all') return ALL_TIME_PERIOD.label
  return UNIFORM_PERIODS.find(p => p.id === periodId)?.label || ''
}
