import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const accountId = env.YCBM_ACCOUNT_ID
  const apiKey    = env.YCBM_API_KEY
  const basic     = Buffer.from(`${accountId}:${apiKey}`).toString('base64')

  // Second YCBM account: AACIO external team
  const aacioAccountId = env.YCBM_AACIO_ACCOUNT_ID || ''
  const aacioApiKey    = env.YCBM_AACIO_API_KEY    || ''
  const aacioBasic     = aacioApiKey ? Buffer.from(`${aacioAccountId}:${aacioApiKey}`).toString('base64') : ''

  const metaAdAccount = env.META_AD_ACCOUNT_ID || ''
  const metaToken     = env.META_ACCESS_TOKEN  || ''

  const fusiooToken = env.FUSIOO_ACCESS_TOKEN || ''

  // AACIO (HighLevel white-label) Private Integration Token — surveys/leads.
  const hlToken = env.AACIO_HL_TOKEN || ''

  // LakbayHub now requires an x-app-key (401 without it). If we have the key
  // locally, hit LakbayHub directly. If NOT, borrow the live Vercel deployment's
  // proxy (which has the key set server-side) so local dev still shows real,
  // current sales data instead of stale fallback. Set LAKBAYHUB_APP_KEY in .env
  // to switch back to a direct connection.
  const lakbayHasKey = !!env.LAKBAYHUB_APP_KEY
  const LIVE_PROXY_ORIGIN = env.LIVE_PROXY_ORIGIN || 'https://potb-sales-report.vercel.app'
  const lakbayProxy = lakbayHasKey
    ? {
        target: 'https://potb-utilities-api.lakbayhub.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/lakbay/, '/api/v1'),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('Accept', 'application/json')
            proxyReq.setHeader('Content-Type', 'application/json')
            proxyReq.setHeader('x-app-key', env.LAKBAYHUB_APP_KEY)
          })
        },
      }
    : {
        // No local key → route through the live deployment's /api/lakbay proxy.
        target: LIVE_PROXY_ORIGIN,
        changeOrigin: true,
        secure: true,
        // keep the /api/lakbay/* path so the live serverless proxy handles it
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('Accept', 'application/json')
          })
        },
      }

  // Dev-only middleware for /api/admin (user management). In production this is
  // a Vercel function (api/admin.js) or an Express route (server.js); locally
  // the Vite proxy can't run serverless code, so we mount it here.
  const adminApiPlugin = {
    name: 'potb-admin-api',
    configureServer(server) {
      server.middlewares.use('/api/admin', (req, res) => {
        let raw = ''
        req.on('data', (c) => { raw += c })
        req.on('end', async () => {
          try {
            const { createAdminHandler } = await import('./api/_adminLogic.js')
            const handle = createAdminHandler({
              url: env.VITE_SUPABASE_URL,
              serviceKey: env.SUPABASE_SERVICE_KEY,
            })
            const u = new URL(req.url, 'http://localhost')
            const query = Object.fromEntries(u.searchParams)
            const body = raw ? JSON.parse(raw) : {}
            const result = await handle({
              method: req.method, query, body, authHeader: req.headers.authorization,
            })
            res.statusCode = result.status
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(result.body))
          } catch (e) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: String(e?.message || e) }))
          }
        })
      })
    },
  }

  // Dev-only middleware for /api/ycbm-bookings (server-side YCBM pagination).
  // In production this is the Vercel function api/ycbm-bookings.js; locally the
  // Vite proxy can't run it, so we mount the same shared crawl here.
  const ycbmBookingsPlugin = {
    name: 'potb-ycbm-bookings-api',
    configureServer(server) {
      server.middlewares.use('/api/ycbm-bookings', async (req, res) => {
        try {
          const u = new URL(req.url, 'http://localhost')
          const account = u.searchParams.get('account') === 'aacio' ? 'aacio' : 'ycbm'
          const id  = account === 'aacio' ? aacioAccountId : accountId
          const key = account === 'aacio' ? aacioApiKey    : apiKey
          if (!id || !key) {
            res.statusCode = 503
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: `${account} credentials not configured` }))
            return
          }
          const fromDaysBack  = Math.min(120, Math.max(1, Number(u.searchParams.get('fromDaysBack'))  || 14))
          const toDaysForward = Math.min(120, Math.max(0, Number(u.searchParams.get('toDaysForward')) || 10))
          const { crawlYcbm } = await import('./api/_ycbmCrawl.js')
          const { bookings, partial } = await crawlYcbm({ accountId: id, apiKey: key, fromDaysBack, toDaysForward, budgetMs: 50000, maxPages: 800 })
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('X-Ycbm-Partial', partial ? '1' : '0')
          res.end(JSON.stringify(bookings))
        } catch (e) {
          res.statusCode = 502
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: String(e?.message || e) }))
        }
      })
    },
  }

  return {
    plugins: [react(), tailwindcss(), adminApiPlugin, ycbmBookingsPlugin],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/recharts') || id.includes('node_modules/d3') || id.includes('node_modules/victory')) return 'vendor-charts'
            if (id.includes('node_modules/@supabase')) return 'vendor-supabase'
            if (id.includes('node_modules/lucide-react')) return 'vendor-lucide'
            if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) return 'vendor-react'
          },
        },
      },
    },
    server: {
      proxy: {
        '/api/ycbm': {
          target: 'https://api.youcanbook.me',
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api\/ycbm/, `/v1/${accountId}`),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader('Authorization', `Basic ${basic}`)
              proxyReq.setHeader('Accept', 'application/json')
            })
          },
        },
        // Second YCBM account — AACIO external team (support@pinoyonlinebiz.com).
        // Separate account/key so we can show their bookings + sales side by side
        // with POTB without mixing data. Same Basic-auth pattern.
        // NOTE: route is /api/aacio (NOT /api/ycbm-aacio) — the latter would be
        // prefix-matched by the /api/ycbm proxy above and routed to the POTB account.
        '/api/aacio': {
          target: 'https://api.youcanbook.me',
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api\/aacio/, `/v1/${aacioAccountId}`),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              if (aacioBasic) proxyReq.setHeader('Authorization', `Basic ${aacioBasic}`)
              proxyReq.setHeader('Accept', 'application/json')
            })
          },
        },
        // LakbayHub utilities API. Requires x-app-key. Uses a direct connection
        // when LAKBAYHUB_APP_KEY is set locally, otherwise borrows the live
        // deployment's proxy (see lakbayProxy definition above).
        '/api/lakbay': lakbayProxy,
        // Fusioo Booking Transactions — for Account Officer tracking.
        // 10-year Bearer token from Credentials Grant lives in .env.
        // Workspace slug is required in the URL path: /v3/{workspace}/...
        '/api/fusioo': {
          target: 'https://api.fusioo.com',
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api\/fusioo/, '/v3'),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              if (fusiooToken) proxyReq.setHeader('Authorization', `Bearer ${fusiooToken}`)
              proxyReq.setHeader('Accept', 'application/json')
            })
          },
        },
        // AACIO — HighLevel (GoHighLevel white-label) API. Injects the Private
        // Integration Token as a Bearer header + the required Version header,
        // server-side, so the browser never sees the token. Path
        // /api/hl/<rest> → https://services.leadconnectorhq.com/<rest>.
        '/api/hl': {
          target: 'https://services.leadconnectorhq.com',
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api\/hl/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              if (hlToken) proxyReq.setHeader('Authorization', `Bearer ${hlToken}`)
              proxyReq.setHeader('Version', '2021-07-28')
              proxyReq.setHeader('Accept', 'application/json')
            })
          },
        },
        // Meta Graph API (Marketing). Token is appended as ?access_token=
        // (Meta does not use bearer headers). Path /api/meta/<rest> becomes
        // /v21.0/<adAccountId>/<rest> on graph.facebook.com.
        '/api/meta': {
          target: 'https://graph.facebook.com',
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api\/meta/, `/v21.0/${metaAdAccount}`),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              // Append access_token query param if not already present
              if (metaToken && !/(\?|&)access_token=/.test(proxyReq.path)) {
                proxyReq.path += (proxyReq.path.includes('?') ? '&' : '?') + 'access_token=' + encodeURIComponent(metaToken)
              }
              proxyReq.setHeader('Accept', 'application/json')
            })
          },
        },
      },
    },
  }
})
