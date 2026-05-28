import { useState, useEffect } from 'react'
import TabNav from './components/TabNav'
import OverviewTab from './components/OverviewTab'
import BookingsTab from './components/BookingsTab'
import SalesDashboard from './components/SalesDashboard'
import SalesAgentsTab from './components/SalesAgentsTab'
import AccountOfficersTab from './components/AccountOfficersTab'
import ReportsTab from './components/ReportsTab'
import SettingsTab from './components/SettingsTab'
import LiveIndicator from './components/LiveIndicator'
import useYcbmData from './hooks/useYcbmData'
import { getSettings, subscribeSettings } from './lib/settings'
import { startAttendancePoller } from './lib/attendance'

// Boot attendance sync once on app load (idempotent)
startAttendancePoller()

function SkeletonLoader() {
  return (
    <div className="p-4 sm:p-6 flex flex-col gap-4 max-w-6xl mx-auto w-full">
      <div className="skeleton h-8 w-48" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="skeleton h-24" />
        ))}
      </div>
      <div className="skeleton h-64" />
      <div className="skeleton h-48" />
    </div>
  )
}

function ErrorState({ error }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
      <p className="text-red-700 font-semibold">Unable to load bookings</p>
      <p className="text-red-500 text-sm mt-1">{error.message}</p>
      <p className="text-gray-500 text-xs mt-2">
        Check your API credentials in <code>.env</code> and restart the dev server.
      </p>
    </div>
  )
}

function UserBadge({ userName, userRole }) {
  const initials = userName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div className="flex items-center gap-2.5 pl-3 ml-2 border-l border-gray-200">
      <div className="w-8 h-8 rounded-full text-white text-xs font-bold flex items-center justify-center"
           style={{ backgroundColor: '#1B4F4F' }}>
        {initials}
      </div>
      <div className="hidden sm:flex flex-col leading-tight">
        <span className="text-xs font-semibold text-gray-900">{userName}</span>
        <span className="text-[10px] text-gray-500">{userRole}</span>
      </div>
    </div>
  )
}

export default function App() {
  const [activeTab, setActiveTab] = useState('overview')
  const { bookings, loading, refreshing, error, lastFetched, refresh } = useYcbmData()

  // Re-read settings on change so header updates live
  const [settings, setSettings] = useState(getSettings())
  useEffect(() => subscribeSettings(setSettings), [])

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#F8FAFA' }}>
      <header className="sticky top-0 z-40 bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex flex-col min-w-0">
              <span className="text-[10px] text-gray-400 font-semibold tracking-widest uppercase truncate">
                {settings.organizationName}
              </span>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-lg font-bold truncate" style={{ color: '#1B4F4F' }}>
                  {settings.dashboardTitle}
                </span>
                {(activeTab === 'overview' || activeTab === 'bookings' || activeTab === 'dashboard') && (
                  <LiveIndicator
                    lastFetched={lastFetched}
                    refreshing={refreshing}
                    onRefresh={refresh}
                    label="YCBM"
                  />
                )}
              </div>
            </div>
            <UserBadge userName={settings.userName} userRole={settings.userRole} />
          </div>
          <TabNav activeTab={activeTab} onTabChange={setActiveTab} />
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-5">
        {/* Settings is always reachable — even mid-load or during an error —
            so users can fix bad credentials without being locked out */}
        {activeTab === 'settings' ? (
          <SettingsTab />
        ) : loading ? (
          <SkeletonLoader />
        ) : error ? (
          <ErrorState error={error} />
        ) : (
          <div key={activeTab} className="tab-content">
            {activeTab === 'overview'  && <OverviewTab bookings={bookings} userName={settings.userName} />}
            {activeTab === 'bookings'  && <BookingsTab  bookings={bookings} />}
            {activeTab === 'dashboard' && <SalesDashboard bookings={bookings} />}
            {activeTab === 'sales'     && <SalesAgentsTab />}
            {activeTab === 'officers'  && <AccountOfficersTab />}
            {activeTab === 'reports'   && <ReportsTab />}
          </div>
        )}
      </main>
    </div>
  )
}
