// Settings store backed by localStorage.
// Falls back to env vars (loaded by Vite at build time) when the user hasn't
// overridden a value.
//
// SECURITY NOTES:
// - VITE_*  values ship in the browser bundle — only put publishable keys here.
// - The Supabase SECRET key and the YouCanBook.me API key never reach the
//   browser. They live in .env and are read by the Vite dev server (for the
//   YCBM proxy) and the Node seed script. The Settings UI only displays
//   placeholders for those and offers a "Copy as .env entries" helper so you
//   can update .env yourself in your editor.

const STORAGE_KEY = 'salesDashboard.settings.v1'

// What the user can override at runtime (browser-safe only):
const BROWSER_FIELDS = ['supabaseUrl', 'supabaseKey', 'monthlyTarget']

// Default monthly sales target — placeholder for an Angel of Pinoy
// Travel Biz benchmark. Edit in Settings → Business → Monthly Target.
const DEFAULT_MONTHLY_TARGET = 1_000_000 // ₱1,000,000

function readStored() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

function envFallback() {
  return {
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? '',
    supabaseKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
  }
}

export function getSettings() {
  const stored = readStored()
  const env    = envFallback()
  return {
    supabaseUrl:    stored.supabaseUrl || env.supabaseUrl,
    supabaseKey:    stored.supabaseKey || env.supabaseKey,
    monthlyTarget:  Number(stored.monthlyTarget) || DEFAULT_MONTHLY_TARGET,
    // origin tracking so the UI can show "from .env" vs "from settings"
    _origin: {
      supabaseUrl:   stored.supabaseUrl   ? 'override' : (env.supabaseUrl ? 'env' : 'empty'),
      supabaseKey:   stored.supabaseKey   ? 'override' : (env.supabaseKey ? 'env' : 'empty'),
      monthlyTarget: stored.monthlyTarget ? 'override' : 'default',
    },
  }
}

export function saveSettings(patch) {
  const current = readStored()
  const next = { ...current }
  for (const key of BROWSER_FIELDS) {
    if (patch[key] !== undefined) {
      const v = String(patch[key]).trim()
      if (v) next[key] = v
      else delete next[key]
    }
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  window.dispatchEvent(new Event('settings-changed'))
}

export function resetOverrides() {
  localStorage.removeItem(STORAGE_KEY)
  window.dispatchEvent(new Event('settings-changed'))
}

export function subscribeSettings(handler) {
  const fn = () => handler(getSettings())
  window.addEventListener('settings-changed', fn)
  return () => window.removeEventListener('settings-changed', fn)
}
