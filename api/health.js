// Diagnostic endpoint — safe to keep, exposes no secret values.
// GET /api/health  →  checks env vars, tests YCBM directly, and tests
//                     through the proxy path to isolate where failures occur.

const env = process.env

function mask(val) {
  if (!val) return '(not set)'
  if (val.length <= 8) return '****'
  return val.slice(0, 4) + '****' + val.slice(-4) + ` (len=${val.length})`
}

function looksLikeUUID(val) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val || '')
}

export default async function handler(req, res) {
  const ycbmId  = env.YCBM_ACCOUNT_ID || ''
  const ycbmKey = env.YCBM_API_KEY    || ''

  // --- Env checks ---
  const env_checks = {
    ycbm_account_id:        { value: mask(ycbmId), is_uuid: looksLikeUUID(ycbmId) },
    ycbm_api_key_set:       !!ycbmKey,
    vite_supabase_url_set:  !!env.VITE_SUPABASE_URL,
    vite_supabase_anon_key: !!env.VITE_SUPABASE_ANON_KEY,
    fusioo_token_set:       !!env.FUSIOO_ACCESS_TOKEN,
    meta_token_set:         !!env.META_ACCESS_TOKEN,
    meta_ad_account:        mask(env.META_AD_ACCOUNT_ID),
  }

  // --- Direct YCBM probe (same call as the proxy would make) ---
  const constructed_url = ycbmId
    ? `https://api.youcanbook.me/v1/${mask(ycbmId)}/bookings?fields=id&from=2026-05-01T00:00:00Z`
    : '(no account id)'

  let ycbm_direct
  if (ycbmId && ycbmKey) {
    try {
      const auth = 'Basic ' + Buffer.from(`${ycbmId}:${ycbmKey}`).toString('base64')
      // Use the same fields as the real app
      const FIELDS = 'id,title,startsAt,endsAt,createdAt,cancelled,noShow,profileId,timeZone,location,accountId,tentative'
      const r = await fetch(
        `https://api.youcanbook.me/v1/${ycbmId}/bookings?from=2026-05-01T00:00:00Z&fields=${FIELDS}`,
        { headers: { Authorization: auth, Accept: 'application/json' }, signal: AbortSignal.timeout(8000) },
      )
      const body = await r.text()
      ycbm_direct = { status: r.status, body_preview: body.slice(0, 150) }
    } catch (e) {
      ycbm_direct = { status: 'fetch_error', error: String(e.message) }
    }
  } else {
    ycbm_direct = { status: 'skipped', error: 'credentials missing' }
  }

  // --- Proxy path probe (calls /api/ycbm via the same Vercel function) ---
  let ycbm_via_proxy
  try {
    const host = req.headers.host || 'localhost'
    const proto = req.headers['x-forwarded-proto'] || 'https'
    // Now routes to api/ycbm/[...path].js (nested catch-all)
    const proxyUrl = `${proto}://${host}/api/ycbm/bookings?from=2026-05-01T00:00:00Z&fields=id`
    const r = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) })
    const body = await r.text()
    ycbm_via_proxy = { status: r.status, url_called: proxyUrl, body_preview: body.slice(0, 150) }
  } catch (e) {
    ycbm_via_proxy = { status: 'fetch_error', error: String(e.message) }
  }

  res.status(200).json({
    env_checks,
    constructed_url,
    ycbm_direct,
    ycbm_via_proxy,
    health_req_url: req.url,
  })
}
