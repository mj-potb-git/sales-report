import { LayoutDashboard, CalendarDays, BarChart2, Users, Briefcase, FileText, Settings, Globe } from 'lucide-react'

const tabs = [
  { id: 'overview',  label: 'Overview',  Icon: LayoutDashboard },
  { id: 'bookings',  label: 'Bookings',  Icon: CalendarDays },
  { id: 'dashboard', label: 'Operations',Icon: BarChart2 },
  { id: 'sales',     label: 'Sales',     Icon: Users },
  { id: 'officers',  label: 'Officers',  Icon: Briefcase },
  { id: 'aacio',     label: 'AACIO',     Icon: Globe },
  { id: 'reports',   label: 'Reports',   Icon: FileText },
  { id: 'settings',  label: 'Settings',  Icon: Settings },
]

export default function TabNav({ activeTab, onTabChange }) {
  return (
    <>
      {/* Desktop: horizontal tabs */}
      <div className="hidden sm:flex gap-1 bg-gray-100 rounded-xl p-1">
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            aria-selected={activeTab === id}
            role="tab"
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
              activeTab === id
                ? 'bg-white text-[#1B4F4F] shadow-sm font-semibold'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Mobile: fixed bottom bar */}
      <nav
        className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-50 flex"
        aria-label="Main navigation"
      >
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            aria-selected={activeTab === id}
            role="tab"
            className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 text-xs font-medium transition-colors ${
              activeTab === id ? 'text-[#1B4F4F]' : 'text-gray-400'
            }`}
          >
            <Icon
              size={20}
              fill={activeTab === id ? '#1B4F4F' : 'none'}
              strokeWidth={activeTab === id ? 2.5 : 1.5}
            />
            {label}
          </button>
        ))}
      </nav>
    </>
  )
}
