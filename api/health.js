// Temporary diagnostic endpoint — safe to keep, exposes no secret values.
// GET /api/health  →  checks each upstream service and returns status.
// Remove once all services confirmed working on Vercel.

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
  const ycbmId  = env.YCBM_ACCOUNT_ID  || ''
  const ycbmKey = env.YCBM_API_KEY     || ''

  const checks = {
    ycbm_account_id:   { value: mask(ycbmId),  is_uuid: looksLikeUUID(ycbmId) },
    ycbm_api_key_set:  !!ycbmKey,
    fusioo_token_set:  !!env.FUSIOO_ACCESS_TOKEN,
    meta_token_set:    !!env.META_ACCESS_TOKEN,
    meta_ad_account:   mask(env.META_AD_ACCOUNT_ID),
    supabase_url_set:  !!env.VITE_SUPABASE_URL,
  }

  // Live YCBM probe — test against the real API from this serverless function.
  let ycbmProbe = { status: null, error: null }
  if (ycbmId && ycbmKey) {
    try {
      const auth = 'Basic ' + Buffer.from(`${ycbmId}:${ycbmKey}`).toString('base64')
      const r = await fetch(`https://api.youcanbook.me/v1/${ycbmId}/bookings?fields=id&from=2026-01-01T00:00:00Z`, {
        headers: { Authorization: auth, Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      })
      const body = await r.text()
      ycbmProbe = { status: r.status, body_preview: body.slice(0, 120) }
    } catch (e) {
      ycbmProbe = { status: 'fetch_error', error: String(e.message) }
    }
  } else {
    ycbmProbe = { status: 'skipped', error: 'credentials missing' }
  }

  res.status(200).json({ env_checks: checks, ycbm_live_probe: ycbmProbe })
}
