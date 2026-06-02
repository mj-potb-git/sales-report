// Flat proxy handler — invoked via vercel.json rewrites for all /api/<service>/...
// paths. Vercel preserves req.url as the original request path even after a
// rewrite, so we extract service + sub-path from it directly.
import { proxyRequest } from './_proxy.js'

export default function handler(req, res) {
  const bare = (req.url || '').split('?')[0]
  const match = bare.match(/^\/api\/([^/]+)(?:\/(.*))?$/)
  if (!match) {
    res.status(404).json({ error: 'Invalid API path' })
    return
  }
  const service = match[1]
  const subPath = match[2] || ''
  return proxyRequest(service, subPath, req, res)
}
