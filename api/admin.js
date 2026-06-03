// Vercel serverless function for user management. Not captured by the proxy
// rewrites (those only match /api/{ycbm,aacio,lakbay,fusioo,meta}), so requests
// to /api/admin land here directly.

import { createAdminHandler } from './_adminLogic.js'

const handle = createAdminHandler({
  url: process.env.VITE_SUPABASE_URL,
  serviceKey: process.env.SUPABASE_SERVICE_KEY,
})

export default async function handler(req, res) {
  // Vercel auto-parses JSON bodies; fall back to manual parse just in case.
  let body = req.body
  if (typeof body === 'string') { try { body = JSON.parse(body) } catch { body = {} } }
  const result = await handle({
    method: req.method,
    query: req.query || {},
    body: body || {},
    authHeader: req.headers.authorization,
  })
  res.status(result.status).json(result.body)
}
