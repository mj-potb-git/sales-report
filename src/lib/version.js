// Auto-reload when a new app version is deployed.
//
// WHY: the root cause of the Operations report "coming back wrong" was viewers
// (and MJ) running STALE CACHED code. Old code used a union sync that
// resurrected deleted bookings, and even after fixes shipped, browsers kept
// running the old bundle until a manual Ctrl+Shift+R. This watcher removes that
// failure mode entirely: when a new build is live, every open tab reloads once,
// on its own, so no one ever runs old code.
//
// HOW: the production build (Vite) references a content-hashed entry bundle
// (/assets/index-<hash>.js) from index.html. We record that entry src at boot,
// then periodically re-fetch index.html; if the entry changed, a new version
// shipped → reload once. No-ops in dev (unhashed /src/main.jsx) and guards
// against reload loops via sessionStorage.

const POLL_MS = 3 * 60_000
const GUARD_KEY = 'potb_version_reloaded_to'

// The <script type="module"> the browser actually booted from.
function bootedEntry() {
  const el = document.querySelector('script[type="module"][src]')
  return el ? el.getAttribute('src') : null
}

// Extract that same entry from a freshly-fetched index.html.
function entryFromHtml(html) {
  const m = html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/i)
  return m ? m[1] : null
}

let _booted = null

/** Start watching for new deploys. Idempotent-ish; call once on app load. */
export function startVersionWatch() {
  // Dev serves unhashed ES modules (/src/main.jsx) that never change → skip.
  if (import.meta?.env?.DEV) return
  _booted = bootedEntry()
  if (!_booted) return

  const check = async () => {
    if (document.hidden) return
    try {
      const html = await (await fetch('/index.html', { cache: 'no-store' })).text()
      const latest = entryFromHtml(html)
      if (!latest || latest === _booted) return   // same version — nothing to do
      let guard = null
      try { guard = sessionStorage.getItem(GUARD_KEY) } catch { /* ignore */ }
      if (guard === latest) return                 // already reloaded to this one — no loop
      try { sessionStorage.setItem(GUARD_KEY, latest) } catch { /* ignore */ }
      location.reload()
    } catch { /* transient network — retry next tick */ }
  }

  setInterval(check, POLL_MS)
  // Also check the moment the tab regains focus (e.g. MJ opens it next morning).
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check() })
}
