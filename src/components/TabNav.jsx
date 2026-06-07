import { LayoutDashboard, CalendarDays, BarChart2, Users, Briefcase, FileText, Settings, Globe, UserCog } from 'lucide-react'
import { PRIMARY } from '../lib/theme'

// Tabs are grouped so the nav reads as sections instead of one long flat row.
// `group` only affects visual grouping/order — it does NOT change RBAC. The
// authoritative role→tab mapping lives in lib/roles.js; this just renders
// whatever `allowedTabs` permits, in group order.
const tabs = [
  { id: 'overview',  label: 'Overview',  Icon: LayoutDashboard, group: 'Live' },
  { id: 'dashboard', label: 'Operations',Icon: BarChart2,       group: 'Live' },
  { id: 'bookings',  label: 'Bookings',  Icon: CalendarDays,    group: 'Live' },
  { id: 'sales',     label: 'Sales',     Icon: Users,           group: 'Analytics' },
  { id: 'officers',  label: 'Officers',  Icon: Briefcase,       group: 'Analytics' },
  { id: 'reports',   label: 'Reports',   Icon: FileText,        group: 'Analytics' },
  { id: 'aacio',     label: 'AACIO',     Icon: Globe,           group: 'External' },
  { id: 'users',     label: 'Users',     Icon: UserCog,         group: 'Admin' },
  { id: 'settings',  label: 'Settings',  Icon: Settings,        group: 'Admin' },
]

export default function TabNav({ activeTab, onTabChange, allowedTabs }) {
  // Show only the tabs this role is allowed to see (null = show all).
  const visibleTabs = allowedTabs
    ? tabs.filter(t => allowedTabs.includes(t.id))
    : tabs

  // Many tabs (admin) → scrollable row on mobile instead of cramming flex-1.
  const manyMobile = visibleTabs.length > 4

  return (
    <>
      {/* Desktop: horizontal tabs with subtle dividers between groups */}
      <div className="hidden sm:flex items-center gap-1 bg-gray-100 rounded-xl p-1" role="tablist" aria-label="Dashboard sections">
        {visibleTabs.map(({ id, label, group }, i) => {
          const prevGroup = i > 0 ? visibleTabs[i - 1].group : group
          const showDivider = i > 0 && group !== prevGroup
          return (
            <span key={id} className="flex items-center">
              {showDivider && <span className="w-px h-5 bg-gray-300 mx-1.5" aria-hidden="true" />}
              <button
                onClick={() => onTabChange(id)}
                aria-selected={activeTab === id}
                title={group}
                role="tab"
                className={`px-5 py-2 rounded-lg text-sm font-medium transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[#1B4F4F] ${
                  activeTab === id
                    ? 'bg-white text-[#1B4F4F] shadow-sm font-semibold'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {label}
              </button>
            </span>
          )
        })}
      </div>

      {/* Mobile: fixed bottom bar. Scrolls horizontally when there are many tabs
          (admin) so each stays tappable instead of being squeezed to nothing. */}
      <nav
        className={`sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 flex ${
          manyMobile ? 'overflow-x-auto' : ''
        }`}
        role="tablist"
        aria-label="Main navigation"
      >
        {visibleTabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            aria-selected={activeTab === id}
            role="tab"
            className={`${manyMobile ? 'min-w-[4.5rem] flex-shrink-0' : 'flex-1'} flex flex-col items-center justify-center gap-1 py-3 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1B4F4F] ${
              activeTab === id ? 'text-[#1B4F4F]' : 'text-gray-500'
            }`}
          >
            <Icon
              size={20}
              fill={activeTab === id ? PRIMARY : 'none'}
              strokeWidth={activeTab === id ? 2.5 : 1.5}
              aria-hidden="true"
            />
            {label}
          </button>
        ))}
      </nav>
    </>
  )
}
