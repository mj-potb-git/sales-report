import { proxyRequest } from '../_proxy.js'
export default function handler(req, res) {
  const p = req.query.path || []
  return proxyRequest('ycbm', Array.isArray(p) ? p.join('/') : p, req, res)
}
