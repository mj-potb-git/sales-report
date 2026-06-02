import { proxyRequest } from '../_proxy.js'
export default function handler(req, res) {
  // Extract sub-path from req.url — works regardless of whether Vercel
  // populates req.query.path for non-Next.js catch-all routes.
  // /api/ycbm/bookings?... → 'bookings'
  // /ycbm/profiles        → 'profiles'
  const bare = (req.url || '').split('?')[0]
  const subPath = bare.replace(/^\/?(api\/)?ycbm\/?/, '')
  return proxyRequest('ycbm', subPath, req, res)
}
