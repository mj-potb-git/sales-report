// Vercel serverless: server-side YCBM pagination for one account.
//   GET /api/ycbm-bookings?account=ycbm|aacio&fromDaysBack=14&toDaysForward=10
// Returns the full booking array in ONE response (the browser used to crawl
// 40+ pages itself, which was too slow on Vercel — see api/_ycbmCrawl.js).

import { crawlYcbm } from './_ycbmCrawl.js'

const env = process.env

// Allow up to 60s on plans that honor it; the crawl returns partial within
// budget regardless, and the client falls back to its own crawl on failure.
export const config = { maxDuration: 60 }

export default async function handler(req, res) {
  // Allow cross-origin reads so the endpoint can be probed/diagnosed directly.
  res.setHeader('Access-Control-Allow-Origin', '*')
  try {
    const account   = req.query.account === 'aacio' ? 'aacio' : 'ycbm'
    const accountId  = account === 'aacio' ? env.YCBM_AACIO_ACCOUNT_ID : env.YCBM_ACCOUNT_ID
    const apiKey     = account === 'aacio' ? env.YCBM_AACIO_API_KEY     : env.YCBM_API_KEY
    if (!accountId || !apiKey) {
      res.status(503).json({ error: `${account} credentials not configured` })
      return
    }
    const fromDaysBack  = Math.min(120, Math.max(1, Number(req.query.fromDaysBack)  || 14))
    const toDaysForward = Math.min(120, Math.max(0, Number(req.query.toDaysForward) || 10))

    const { bookings, partial } = await crawlYcbm({
      accountId, apiKey, fromDaysBack, toDaysForward,
      budgetMs: 50000, maxPages: 800,
    })

    res.setHeader('Content-Type', 'application/json')
    // Cache briefly at the edge so rapid polls/multiple viewers share one crawl.
    res.setHeader('Cache-Control', 's-maxage=20, stale-while-revalidate=40')
    res.setHeader('X-Ycbm-Partial', partial ? '1' : '0')
    res.status(200).json(bookings)
  } catch (err) {
    res.status(502).json({ error: String(err?.message || err) })
  }
}
