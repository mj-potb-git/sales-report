// Data layer for the TV Sales Achievement board.
//
// Merges all three sales audiences into one live feed:
//   • Acquisition — POTB sign-ups (LakbayHub)      → fetchSalesRecords()
//   • Officers    — booking sales (Fusioo)          → fetchAllBookingTransactions()
//   • AACIO       — external team (LakbayHub split)  → getExternalSalesRecords()
//
// Every record is tagged with its `source` so the leaderboard can colour/group
// and the celebration knows which board a new sale belongs to.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import usePolling from '../hooks/usePolling'
import {
  fetchSalesRecords, getExternalSalesRecords,
  filterByRange, rangeFor, parseDate,
} from '../api/lakbay'
import { fetchAllBookingTransactions, mapBookingTransaction } from '../api/fusioo'
import { fetchPhotoMap, nameKey } from './agentPhotos'

const POLL_INTERVAL_MS = 30_000 // matches the slowest source's safe cadence

export const SOURCE_LABELS = {
  acquisition: 'Acquisition',
  officers:    'Account Officers',
  aacio:       'AACIO',
}

export const SOURCE_ORDER = ['acquisition', 'officers', 'aacio']

// Resolve to a fallback if a promise takes too long — so one slow source
// (e.g. Fusioo's long pagination) never leaves the whole board blank. The slow
// fetch keeps warming its cache in the background; the next 30s poll picks it up.
function withTimeout(promise, ms, fallback) {
  return Promise.race([promise, new Promise(res => setTimeout(() => res(fallback), ms))])
}

// One combined fetch. fetchSalesRecords() warms the external split, so we read
// getExternalSalesRecords() right after it resolves. Fusioo is independent.
async function fetchAll() {
  const fusiooP = fetchAllBookingTransactions()
    .then(rows => rows.map(mapBookingTransaction))
    .catch(err => { console.warn('[tv] fusioo failed:', err.message); return [] })

  const [potb, fusiooRaw] = await Promise.all([
    fetchSalesRecords(),
    withTimeout(fusiooP, 12_000, []),   // show the board even if Officers is slow
  ])
  const aacio = getExternalSalesRecords()

  const tag = (recs, source) =>
    (recs || [])
      .filter(r => r && r.date && Number(r.sales_amount) >= 0)
      .map(r => ({ ...r, source }))

  return [
    ...tag(potb, 'acquisition'),
    ...tag(fusiooRaw, 'officers'),
    ...tag(aacio, 'aacio'),
  ]
}

function isSameLocalDay(dateStr, anchor) {
  const d = parseDate(dateStr)
  return d.getFullYear() === anchor.getFullYear()
    && d.getMonth() === anchor.getMonth()
    && d.getDate() === anchor.getDate()
}

// A stable id per record across polls (used for new-sale detection).
function recordId(r) {
  return r.transaction_id != null
    ? `${r.source}:${r.transaction_id}`
    : `${r.source}:${r.sales_agent}:${r.date}:${r.sales_amount}`
}

export default function useTvData() {
  const fetcher = useCallback(fetchAll, [])
  const { data, loading, error, lastFetched } = usePolling(fetcher, POLL_INTERVAL_MS)
  const records = data ?? []

  // ── Agent photos (polled slowly; new uploads appear within ~1 min) ────────
  const [photoMap, setPhotoMap] = useState({})
  useEffect(() => {
    let alive = true
    const load = () => fetchPhotoMap().then(m => { if (alive) setPhotoMap(m) })
    load()
    const id = setInterval(load, 60_000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  // ── New-sale detection → celebration queue ────────────────────────────────
  const seenRef = useRef(null)        // Set of record ids from a prior poll
  const [celebration, setCelebration] = useState(null)
  useEffect(() => {
    if (!data) return
    const today = new Date()
    const todays = records.filter(r => isSameLocalDay(r.date, today) && Number(r.sales_amount) > 0)
    const ids = new Set(todays.map(recordId))

    // First successful load only seeds the baseline — never celebrate history.
    if (seenRef.current === null) { seenRef.current = ids; return }

    const fresh = todays.filter(r => !seenRef.current.has(recordId(r)))
    seenRef.current = ids
    if (fresh.length === 0) return

    // Celebrate the biggest new sale in this batch.
    const top = fresh.reduce((a, b) => (b.sales_amount > a.sales_amount ? b : a))
    setCelebration({
      key: recordId(top) + ':' + Date.now(),
      agent: top.sales_agent || 'Team POTB',
      amount: Number(top.sales_amount) || 0,
      source: top.source,
      photo: photoMap[nameKey(top.sales_agent)]?.photo_url || null,
      moreCount: fresh.length - 1,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  const clearCelebration = useCallback(() => setCelebration(null), [])

  // ── Aggregations ──────────────────────────────────────────────────────────
  const today = new Date()
  const dayRange = rangeFor('daily', today)
  const monthRange = rangeFor('monthly', today)

  const view = useMemo(() => {
    const todayRecs = filterByRange(records, dayRange.start, dayRange.end)
    const mtdRecs   = filterByRange(records, monthRange.start, monthRange.end)

    const sum = (recs, key = 'sales_amount') => recs.reduce((a, r) => a + (Number(r[key]) || 0), 0)

    // Per-source totals for today + MTD.
    const bySource = {}
    for (const s of SOURCE_ORDER) {
      const t = todayRecs.filter(r => r.source === s)
      const m = mtdRecs.filter(r => r.source === s)
      bySource[s] = {
        todaySales: sum(t), todayCount: t.length,
        mtdSales: sum(m), mtdCount: m.length,
      }
    }

    // Unified MTD leaderboard (agent across their own source).
    const agentMap = new Map()
    for (const r of mtdRecs) {
      const name = r.sales_agent || 'Unassigned'
      const k = `${r.source}::${nameKey(name)}`
      if (!agentMap.has(k)) {
        agentMap.set(k, {
          key: k, name, source: r.source, team: r.team || '',
          mtdSales: 0, mtdCount: 0, todaySales: 0, todayCount: 0,
          photo: photoMap[nameKey(name)]?.photo_url || null,
        })
      }
      const e = agentMap.get(k)
      e.mtdSales += Number(r.sales_amount) || 0
      e.mtdCount += 1
    }
    for (const r of todayRecs) {
      const k = `${r.source}::${nameKey(r.sales_agent || 'Unassigned')}`
      const e = agentMap.get(k)
      if (e) { e.todaySales += Number(r.sales_amount) || 0; e.todayCount += 1 }
    }

    const leaderboard = [...agentMap.values()]
      .filter(a => a.name && a.name !== 'Unassigned' && a.mtdSales > 0)
      .sort((a, b) => b.mtdSales - a.mtdSales)

    return {
      todaySales: sum(todayRecs),
      todayCount: todayRecs.length,
      mtdSales:   sum(mtdRecs),
      mtdCount:   mtdRecs.length,
      bySource,
      leaderboard,
    }
  }, [records, photoMap, dayRange.start, dayRange.end, monthRange.start, monthRange.end])

  // Distinct agent names across all sources — for the admin uploader.
  const knownAgents = useMemo(() => {
    const map = new Map()
    for (const r of records) {
      const name = r.sales_agent
      if (!name || name === 'Unassigned') continue
      const k = nameKey(name)
      if (!map.has(k)) map.set(k, { name, source: r.source })
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [records])

  return {
    loading, error, lastFetched,
    ...view,
    knownAgents,
    photoMap,
    celebration, clearCelebration,
  }
}
