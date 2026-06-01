// Sale Date Corrections — Supabase-backed.
//
// Lets the manager re-date a late-posted sale to its true close date so the
// by-date sales report is accurate. Same design as lib/attendance.js:
//   - load all overrides into an in-memory cache on boot
//   - synchronous reads from cache
//   - optimistic writes (update cache + fire event, then upsert/delete on
//     Supabase in the background)
//   - poll every 30s for changes from other devices
//
// A record's stable key = `${email|customerName}__${originalDate}__${amount}`.
// LakbayHub exposes no stable per-row id, so we derive one from fields that
// don't change (the lead identity + the ORIGINAL posting date + the amount).

import { getSupabase } from '../api/supabase'

const POLL_MS = 30_000
const FALLBACK_KEY = 'salesDashboard.saleDateOverrides.cache.v1'

let cache = new Map()      // record_key → { effectiveDate, originalDate, note }
let loaded = false
let loadPromise = null
let pollerStarted = false

/** Stable key for a sales record (uses the ORIGINAL date, never the corrected one). */
export function keyForRecord(r) {
  const id = (r.meta?.email || r.customer_name || 'unknown').toString().trim().toLowerCase()
  const baseDate = r.originalDate || r.date || ''
  const amount = Math.round(Number(r.sales_amount) || 0)
  return `${id}__${baseDate}__${amount}`
}

function fireChange() {
  try {
    const obj = {}
    for (const [k, v] of cache) obj[k] = v
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(obj))
  } catch { /* ignore quota errors */ }
  window.dispatchEvent(new Event('sale-overrides-changed'))
}

function bootFromFallback() {
  try {
    const raw = localStorage.getItem(FALLBACK_KEY)
    if (!raw) return
    cache = new Map(Object.entries(JSON.parse(raw)))
  } catch { /* ignore */ }
}

async function loadFromSupabase() {
  const { data, error } = await getSupabase()
    .from('sale_date_overrides')
    .select('record_key, effective_date, original_date, note')
  if (error) throw error
  const m = new Map()
  for (const r of data || []) {
    m.set(r.record_key, { effectiveDate: r.effective_date, originalDate: r.original_date, note: r.note })
  }
  return m
}

export function ensureLoaded() {
  if (loaded) return Promise.resolve()
  if (loadPromise) return loadPromise
  bootFromFallback()
  loadPromise = (async () => {
    try {
      cache = await loadFromSupabase()
      loaded = true
      fireChange()
    } catch (err) {
      console.warn('[saleDateOverrides] initial load failed, using fallback:', err.message)
    }
  })()
  return loadPromise
}

export function startSaleOverridePoller() {
  if (pollerStarted) return
  pollerStarted = true
  ensureLoaded()
  setInterval(async () => {
    if (document.hidden) return
    try {
      const fresh = await loadFromSupabase()
      let changed = fresh.size !== cache.size
      if (!changed) for (const [k, v] of fresh) {
        const p = cache.get(k)
        if (!p || p.effectiveDate !== v.effectiveDate) { changed = true; break }
      }
      if (changed) { cache = fresh; loaded = true; fireChange() }
    } catch { /* keep cache */ }
  }, POLL_MS)
}

/** Returns the override for a record key, or undefined. */
export function getOverride(key) {
  return cache.get(key)
}

/** Number of active corrections (for UI badges). */
export function overrideCount() {
  return cache.size
}

/**
 * Set/clear a correction. Pass effectiveDate=null to remove it.
 * originalDate/note are stored for audit + display.
 */
export function setOverride(key, effectiveDate, { originalDate = null, note = '' } = {}) {
  if (!effectiveDate) {
    cache.delete(key)
    fireChange()
    getSupabase().from('sale_date_overrides').delete().eq('record_key', key)
      .then(({ error }) => { if (error) console.warn('[saleDateOverrides] delete failed:', error.message) })
    return
  }
  cache.set(key, { effectiveDate, originalDate, note })
  fireChange()
  getSupabase().from('sale_date_overrides').upsert(
    { record_key: key, effective_date: effectiveDate, original_date: originalDate, note, updated_at: new Date().toISOString() },
    { onConflict: 'record_key' },
  ).then(({ error }) => { if (error) console.warn('[saleDateOverrides] upsert failed:', error.message) })
}

/**
 * Apply corrections to a list of sales records. Returns a new array where any
 * record with an override gets its `date` replaced by the corrected date, plus
 * `originalDate` + `corrected:true` so the UI can flag it. Pure/synchronous —
 * relies on the cache already being warm (ensureLoaded on boot).
 */
export function applyOverrides(records) {
  if (cache.size === 0) return records
  return records.map(r => {
    const ov = cache.get(keyForRecord(r))
    if (ov && ov.effectiveDate && ov.effectiveDate !== r.date) {
      return { ...r, date: ov.effectiveDate, originalDate: r.date, corrected: true, correctionNote: ov.note }
    }
    return r
  })
}

export function subscribeSaleOverrides(handler) {
  const fn = () => handler()
  window.addEventListener('sale-overrides-changed', fn)
  return () => window.removeEventListener('sale-overrides-changed', fn)
}
