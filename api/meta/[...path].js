import { proxyRequest } from '../_proxy.js'
export default function handler(req, res) {
  const bare = (req.url || '').split('?')[0]
  const subPath = bare.replace(/^\/?(api\/)?meta\/?/, '')
  return proxyRequest('meta', subPath, req, res)
}
