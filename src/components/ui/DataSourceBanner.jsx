// Warns when a sales view is NOT showing live LakbayHub data — e.g. the API
// rejected us (missing/invalid app key) so we fell back to cached/seed data.
// Prevents stale numbers from looking like the real current period.
//
// Pass the result of getSalesSource() from api/lakbay. Renders nothing on 'live'.

import { AlertTriangle } from 'lucide-react'

export default function DataSourceBanner({ source }) {
  if (source === 'live') return null
  const isMock = source === 'mock'
  return (
    <div className={`rounded-xl px-4 py-3 flex items-start gap-2.5 text-sm border ${
      isMock ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-800'
    }`}>
      <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
      <div>
        <p className="font-semibold">
          {isMock ? 'Showing sample data — live sales unavailable' : 'Showing cached data — live LakbayHub unavailable'}
        </p>
        <p className="text-[13px] mt-0.5 opacity-90">
          Hindi makakonekta sa live LakbayHub sales feed (kailangan ng <code className="font-mono">LAKBAYHUB_APP_KEY</code>).
          Ang ipinapakita ay {isMock ? 'sample/seed' : 'naka-cache na'} data — hindi ang kasalukuyang sales.
          Idagdag ang app key sa <b>.env</b> at Vercel para bumalik ang live data.
        </p>
      </div>
    </div>
  )
}
