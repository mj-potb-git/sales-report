// Shared SERVER-SIDE YCBM pagination (leading _ → Vercel skips it as a route).
//
// Why: YCBM returns only ~10 records/page, oldest-first from the `from` cursor,
// so collecting a window means many sequential requests. Doing that from the
// BROWSER against Vercel means each page is a serverless round-trip (~1.5-2s) —
// a 2-week window took >60s and often got cut off, leaving the current week
// empty (per-coach cards/funnel showed 0). Done on the SERVER, each hop to YCBM
// is ~0.3s, so the whole window is crawled in seconds and returned in ONE
// response. Used by both the Vercel function (api/ycbm-bookings.js) and the
// Vite dev middleware so dev and prod behave identically.

const FIELDS = 'id,title,startsAt,endsAt,createdAt,cancelled,noShow,profileId,timeZone,location,accountId,tentative,teamMember,teamMember.name,teamMember.email'

function basicAuth(id, key) {
  return 'Basic ' + Buffer.from(`${id}:${key}`).toString('base64')
}
const toISO = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')

/**
 * Crawl one YCBM account's booking window server-side.
 * Returns { bookings, reachedMs, pages, partial } — `partial` true if it
 * stopped on the time/page budget before reaching the window end.
 */
export async function crawlYcbm({
  accountId, apiKey,
  fromDaysBack = 14, toDaysForward = 10,
  budgetMs = 50000, maxPages = 800,
}) {
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0)
  const startMs = dayStart.getTime() - fromDaysBack * 86400000
  const endMs   = dayStart.getTime() + (toDaysForward + 1) * 86400000 - 1
  const base    = `https://api.youcanbook.me/v1/${accountId}`
  const headers = { Authorization: basicAuth(accountId, apiKey), Accept: 'application/json' }

  const seen = new Map()
  let cursorMs = startMs
  let reachedMs = startMs
  const t0 = Date.now()
  let pages = 0
  let stale = 0
  let hitEnd = false
  while (pages < maxPages && (Date.now() - t0) < budgetMs) {
    let page
    try {
      // Per-page timeout so one hung YCBM request can't block the whole crawl
      // until the platform kills the function (which read as a 5-min hang live).
      const r = await fetch(`${base}/bookings?from=${encodeURIComponent(toISO(cursorMs))}&fields=${FIELDS}`, { headers, signal: AbortSignal.timeout(12000) })
      if (!r.ok) break
      page = await r.json()
    } catch { break }
    if (!Array.isArray(page) || page.length === 0) { hitEnd = true; break }

    // NOTE: do NOT stop on a short page (length < 10). YCBM returns variable
    // page sizes — on Vercel a <10 page appeared mid-stream and falsely ended
    // the crawl (438 → 215, scrambled per-coach counts). Instead advance the
    // cursor to the last seen startsAt (dedup absorbs the re-fetched overlap)
    // and only stop on an empty page, on reaching the window end, or when a
    // page brings no new records and time can't advance.
    let maxTs = cursorMs
    let added = 0
    for (const b of page) {
      if (!seen.has(b.id)) added++
      seen.set(b.id, b)
      const ts = new Date(b.startsAt).getTime()
      if (ts > maxTs) maxTs = ts
    }
    if (maxTs > reachedMs) reachedMs = maxTs
    if (maxTs > endMs) { hitEnd = true; break }

    if (maxTs > cursorMs) {
      cursorMs = maxTs            // normal advance; re-fetch from boundary, dedup
      stale = 0
    } else {
      // Whole page sat on one second (a >page-size same-second cluster) — nudge
      // past it. If nothing new is coming through, we've reached the end.
      cursorMs += 1000
      if (added === 0) { if (++stale >= 2) { hitEnd = true; break } } else stale = 0
    }
    pages++
  }

  const bookings = [...seen.values()].filter(b => {
    const ts = new Date(b.startsAt).getTime()
    return ts >= startMs && ts <= endMs
  })
  return { bookings, reachedMs, pages, partial: !hitEnd }
}
