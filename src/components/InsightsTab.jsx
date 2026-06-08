// "Insights" — admin-only hub that merges the executive Overview (Summary) and
// the downloadable Reports into one tab with a sub-view toggle. Both were
// admin-only already, so merging them changes no RBAC; it just trims the top
// nav (8 → 7 tabs) and groups the two admin aggregation views together.

import { lazy, Suspense, useState } from 'react'
import { LayoutDashboard, FileText } from 'lucide-react'

const OverviewTab = lazy(() => import('./OverviewTab'))
const ReportsTab  = lazy(() => import('./ReportsTab'))

const PRIMARY = '#1B4F4F'

const VIEWS = [
  { id: 'summary', label: 'Summary', Icon: LayoutDashboard },
  { id: 'reports', label: 'Reports', Icon: FileText },
]

export default function InsightsTab({ userName = 'MJ', onJumpTab }) {
  const [view, setView] = useState('summary')

  return (
    <div className="flex flex-col gap-5">
      {/* Sub-view toggle */}
      <div className="flex bg-gray-100 rounded-xl p-1 gap-1 self-start" role="tablist" aria-label="Insights view">
        {VIEWS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setView(id)}
            role="tab"
            aria-selected={view === id}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1B4F4F] ${
              view === id ? 'bg-white shadow-sm font-semibold' : 'text-gray-600 hover:text-gray-900'
            }`}
            style={view === id ? { color: PRIMARY } : undefined}
          >
            <Icon size={15} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      <Suspense fallback={<div className="text-center py-12 text-gray-400">Loading…</div>}>
        {view === 'summary'
          ? <OverviewTab userName={userName} onJumpTab={onJumpTab} />
          : <ReportsTab />}
      </Suspense>
    </div>
  )
}
