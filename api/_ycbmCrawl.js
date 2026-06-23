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
  // Start one second before the window so the first record isn't missed
  // whether YCBM treats `from` as inclusive or exclusive.
  let cursorMs = startMs - 1000
  let reachedMs = startMs
  const t0 = Date.now()
  let pages = 0
  let stale = 0
  let hitEnd = false
  let stoppedReason = 'budget/maxpages'
  const trace = []
  while (pages < maxPages && (Date.now() - t0) < budgetMs) {
    let page, httpStatus = 0
    try {
      // Per-page timeout so one hung YCBM request can't block the whole crawl
      // until the platform kills the function (which read as a 5-min hang live).
      const r = await fetch(`${base}/bookings?from=${encodeURIComponent(toISO(cursorMs))}&fields=${FIELDS}`, { headers, signal: AbortSignal.timeout(12000) })
      httpStatus = r.status
      if (!r.ok) { stoppedReason = `http ${r.status}`; trace.push({ from: toISO(cursorMs), status: r.status }); break }
      page = await r.json()
    } catch (e) { stoppedReason = 'fetch error: ' + String(e?.name || e); break }
    if (!Array.isArray(page) || page.length === 0) { hitEnd = true; stoppedReason = 'empty page'; break }

    let maxTs = cursorMs
    let added = 0
    for (const b of page) {
      if (!seen.has(b.id)) added++
      seen.set(b.id, b)
      const ts = new Date(b.startsAt).getTime()
      if (ts > maxTs) maxTs = ts
    }
    if (trace.length < 60) trace.push({ from: toISO(cursorMs), n: page.length, added, last: page.length ? page[page.length - 1].startsAt : null, status: httpStatus })
    if (maxTs > reachedMs) reachedMs = maxTs
    if (maxTs > endMs) { hitEnd = true; stoppedReason = 'reached window end'; break }

    // YCBM's `from` cursor SKIPS the boundary second's siblings on Vercel
    // (effectively exclusive), and many bookings share an exact slot time
    // (10:00/14:00/19:00...) — advancing straight to maxTs dropped them
    // (438 → 215). So step back to maxTs-1s to RE-FETCH that boundary second
    // and pick up its siblings; dedup absorbs the overlap. Only when a page
    // brings nothing new (boundary fully drained, or a rare >page same-second
    // cluster) do we jump strictly past it; two such stalls = done.
    if (added > 0) {
      cursorMs = maxTs - 1000
      stale = 0
    } else {
      cursorMs = maxTs + 1000
      if (++stale >= 2) { hitEnd = true; stoppedReason = 'stale (no new records)'; break }
    }
    pages++
  }

  const bookings = [...seen.values()].filter(b => {
    const ts = new Date(b.startsAt).getTime()
    return ts >= startMs && ts <= endMs
  })
  return { bookings, reachedMs, pages, partial: !hitEnd, stoppedReason, trace, totalSeen: seen.size, elapsedMs: Date.now() - t0 }
}
