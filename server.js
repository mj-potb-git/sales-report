import express from 'express'
import { createProxyMiddleware } from 'http-proxy-middleware'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3000

// Credentials — set these as Environment variables in Amplify console
// (App settings → Environment variables). Same names as the .env file.
const accountId      = process.env.YCBM_ACCOUNT_ID       || ''
const apiKey         = process.env.YCBM_API_KEY           || ''
const basic          = Buffer.from(`${accountId}:${apiKey}`).toString('base64')

const aacioAccountId = process.env.YCBM_AACIO_ACCOUNT_ID || ''
const aacioApiKey    = process.env.YCBM_AACIO_API_KEY    || ''
const aacioBasic     = aacioApiKey
  ? Buffer.from(`${aacioAccountId}:${aacioApiKey}`).toString('base64')
  : ''

const metaAdAccount  = process.env.META_AD_ACCOUNT_ID    || ''
const metaToken      = process.env.META_ACCESS_TOKEN     || ''
const fusiooToken = process.env.FUSIOO_ACCESS_TOKEN || ''

// NOTE: app.use('/prefix', middleware) strips the prefix before the proxy sees
// it. So pathRewrite must match the stripped path (e.g. '/bookings'), not the
// original '/api/ycbm/bookings'. We use the function form to prepend the
// upstream base path to whatever Express passes through.

// ── /api/ycbm → YouCanBook.me POTB account ─────────────────────────────────
app.use('/api/ycbm', createProxyMiddleware({
  target: 'https://api.youcanbook.me',
  changeOrigin: true,
  pathRewrite: (path) => `/v1/${accountId}${path}`,
  on: {
    proxyReq(proxyReq) {
      proxyReq.setHeader('Authorization', `Basic ${basic}`)
      proxyReq.setHeader('Accept', 'application/json')
    },
  },
}))

// ── /api/aacio → YouCanBook.me AACIO account ───────────────────────────────
app.use('/api/aacio', createProxyMiddleware({
  target: 'https://api.youcanbook.me',
  changeOrigin: true,
  pathRewrite: (path) => `/v1/${aacioAccountId}${path}`,
  on: {
    proxyReq(proxyReq) {
      if (aacioBasic) proxyReq.setHeader('Authorization', `Basic ${aacioBasic}`)
      proxyReq.setHeader('Accept', 'application/json')
    },
  },
}))

// ── /api/lakbay → LakbayHub utilities API ──────────────────────────────────
app.use('/api/lakbay', createProxyMiddleware({
  target: 'https://potb-utilities-api.lakbayhub.com',
  changeOrigin: true,
  pathRewrite: (path) => `/api/v1${path}`,
  on: {
    proxyReq(proxyReq) {
      proxyReq.setHeader('Accept', 'application/json')
      proxyReq.setHeader('Content-Type', 'application/json')
    },
  },
}))

// ── /api/fusioo → Fusioo API ───────────────────────────────────────────────
app.use('/api/fusioo', createProxyMiddleware({
  target: 'https://api.fusioo.com',
  changeOrigin: true,
  pathRewrite: (path) => `/v3${path}`,
  on: {
    proxyReq(proxyReq) {
      if (fusiooToken) proxyReq.setHeader('Authorization', `Bearer ${fusiooToken}`)
      proxyReq.setHeader('Accept', 'application/json')
    },
  },
}))

// ── /api/meta → Meta Graph API ─────────────────────────────────────────────
app.use('/api/meta', createProxyMiddleware({
  target: 'https://graph.facebook.com',
  changeOrigin: true,
  pathRewrite: (path) => `/v21.0/${metaAdAccount}${path}`,
  on: {
    proxyReq(proxyReq) {
      if (metaToken && !/(\?|&)access_token=/.test(proxyReq.path)) {
        proxyReq.path += (proxyReq.path.includes('?') ? '&' : '?')
          + 'access_token=' + encodeURIComponent(metaToken)
      }
      proxyReq.setHeader('Accept', 'application/json')
    },
  },
}))

// ── Static files (Vite build output) ───────────────────────────────────────
app.use(express.static(join(__dirname, 'dist')))
app.get(/(.*)/, (_req, res) => res.sendFile(join(__dirname, 'dist', 'index.html')))

app.listen(PORT, () => {
  console.log(`POTB dashboard server running on port ${PORT}`)
})
