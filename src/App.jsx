import { useState, useEffect, useMemo, lazy, Suspense } from 'react'
import { LogOut, Loader2, ShieldAlert } from 'lucide-react'
import TabNav from './components/TabNav'
import LiveIndicator from './components/LiveIndicator'

const OverviewTab       = lazy(() => import('./components/OverviewTab'))
const BookingsTab       = lazy(() => import('./components/BookingsTab'))
const SalesDashboard    = lazy(() => import('./components/SalesDashboard'))
const SalesAgentsTab    = lazy(() => import('./components/SalesAgentsTab'))
const AccountOfficersTab = lazy(() => import('./components/AccountOfficersTab'))
const AacioReportTab    = lazy(() => import('./components/AacioReportTab'))
const ReportsTab        = lazy(() => import('./components/ReportsTab'))
const UserManagementTab = lazy(() => import('./components/UserManagementTab'))
const SettingsTab       = lazy(() => import('./components/SettingsTab'))
const LandingPage       = lazy(() => import('./components/LandingPage'))
import useYcbmData from './hooks/useYcbmData'
import { getSettings, subscribeSettings } from './lib/settings'
import { startAttendancePoller } from './lib/attendance'
import { getSession, onAuthChange, signOut } from './lib/auth'
import { fetchRole, allowedTabsForRole, ROLE_LABELS } from './lib/roles'

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

function UserBadge({ userName, userRole, onSignOut }) {
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
      {onSignOut && (
        <button
          onClick={onSignOut}
          title="Log out"
          className="ml-1 flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
          aria-label="Log out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}

function NoAccess({ email, onSignOut }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: '#F8FAFA' }}>
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
        <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-4">
          <ShieldAlert className="w-6 h-6 text-amber-500" />
        </div>
        <h1 className="text-lg font-bold text-gray-900">No access assigned</h1>
        <p className="text-sm text-gray-500 mt-2">
          Naka-login ka bilang <span className="font-semibold">{email}</span>, pero wala ka pang naka-assign na role.
          Hingin sa admin na bigyan ka ng access.
        </p>
        <button
          onClick={onSignOut}
          className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
          style={{ backgroundColor: '#1B4F4F' }}
        >
          <LogOut className="w-4 h-4" /> Log out
        </button>
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

  // ── Auth gate ──────────────────────────────────────────────────────
  // 'checking' until we know; then either a session object or null.
  const [session, setSession] = useState('checking')
  useEffect(() => {
    let alive = true
    getSession().then((s) => { if (alive) setSession(s) })
    const off = onAuthChange((s) => setSession(s))
    return () => { alive = false; off() }
  }, [])

  // ── Role gate ──────────────────────────────────────────────────────
  // Track which email the resolved role belongs to, so a user switch shows
  // 'loading' again instead of briefly flashing the previous user's tabs.
  const [roleState, setRoleState] = useState(null) // { email, role } | null
  const sessionEmail = session && session !== 'checking' ? session.user?.email : null
  useEffect(() => {
    if (!sessionEmail) return
    let alive = true
    fetchRole(sessionEmail).then((r) => { if (alive) setRoleState({ email: sessionEmail, role: r }) })
    return () => { alive = false }
  }, [sessionEmail])
  const role = (roleState && roleState.email === sessionEmail) ? roleState.role : 'loading'

  const allowedTabs = useMemo(
    () => (role && role !== 'loading' ? allowedTabsForRole(role) : []),
    [role],
  )
  // The tab actually shown — clamped to what this role may see (no flash of a
  // forbidden tab, no need to mutate activeTab state).
  const currentTab = allowedTabs.includes(activeTab) ? activeTab : (allowedTabs[0] || activeTab)

  // While verifying the stored session, show a minimal splash (avoids a
  // flash of the landing page for already-logged-in users).
  if (session === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F8FAFA' }}>
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#1CA9D6' }} />
      </div>
    )
  }

  // Logged out → branded landing + login.
  if (!session) {
    return (
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F8FAFA' }}><Loader2 className="w-6 h-6 animate-spin" style={{ color: '#1CA9D6' }} /></div>}>
        <LandingPage />
      </Suspense>
    )
  }

  // Resolving the user's role.
  if (role === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F8FAFA' }}>
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#1CA9D6' }} />
      </div>
    )
  }

  // Logged in but no role assigned → no access.
  if (!role) {
    return <NoAccess email={session.user?.email} onSignOut={signOut} />
  }

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
                {(currentTab === 'overview' || currentTab === 'bookings' || currentTab === 'dashboard') && (
                  <LiveIndicator
                    lastFetched={lastFetched}
                    refreshing={refreshing}
                    onRefresh={refresh}
                    label="YCBM"
                  />
                )}
              </div>
            </div>
            <UserBadge userName={settings.userName} userRole={ROLE_LABELS[role] || settings.userRole} onSignOut={signOut} />
          </div>
          <TabNav activeTab={currentTab} onTabChange={setActiveTab} allowedTabs={allowedTabs} />
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-5">
        {/* Settings + tabs with their OWN data source (Sales/Officers/AACIO/
            Reports) are always reachable — they don't depend on POTB YCBM, so
            they shouldn't wait behind its slow pagination. Only the POTB-booking
            tabs (overview/bookings/operations) honor the global loading/error gate. */}
        <Suspense fallback={<SkeletonLoader />}>
          {currentTab === 'settings' ? (
            <SettingsTab />
          ) : currentTab === 'users' ? (
            <UserManagementTab />
          ) : currentTab === 'sales' ? (
            <SalesAgentsTab />
          ) : currentTab === 'officers' ? (
            <AccountOfficersTab />
          ) : currentTab === 'aacio' ? (
            <AacioReportTab />
          ) : currentTab === 'reports' ? (
            <ReportsTab />
          ) : loading ? (
            <SkeletonLoader />
          ) : error ? (
            <ErrorState error={error} />
          ) : (
            <div key={currentTab} className="tab-content">
              {currentTab === 'overview'  && <OverviewTab bookings={bookings} userName={settings.userName} onJumpTab={setActiveTab} />}
              {currentTab === 'bookings'  && <BookingsTab  bookings={bookings} />}
              {currentTab === 'dashboard' && <SalesDashboard bookings={bookings} />}
            </div>
          )}
        </Suspense>
      </main>
    </div>
  )
}
