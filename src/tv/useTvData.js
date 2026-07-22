// Data layer for the TV Sales Achievement board.
//
// Merges all three sales audiences into one live feed:
//   • Acquisition — POTB sign-ups (LakbayHub)      → fetchSalesRecords()
//   • Officers    — booking sales (Fusioo)          → fetchAllBookingTransactions()
//   • AACIO       — external team (LakbayHub split)  → getExternalSalesRecords()
//
// Acquisition + AACIO share one fast poll (LakbayHub). Account Officers (Fusioo)
// paginates slowly, so it polls INDEPENDENTLY — it never blocks or gets cut off
// by the other two, and simply fills in once its (slower) fetch completes.
//
// Every record is tagged with its `source` so the leaderboard can colour/group
// and the celebration knows which board a new sale belongs to.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import usePolling from '../hooks/usePolling'
import {
  fetchSalesRecords, getExternalSalesRecords,
  filterByRange, rangeFor, startOfMonth,
} from '../api/lakbay'
import { fetchRecentBookingTransactions, mapBookingTransaction } from '../api/fusioo'
import { packageFullPrice } from '../api/lakbayhub'
import { fetchPhotoMap, nameKey } from './agentPhotos'

const SALES_POLL_MS    = 30_000   // LakbayHub (Acquisition + AACIO)
const OFFICERS_POLL_MS = 300_000  // Fusioo (Account Officers) — 5 min; Fusioo has a
                                  // strict HOURLY rate limit, so poll gently and only
                                  // fetch this month's rows (see fetchOfficersHalf).

export const SOURCE_LABELS = {
  acquisition: 'Acquisition',
  officers:    'Account Officers',
  aacio:       'AACIO',
}

export const SOURCE_ORDER = ['acquisition', 'officers', 'aacio']

// LakbayHub half: Acquisition (POTB) + AACIO (external split). fetchSalesRecords()
// warms the external split, so we read getExternalSalesRecords() right after.
async function fetchSalesHalf() {
  const potb = await fetchSalesRecords()
  const aacio = getExternalSalesRecords()
  return { potb, aacio }
}

// Fusioo half: Account Officers. Only fetch THIS MONTH's rows (the board only
// shows today + MTD), which keeps it to ~1-2 pages and well under Fusioo's
// hourly rate limit. Newest-first, stops paginating at the start of the month.
async function fetchOfficersHalf() {
  const rows = await fetchRecentBookingTransactions({ sinceDate: startOfMonth(new Date()) })
  return rows.map(mapBookingTransaction)
}

// A stable id per record across polls (used for new-sale detection).
function recordId(r) {
  return r.transaction_id != null
    ? `${r.source}:${r.transaction_id}`
    : `${r.source}:${r.sales_agent}:${r.date}:${r.sales_amount}`
}

const tag = (recs, source) =>
  (recs || [])
    .filter(r => r && r.date && Number(r.sales_amount) >= 0)
    .map(r => ({ ...r, source }))

// Match the dashboard's "Sales Performance" cards exactly:
//   • a SALE = one close (signup_count; DP=1, balance=0) — not each payment
//   • the value = the package's full SRP at close (packageFullPrice), falling
//     back to the paid amount when the package is unknown. For Fusioo (Officers)
//     the amount already IS the full package price, so the fallback applies.
const closesOf = r => (r.signup_count == null ? 1 : r.signup_count)
const srpValue = r => {
  const closes = closesOf(r)
  if (closes <= 0) return 0
  return (packageFullPrice(r.meta?.package) || Number(r.sales_amount) || 0) * closes
}

// ── Coach attribution — IDENTICAL to the dashboard's Sales Performance cards ──
// Acquisition/AACIO: the real closer lives in the CLUSTER name, not sales_agent
// (which is often blank → "Unassigned"). We derive the coach from the cluster
// and merge spelling variants via aliases, exactly like the cards, so the TV
// totals match them. Officers (Fusioo) already carry a real agent_name.
const titleCase = s => (s || '').split(/\s+/).map(w => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w)).join(' ')
const coachKey = name => (name || '').trim().split(/\s+/)[0].toUpperCase()

function coachFromCluster(team) {
  const t = (team || '').trim()
  let m
  if ((m = t.match(/external\s+coach\s*-\s*(.+)$/i))) return m[1].trim()
  if ((m = t.match(/^acquisition\s*-\s*(.+)$/i)))     return m[1].trim()
  if ((m = t.match(/^aacio\s+(.+)$/i)))               return m[1].trim()
  return null
}

const COACH_ALIASES = {
  acquisition: { ANGEL: 'JAS', ANGELYN: 'JAS' },
  aacio:       { ANGEL: 'JAS', ANGELYN: 'JAS', PRINCESS: 'Princess Romelyn', ROMELYN: 'Princess Romelyn', SHEILA: 'Sheila', SHIELA: 'Sheila' },
  officers:    {},
}

// Resolve a record to a stable agent identity { key, name } — or null to skip
// (matches the cards, which drop rows with no cluster-derived coach).
function agentIdentity(r) {
  if (r.source === 'officers') {
    const name = r.sales_agent
    if (!name || name === 'Unassigned') return null
    return { key: `officers::${coachKey(name)}`, name }
  }
  const coach = coachFromCluster(r.team)
  if (!coach) return null
  const k = coachKey(coach)
  const canon = COACH_ALIASES[r.source]?.[k]
  const name = canon || titleCase(coach)
  return { key: `${r.source}::${canon ? coachKey(canon) : k}`, name }
}

// Photo lookup that also tries the first name, so a photo uploaded as "Princess"
// still resolves for a canonical "Princess Romelyn".
const photoFor = (photoMap, name) =>
  photoMap[nameKey(name)]?.photo_url
  || photoMap[nameKey((name || '').split(' ')[0])]?.photo_url
  || null

export default function useTvData() {
  // ── LakbayHub poll (Acquisition + AACIO) ──────────────────────────────────
  const salesFetcher = useCallback(fetchSalesHalf, [])
  const { data: salesData, loading, error, lastFetched } = usePolling(salesFetcher, SALES_POLL_MS)

  // ── Fusioo poll (Account Officers) — independent, no cutoff ────────────────
  const [officers, setOfficers] = useState([])
  const [officersLoading, setOfficersLoading] = useState(true)
  useEffect(() => {
    let alive = true
    const load = () => fetchOfficersHalf()
      .then(rows => { if (alive) { setOfficers(rows); setOfficersLoading(false) } })
      .catch(err => { console.warn('[tv] officers failed:', err.message); if (alive) setOfficersLoading(false) })
    load()
    const id = setInterval(() => { if (!document.hidden) load() }, OFFICERS_POLL_MS)
    const onVis = () => { if (!document.hidden) load() }
    document.addEventListener('visibilitychange', onVis)
    return () => { alive = false; clearInterval(id); document.removeEventListener('visibilitychange', onVis) }
  }, [])

  // Combined, tagged record set.
  const records = useMemo(() => [
    ...tag(salesData?.potb, 'acquisition'),
    ...tag(officers, 'officers'),
    ...tag(salesData?.aacio, 'aacio'),
  ], [salesData, officers])

  // ── Agent photos (polled slowly; new uploads appear within ~1 min) ────────
  const [photoMap, setPhotoMap] = useState({})
  useEffect(() => {
    let alive = true
    const load = () => fetchPhotoMap().then(m => { if (alive) setPhotoMap(m) })
    load()
    const id = setInterval(load, 60_000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  // ── New-money detection → celebration ─────────────────────────────────────
  // Celebrate ANY new paid record that enters the feed since the last poll —
  // regardless of its sale/payment date. If a LakbayHub payment is dated
  // yesterday but only shows up in the API now, it still "entered" today, so we
  // announce it. Baseline is seeded on first load so history is never replayed.
  const seenRef = useRef(null)        // Set of ALL paid record ids seen so far
  const [celebration, setCelebration] = useState(null)
  useEffect(() => {
    const paid = records.filter(r => Number(r.sales_amount) > 0)
    if (paid.length === 0) return   // no meaningful data yet — don't seed a baseline

    const ids = new Set(paid.map(recordId))

    // First MEANINGFUL load seeds the baseline — never celebrate what's already
    // there. (Guarding on paid.length avoids seeding an empty baseline from a
    // partial/first poll and then mass-celebrating the full set next tick.)
    if (seenRef.current === null) { seenRef.current = ids; return }

    const fresh = paid.filter(r => !seenRef.current.has(recordId(r)))
    for (const id of ids) seenRef.current.add(id)  // remember everything we've seen
    if (fresh.length === 0) return

    // A big batch = a backfill / reconnect / data reload, NOT live sales.
    // Absorb it silently so the board never mass-celebrates history.
    if (fresh.length > 8) return

    // Only celebrate an attributable closer (same identity as the board) —
    // skip rows we can't attribute.
    const named = fresh
      .map(r => ({ r, id: agentIdentity(r) }))
      .filter(x => x.id)
    if (named.length === 0) return

    const top = named.reduce((a, b) => (b.r.sales_amount > a.r.sales_amount ? b : a))
    setCelebration({
      key: recordId(top.r) + ':' + Date.now(),
      agent: top.id.name,
      amount: Number(top.r.sales_amount) || 0,
      source: top.r.source,
      photo: photoFor(photoMap, top.id.name),
      moreCount: named.length - 1,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salesData, officers])

  const clearCelebration = useCallback(() => setCelebration(null), [])

  // ── Aggregations ──────────────────────────────────────────────────────────
  const today = new Date()
  const dayRange = rangeFor('daily', today)
  const monthRange = rangeFor('monthly', today)

  const view = useMemo(() => {
    // Attach each record's coach identity; drop rows we can't attribute — this
    // matches the Sales Performance cards exactly (same coach + aliases + skip).
    const withId = recs => recs
      .map(r => ({ r, id: agentIdentity(r) }))
      .filter(x => x.id)

    const todayIded = withId(filterByRange(records, dayRange.start, dayRange.end))
    const mtdIded   = withId(filterByRange(records, monthRange.start, monthRange.end))

    const sumSrp    = list => list.reduce((a, x) => a + srpValue(x.r), 0)
    const sumCloses = list => list.reduce((a, x) => a + closesOf(x.r), 0)

    const bySource = {}
    for (const s of SOURCE_ORDER) {
      const t = todayIded.filter(x => x.r.source === s)
      const m = mtdIded.filter(x => x.r.source === s)
      bySource[s] = {
        todaySales: sumSrp(t), todayCount: sumCloses(t),
        mtdSales: sumSrp(m), mtdCount: sumCloses(m),
      }
    }

    const agentMap = new Map()
    for (const { r, id } of mtdIded) {
      if (!agentMap.has(id.key)) {
        agentMap.set(id.key, {
          key: id.key, name: id.name, source: r.source, team: r.team || '',
          mtdSales: 0, mtdCount: 0, todaySales: 0, todayCount: 0,
          photo: photoFor(photoMap, id.name),
        })
      }
      const e = agentMap.get(id.key)
      e.mtdSales += srpValue(r)
      e.mtdCount += closesOf(r)
    }
    for (const { r, id } of todayIded) {
      const e = agentMap.get(id.key)
      if (e) { e.todaySales += srpValue(r); e.todayCount += closesOf(r) }
    }

    const leaderboard = [...agentMap.values()]
      .filter(a => a.mtdSales > 0)
      .sort((a, b) => b.mtdSales - a.mtdSales)

    return {
      todaySales: sumSrp(todayIded),
      todayCount: sumCloses(todayIded),
      mtdSales:   sumSrp(mtdIded),
      mtdCount:   sumCloses(mtdIded),
      bySource,
      leaderboard,
    }
  }, [records, photoMap, dayRange.start, dayRange.end, monthRange.start, monthRange.end])

  // Distinct agents (same identity as the board) — for the admin uploader, so
  // uploaded photos are keyed to the exact names shown on the board.
  const knownAgents = useMemo(() => {
    const map = new Map()
    for (const r of records) {
      const id = agentIdentity(r)
      if (!id) continue
      if (!map.has(id.key)) map.set(id.key, { name: id.name, source: r.source })
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [records])

  // The most recent sale (latest by date, then biggest) — so the board can
  // replay it automatically whenever it's opened/refreshed.
  const latestSale = useMemo(() => {
    let best = null
    for (const r of records) {
      if (!(Number(r.sales_amount) > 0)) continue
      const id = agentIdentity(r)
      if (!id) continue
      const t = new Date(r.date).getTime()
      const amount = Number(r.sales_amount) || 0
      if (!best || t > best.t || (t === best.t && amount > best.amount)) {
        best = { t, agent: id.name, amount, source: r.source, photo: photoFor(photoMap, id.name) }
      }
    }
    return best ? { agent: best.agent, amount: best.amount, source: best.source, photo: best.photo } : null
  }, [records, photoMap])

  // Per-source loading (so the Officers column shows "loading" not "no sales"
  // while its slower fetch is still in flight).
  const sourceLoading = {
    acquisition: loading,
    aacio:       loading,
    officers:    officersLoading,
  }

  return {
    loading, error, lastFetched,
    ...view,
    sourceLoading,
    knownAgents,
    photoMap,
    latestSale,
    celebration, clearCelebration,
  }
}
