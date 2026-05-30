// Vercel serverless proxy — the production replacement for the Vite dev proxy.
//
// In local dev, vite.config.js rewrites /api/ycbm, /api/aacio, /api/lakbay,
// /api/fusioo, /api/meta to the upstream APIs and injects auth headers
// server-side. Vercel has no Vite proxy, so this catch-all function does the
// same job for the deployed site. ALL secrets stay server-side here — they are
// read from Vercel Environment Variables and never reach the browser.
//
// Route shape:  /api/<service>/<...path>?<query>
//   ycbm   → https://api.youcanbook.me/v1/<YCBM_ACCOUNT_ID>/<path>      (Basic)
//   aacio  → https://api.youcanbook.me/v1/<YCBM_AACIO_ACCOUNT_ID>/<path>(Basic)
//   lakbay → https://potb-utilities-api.lakbayhub.com/api/v1/<path>     (none)
//   fusioo → https://api.fusioo.com/v3/<path>                           (Bearer)
//   meta   → https://graph.facebook.com/v21.0/<META_AD_ACCOUNT_ID>/<path> (?access_token)

const env = process.env

function basicAuth(id, key) {
  if (!id || !key) return ''
  return 'Basic ' + Buffer.from(`${id}:${key}`).toString('base64')
}

// Map each service to its upstream base + the request headers to inject.
function resolveTarget(service) {
  switch (service) {
    case 'ycbm':
      return {
        base: `https://api.youcanbook.me/v1/${env.YCBM_ACCOUNT_ID || ''}`,
        headers: { Authorization: basicAuth(env.YCBM_ACCOUNT_ID, env.YCBM_API_KEY), Accept: 'application/json' },
      }
    case 'aacio':
      return {
        base: `https://api.youcanbook.me/v1/${env.YCBM_AACIO_ACCOUNT_ID || ''}`,
        headers: { Authorization: basicAuth(env.YCBM_AACIO_ACCOUNT_ID, env.YCBM_AACIO_API_KEY), Accept: 'application/json' },
      }
    case 'lakbay':
      return {
        base: 'https://potb-utilities-api.lakbayhub.com/api/v1',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      }
    case 'fusioo':
      return {
        base: 'https://api.fusioo.com/v3',
        headers: {
          ...(env.FUSIOO_ACCESS_TOKEN ? { Authorization: `Bearer ${env.FUSIOO_ACCESS_TOKEN}` } : {}),
          Accept: 'application/json',
        },
      }
    case 'meta':
      return {
        base: `https://graph.facebook.com/v21.0/${env.META_AD_ACCOUNT_ID || ''}`,
        headers: { Accept: 'application/json' },
        appendToken: env.META_ACCESS_TOKEN || '',
      }
    default:
      return null
  }
}

export default async function handler(req, res) {
  try {
    const slug = req.query.slug || []
    const parts = Array.isArray(slug) ? slug : [slug]
    const [service, ...rest] = parts
    const subPath = rest.join('/')

    const t = resolveTarget(service)
    if (!t) {
      res.status(404).json({ error: `Unknown proxy service: ${service}` })
      return
    }

    // Preserve the original query string.
    const qIndex = req.url.indexOf('?')
    let query = qIndex === -1 ? '' : req.url.slice(qIndex + 1)

    // Meta auth: append access_token as a query param (not a header).
    if (t.appendToken && !/(^|&)access_token=/.test(query)) {
      query += (query ? '&' : '') + 'access_token=' + encodeURIComponent(t.appendToken)
    }

    let url = t.base + (subPath ? `/${subPath}` : '')
    if (query) url += `?${query}`

    const upstream = await fetch(url, {
      method: req.method,
      headers: t.headers,
    })

    const body = await upstream.text()
    res.status(upstream.status)
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
    // Short edge cache to soften upstream rate limits (esp. LakbayHub).
    res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=30')
    res.send(body)
  } catch (err) {
    res.status(502).json({ error: 'Proxy error', detail: String(err?.message || err) })
  }
}
