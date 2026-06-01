import { useState } from 'react'
import { LogIn, Loader2, AlertCircle, Eye, EyeOff, CheckCircle2 } from 'lucide-react'
import { signIn, sendPasswordReset, isAuthConfigured } from '../lib/auth'
import { getSettings } from '../lib/settings'
import PotbLogo from './PotbLogo'

// Brand palette taken from the POTB logo: cyan-blue "P" + gold accent.
const BRAND_BLUE   = '#1CA9D6'  // logo cyan
const BRAND_BLUE_DK = '#0E6E91' // deeper shade for gradient
const BRAND_GOLD   = '#F9B233'  // logo gold

export default function LandingPage() {
  const settings = getSettings()
  const configured = isAuthConfigured()

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [busy, setBusy]         = useState(false)
  const [error, setError]       = useState('')
  const [notice, setNotice]     = useState('')

  async function handleLogin(e) {
    e.preventDefault()
    setError(''); setNotice('')
    if (!email || !password) { setError('Email and password are required.'); return }
    setBusy(true)
    try {
      await signIn(email, password)
      // onAuthChange in App.jsx flips the gate — nothing else to do here.
    } catch (err) {
      setError(err.message || 'Unable to sign in.')
    } finally {
      setBusy(false)
    }
  }

  async function handleForgot() {
    setError(''); setNotice('')
    if (!email) { setError('Enter your email first to reset your password.'); return }
    setBusy(true)
    try {
      await sendPasswordReset(email)
      setNotice('A reset link has been sent to your email. Please check your inbox.')
    } catch (err) {
      setError(err.message || 'Unable to send the reset email.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row" style={{ backgroundColor: '#F8FAFA' }}>
      {/* ── Brand / hero side ─────────────────────────────────────────── */}
      <div
        className="relative lg:w-1/2 flex flex-col justify-between p-8 sm:p-12 text-white overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${BRAND_BLUE_DK} 0%, ${BRAND_BLUE} 100%)` }}
      >
        {/* soft decorative glows */}
        <div className="pointer-events-none absolute -top-20 -right-20 w-72 h-72 rounded-full opacity-20"
             style={{ backgroundColor: BRAND_GOLD }} />
        <div className="pointer-events-none absolute -bottom-24 -left-16 w-80 h-80 rounded-full opacity-10 bg-white" />

        <div className="relative z-10">
          <span className="inline-block text-[11px] font-semibold tracking-[0.2em] uppercase opacity-80">
            {settings.organizationName}
          </span>
        </div>

        <div className="relative z-10 max-w-md">
          {/* Logo in a clean white card so it always reads well on the blue */}
          <div className="inline-flex items-center justify-center bg-white rounded-2xl px-5 py-4 mb-7 shadow-lg">
            <PotbLogo size={56} withWordmark className="text-gray-900" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold leading-tight">
            {settings.dashboardTitle}
          </h1>
          <p className="mt-4 text-base sm:text-lg opacity-90 leading-relaxed">
            Real-time bookings, sales, and ad performance for Pinoy Online Travel Biz —
            one console for the entire operation.
          </p>
          <ul className="mt-6 space-y-2.5 text-sm opacity-90">
            {[
              'Live bookings from YouCanBook.me',
              'Sales and sign-ups from LakbayHub',
              'Ad spend and ROAS from Meta',
            ].map((t) => (
              <li key={t} className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: BRAND_GOLD }} />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative z-10 text-xs opacity-60">
          Invite-only access · For the POTB team only
        </div>
      </div>

      {/* ── Login side ────────────────────────────────────────────────── */}
      <div className="lg:w-1/2 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-bold text-gray-900">Welcome back 👋</h2>
          <p className="mt-1.5 text-sm text-gray-500">
            Sign in to view the dashboard in real time.
          </p>

          {!configured && (
            <div className="mt-5 flex items-start gap-2.5 rounded-xl bg-amber-50 border border-amber-200 p-3.5 text-sm text-amber-800">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>
                Supabase is not configured yet. Set the URL + anon key in{' '}
                <strong>Settings</strong> or in <code>.env</code> before sign-in will work.
              </span>
            </div>
          )}

          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Email</label>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@pinoyonlinebiz.com"
                className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/15 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 pr-10 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/15 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
            {notice && (
              <div className="flex items-start gap-2 rounded-xl bg-green-50 border border-green-200 p-3 text-sm text-green-700">
                <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{notice}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={busy || !configured}
              className="w-full flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-95"
              style={{ backgroundColor: BRAND_BLUE }}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
              {busy ? 'Signing in…' : 'Sign in'}
            </button>

            <button
              type="button"
              onClick={handleForgot}
              disabled={busy}
              className="w-full text-center text-xs text-gray-500 hover:text-gray-700 transition"
            >
              Forgot your password?
            </button>
          </form>

          <p className="mt-8 text-center text-[11px] text-gray-400">
            No access yet? Ask your admin for an invite. This dashboard is invite-only.
          </p>
        </div>
      </div>
    </div>
  )
}
