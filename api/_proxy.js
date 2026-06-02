// Shared proxy logic for all API service functions.
// Each api/<service>/[...path].js imports proxyRequest from here.
// The leading _ makes Vercel skip this file as a route.

const env = process.env

function basicAuth(id, key) {
  if (!id || !key) return ''
  return 'Basic ' + Buffer.from(`${id}:${key}`).toString('base64')
}

function resolveTarget(service) {
  switch (service) {
    case 'ycbm':
      if (!env.YCBM_ACCOUNT_ID || !env.YCBM_API_KEY)
        throw Object.assign(new Error('YCBM credentials not configured (YCBM_ACCOUNT_ID / YCBM_API_KEY missing in env)'), { status: 503 })
      return {
        base: `https://api.youcanbook.me/v1/${env.YCBM_ACCOUNT_ID}`,
        headers: { Authorization: basicAuth(env.YCBM_ACCOUNT_ID, env.YCBM_API_KEY), Accept: 'application/json' },
      }
    case 'aacio':
      if (!env.YCBM_AACIO_ACCOUNT_ID || !env.YCBM_AACIO_API_KEY)
        throw Object.assign(new Error('AACIO credentials not configured (YCBM_AACIO_ACCOUNT_ID / YCBM_AACIO_API_KEY missing in env)'), { status: 503 })
      return {
        base: `https://api.youcanbook.me/v1/${env.YCBM_AACIO_ACCOUNT_ID}`,
        headers: { Authorization: basicAuth(env.YCBM_AACIO_ACCOUNT_ID, env.YCBM_AACIO_API_KEY), Accept: 'application/json' },
      }
    case 'lakbay':
      return {
        base: 'https://potb-utilities-api.lakbayhub.com/api/v1',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(env.LAKBAYHUB_APP_KEY ? { 'x-app-key': env.LAKBAYHUB_APP_KEY } : {}),
        },
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

export async function proxyRequest(service, subPath, req, res) {
  try {
    const t = resolveTarget(service)
    if (!t) {
      res.status(404).json({ error: `Unknown proxy service: ${service}` })
      return
    }

    const qIndex = req.url.indexOf('?')
    let query = qIndex === -1 ? '' : req.url.slice(qIndex + 1)

    if (t.appendToken && !/(^|&)access_token=/.test(query)) {
      query += (query ? '&' : '') + 'access_token=' + encodeURIComponent(t.appendToken)
    }

    let url = t.base + (subPath ? `/${subPath}` : '')
    if (query) url += `?${query}`

    const upstream = await fetch(url, { method: req.method, headers: t.headers })
    const body = await upstream.text()
    res.status(upstream.status)
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
    if (upstream.status >= 200 && upstream.status < 300) {
      res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=30')
    } else {
      res.setHeader('Cache-Control', 'no-store')
    }
    res.send(body)
  } catch (err) {
    const status = err.status || 502
    res.status(status).json({ error: err.message || 'Proxy error', detail: String(err?.message || err) })
  }
}
