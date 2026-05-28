import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const accountId = env.YCBM_ACCOUNT_ID
  const apiKey    = env.YCBM_API_KEY
  const basic     = Buffer.from(`${accountId}:${apiKey}`).toString('base64')

  const metaAdAccount = env.META_AD_ACCOUNT_ID || ''
  const metaToken     = env.META_ACCESS_TOKEN  || ''

  const fusiooToken = env.FUSIOO_ACCESS_TOKEN || ''

  return {
    plugins: [react(), tailwindcss()],
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
        // LakbayHub utilities API — no auth currently, but proxying keeps a
        // clean swap-point if they add auth later (just set headers here)
        '/api/lakbay': {
          target: 'https://potb-utilities-api.lakbayhub.com',
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api\/lakbay/, '/api/v1'),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader('Accept', 'application/json')
              proxyReq.setHeader('Content-Type', 'application/json')
            })
          },
        },
        // Fusioo Booking Transactions — for Account Officer tracking.
        // 10-year Bearer token from Credentials Grant lives in .env.
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
