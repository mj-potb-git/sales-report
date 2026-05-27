import { useState } from 'react'
import TabNav from './components/TabNav'
import BookingsTab from './components/BookingsTab'
import SalesDashboard from './components/SalesDashboard'
import SalesAgentsTab from './components/SalesAgentsTab'
import SettingsTab from './components/SettingsTab'
import LiveIndicator from './components/LiveIndicator'
import useYcbmData from './hooks/useYcbmData'

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

export default function App() {
  const [activeTab, setActiveTab] = useState('bookings')
  const { bookings, loading, refreshing, error, lastFetched, refresh } = useYcbmData()

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#F8FAFA' }}>
      <header className="sticky top-0 z-40 bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex flex-col">
            <span className="text-xs text-gray-400 font-medium tracking-wide uppercase">
              Angel of Pinoy Online Travel Biz
            </span>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-lg font-bold" style={{ color: '#1B4F4F' }}>
                Travel Dashboard
              </span>
              {(activeTab === 'bookings' || activeTab === 'dashboard') && (
                <LiveIndicator
                  lastFetched={lastFetched}
                  refreshing={refreshing}
                  onRefresh={refresh}
                  label="YCBM"
                />
              )}
            </div>
          </div>
          <TabNav activeTab={activeTab} onTabChange={setActiveTab} />
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-5">
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
            {activeTab === 'bookings'  && <BookingsTab  bookings={bookings} />}
            {activeTab === 'dashboard' && <SalesDashboard bookings={bookings} />}
            {activeTab === 'sales'     && <SalesAgentsTab />}
          </div>
        )}
      </main>
    </div>
  )
}
