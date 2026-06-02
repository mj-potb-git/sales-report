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
    fusioo_token_len:       (env.FUSIOO_ACCESS_TOKEN || '').length,
    lakbayhub_app_key_set:  !!env.LAKBAYHUB_APP_KEY,
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

  const host  = req.headers.host || 'localhost'
  const proto = req.headers['x-forwarded-proto'] || 'https'
  const base  = `${proto}://${host}`

  // --- Fusioo direct probe ---
  const fusiooToken = env.FUSIOO_ACCESS_TOKEN || ''
  let fusioo_direct
  try {
    const r = await fetch('https://api.fusioo.com/v3/apps/', {
      headers: { Authorization: `Bearer ${fusiooToken}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    const body = await r.text()
    fusioo_direct = { status: r.status, body_preview: body.slice(0, 150) }
  } catch (e) {
    fusioo_direct = { status: 'fetch_error', error: String(e.message) }
  }

  // --- Fusioo via proxy probe (no trailing slash — trailing slash may break Vercel routing) ---
  let fusioo_via_proxy
  try {
    const r = await fetch(`${base}/api/fusioo/apps`, { signal: AbortSignal.timeout(8000) })
    const body = await r.text()
    fusioo_via_proxy = { status: r.status, body_preview: body.slice(0, 150) }
  } catch (e) {
    fusioo_via_proxy = { status: 'fetch_error', error: String(e.message) }
  }

  // --- LakbayHub direct probe (bypasses proxy, confirms LakbayHub is reachable) ---
  const lakbayKey = env.LAKBAYHUB_APP_KEY || ''
  let lakbay_direct
  try {
    const r = await fetch('https://potb-utilities-api.lakbayhub.com/api/v1/signups/sales-report', {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(lakbayKey ? { 'x-app-key': lakbayKey } : {}),
      },
      signal: AbortSignal.timeout(8000),
    })
    const body = await r.text()
    lakbay_direct = { status: r.status, body_preview: body.slice(0, 150) }
  } catch (e) {
    lakbay_direct = { status: 'fetch_error', error: String(e.message) }
  }

  // --- LakbayHub via proxy probe ---
  let lakbay_via_proxy
  try {
    const r = await fetch(`${base}/api/lakbay/signups/sales-report`, { signal: AbortSignal.timeout(8000) })
    const body = await r.text()
    lakbay_via_proxy = { status: r.status, body_preview: body.slice(0, 200) }
  } catch (e) {
    lakbay_via_proxy = { status: 'fetch_error', error: String(e.message) }
  }

  // --- AACIO via proxy probe (tests another per-service handler) ---
  let aacio_via_proxy
  try {
    const aacioId = env.YCBM_AACIO_ACCOUNT_ID || ''
    const r = await fetch(`${base}/api/aacio/bookings?fields=id&limit=1`, { signal: AbortSignal.timeout(8000) })
    const body = await r.text()
    aacio_via_proxy = { status: r.status, body_preview: body.slice(0, 150) }
  } catch (e) {
    aacio_via_proxy = { status: 'fetch_error', error: String(e.message) }
  }

  res.status(200).json({
    env_checks,
    constructed_url,
    ycbm_direct,
    ycbm_via_proxy,
    fusioo_direct,
    fusioo_via_proxy,
    lakbay_direct,
    lakbay_via_proxy,
    aacio_via_proxy,
    health_req_url: req.url,
  })
}
