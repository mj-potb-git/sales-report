// Data layer for the Acquisition Monthly Score Card (/kpi).
//
// Builds one scorecard per acquisition agent for a chosen month by merging:
//   • YCBM bookings   → Total Bookings + Show-ups (per assigned coach)
//   • LakbayHub sales  → Sign-ups + package tiers (Adventurer / TP / Starter)
//   • Supabase manual  → QA score + memo (typed by MJ, per agent/month)
//
// Attribution across sources is by NAME. YCBM carries the coach's full name
// (e.g. "John Martin Dalangin"); LakbayHub encodes only a token in the cluster
// ("ACQUISITION - MARTIN" → "Martin"). We link them by token match so the same
// human's bookings and sign-ups land on one card. A coach that appears in only
// one source still gets a card (their missing-source metrics are just 0).

import { useCallback, useEffect, useMemo, useState } from 'react'
import useYcbmData from '../hooks/useYcbmData'
import usePolling from '../hooks/usePolling'
import { fetchSalesRecords, parseDate } from '../api/lakbay'
import { COACH_DISPLAY_ALIAS } from '../api/lakbayhub'
import {
  getAllAttendance, startAttendancePoller, subscribeAttendance,
} from '../lib/attendance'
import { nameKey } from './kpiManual'

const SALES_POLL_MS = 30_000

// --- Name matching ----------------------------------------------------------

// Apply the team's coach alias so the same human matches across sources — e.g.
// LakbayHub tags Angel's sign-ups under "JAS" (COACH_DISPLAY_ALIAS), while YCBM
// books her as "Angel". Alias-normalize both before comparing.
function applyAlias(name) {
  return COACH_DISPLAY_ALIAS[nameKey(name)] || name
}

// Significant tokens of a name (alias-normalized, drops initials / filler).
function tokens(name) {
  return nameKey(applyAlias(name)).split(' ').filter(t => t.length >= 3)
}

// Do two names plausibly refer to the same person? True when they share any
// significant token — "Martin" ⊂ "John Martin Dalangin".
function namesMatch(a, b) {
  const ta = tokens(a)
  const tb = tokens(b)
  return ta.some(t => tb.includes(t))
}

// --- Package tier -----------------------------------------------------------

export function packageTier(pkg) {
  const p = (pkg || '').toUpperCase()
  if (p.includes('ADVENTURER')) return 'adventurer'
  if (p.includes('TRAVELPRE') || p.includes('TRAVELPRENUER')) return 'travelpreneur'
  if (p.includes('STARTER')) return 'starter'
  return 'other'
}

// --- Show-up determination --------------------------------------------------

// Per MJ's rule: attendance marks win; otherwise YCBM's noShow flag is
// authoritative (false = showed, true = no-show); a past booking left unmarked
// counts as SHOWED. Returns true (showed) / false (no-show) / null (upcoming).
function showedUp(b, attStatus) {
  if (attStatus === 'showed') return true
  if (attStatus === 'no_show') return false
  if (b.noShow === true) return false
  if (b.noShow === false) return true
  const past = new Date(b.startsAt).getTime() < Date.now()
  return past ? true : null
}

// --- Month helpers ----------------------------------------------------------

// month = 'YYYY-MM' → { start, end } local Date range for that calendar month.
export function monthRange(month) {
  const [y, m] = month.split('-').map(Number)
  const start = new Date(y, m - 1, 1, 0, 0, 0, 0)
  const end = new Date(y, m, 0, 23, 59, 59, 999)
  return { start, end }
}

function inMonth(dateMs, range) {
  return dateMs >= range.start.getTime() && dateMs <= range.end.getTime()
}

// --- Hook -------------------------------------------------------------------

export default function useKpiData(month) {
  const { bookings, loading: ycbmLoading, error: ycbmError, lastFetched } = useYcbmData()

  const salesFetcher = useCallback(() => fetchSalesRecords(), [])
  const { data: sales, loading: salesLoading } = usePolling(salesFetcher, SALES_POLL_MS)

  // Attendance cache (Supabase-backed) → re-render when a mark changes.
  const [attTick, setAttTick] = useState(0)
  useEffect(() => {
    startAttendancePoller()
    const unsub = subscribeAttendance(() => setAttTick(t => t + 1))
    return unsub
  }, [])

  const range = useMemo(() => monthRange(month), [month])

  const agents = useMemo(() => {
    const att = getAllAttendance()
    const salesRecs = Array.isArray(sales) ? sales : []

    // Bookings scheduled this month, not cancelled, with an assigned coach.
    const monthBookings = (bookings || []).filter(b =>
      b.coach && !b.raw?.cancelled && inMonth(new Date(b.startsAt).getTime(), range))

    // POTB acquisition sign-ups paid this month (fetchSalesRecords is already
    // POTB-only — external/AACIO is split out upstream).
    const monthSales = salesRecs.filter(s =>
      s.date && s.sales_agent && s.sales_agent !== 'Unassigned'
      && inMonth(parseDate(s.date).getTime(), range))

    // Build the agent roster. Seed with YCBM coaches (they carry full names +
    // bookings), then fold in sign-up closers, attaching to a matching coach or
    // standing up a new card if none matches.
    const roster = new Map() // key → { key, name, bookingKeys:Set, saleNames:Set }
    for (const b of monthBookings) {
      const k = nameKey(b.coach)
      if (!roster.has(k)) roster.set(k, { key: k, name: b.coach, bookingKeys: new Set([k]), saleNames: new Set() })
    }
    for (const s of monthSales) {
      // Find an existing roster entry this closer matches by token.
      let entry = null
      for (const e of roster.values()) {
        if (namesMatch(s.sales_agent, e.name)) { entry = e; break }
      }
      if (!entry) {
        const k = nameKey(s.sales_agent)
        entry = roster.get(k) || { key: k, name: s.sales_agent, bookingKeys: new Set(), saleNames: new Set() }
        roster.set(k, entry)
      }
      entry.saleNames.add(s.sales_agent)
    }

    // Compute one scorecard per roster entry.
    const cards = [...roster.values()].map(entry => {
      const myBookings = monthBookings.filter(b => entry.bookingKeys.has(nameKey(b.coach)))
      const mySales = monthSales.filter(s => entry.saleNames.has(s.sales_agent))

      const totalBookings = myBookings.length
      let showUps = 0
      for (const b of myBookings) {
        if (showedUp(b, att[b.id]?.status) === true) showUps++
      }

      const signUps = mySales.reduce((a, s) => a + (Number(s.signup_count) || 0), 0)
      let adventurer = 0, travelpreneur = 0, starter = 0
      for (const s of mySales) {
        const cnt = Number(s.signup_count) || 0
        if (cnt === 0) continue // balance payment — not a new sign-up
        const tier = packageTier(s.meta?.package)
        if (tier === 'adventurer') adventurer += cnt
        else if (tier === 'travelpreneur') travelpreneur += cnt
        else if (tier === 'starter') starter += cnt
      }

      return {
        key: entry.key,
        name: entry.name,
        totalBookings,
        showUps,
        signUps,
        adventurer,
        travelpreneur,
        starter,
      }
    })

    // Sort: most bookings first, then most sign-ups.
    return cards.sort((a, b) =>
      b.totalBookings - a.totalBookings || b.signUps - a.signUps || a.name.localeCompare(b.name))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookings, sales, range, attTick])

  return {
    agents,
    loading: (ycbmLoading || salesLoading) && agents.length === 0,
    error: ycbmError,
    lastFetched,
  }
}

// --- Scoring (shared with the UI + calculator) ------------------------------

// KPI weights (sum to 100). Matches MJ's spreadsheet.
export const WEIGHTS = {
  showUp:      15,
  closing:     50,
  adventurer:  20,
  qa:          10,
  memo:         5,
}

// Turn a raw scorecard + manual inputs into rates and weighted points.
// Each rate is the formula from the sheet's Description column; the weighted
// point is rate% × weight (capped at the weight). Memo is all-or-nothing.
export function scoreCard(card, manual) {
  const qaScore = manual?.qa_score ?? null
  const hasMemo = !!manual?.has_memo

  const showUpRate  = card.totalBookings > 0 ? (card.showUps / card.totalBookings) * 100 : 0
  const closingRate = card.showUps > 0 ? (card.signUps / card.showUps) * 100 : 0
  const totalSignups = card.adventurer + card.travelpreneur + card.starter
  const advRate     = totalSignups > 0 ? (card.adventurer / totalSignups) * 100 : 0

  const clamp = r => Math.max(0, Math.min(100, r))

  const pts = {
    showUp:     (clamp(showUpRate)  / 100) * WEIGHTS.showUp,
    closing:    (clamp(closingRate) / 100) * WEIGHTS.closing,
    adventurer: (clamp(advRate)     / 100) * WEIGHTS.adventurer,
    qa:         qaScore != null ? (clamp(qaScore) / 100) * WEIGHTS.qa : 0,
    memo:       hasMemo ? 0 : WEIGHTS.memo,
  }
  const total = pts.showUp + pts.closing + pts.adventurer + pts.qa + pts.memo

  return {
    qaScore, hasMemo,
    showUpRate, closingRate, advRate, totalSignups,
    points: pts,
    total,
  }
}
