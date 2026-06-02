import { proxyRequest } from '../_proxy.js'
export default function handler(req, res) {
  const bare = (req.url || '').split('?')[0]
  const subPath = bare.replace(/^\/?(api\/)?lakbay\/?/, '')
  return proxyRequest('lakbay', subPath, req, res)
}
