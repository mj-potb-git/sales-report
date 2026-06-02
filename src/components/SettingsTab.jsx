import { useState, useEffect } from 'react'
import {
  Eye, EyeOff, Save, RotateCcw, Copy, Check, ExternalLink,
  AlertTriangle, CheckCircle2, XCircle, Loader2,
} from 'lucide-react'
import { getSettings, saveSettings, resetOverrides } from '../lib/settings'
import { getSupabase } from '../api/supabase'
import MetaConnectionStatus from './sales/MetaConnectionStatus'

const PRIMARY = '#1B4F4F'

// eslint-disable-next-line no-unused-vars
function mask(value, visible = 6) {
  if (!value) return ''
  if (value.length <= visible * 2) return value
  return value.slice(0, visible) + '•'.repeat(Math.min(20, value.length - visible * 2)) + value.slice(-visible)
}

// Reusable form field with masked / show-toggle, save state, origin badge
function SecretField({ label, hint, value, onChange, originBadge, locked }) {
  const [reveal, setReveal] = useState(false)
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        {originBadge}
      </div>
      <div className="flex gap-2">
        <input
          type={reveal ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={locked}
          placeholder={locked ? 'Server-side only — edit .env to change' : 'Paste credential here…'}
          className={`flex-1 px-3 py-2 border rounded-xl text-sm font-mono transition-colors focus:outline-none ${
            locked
              ? 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed'
              : 'border-gray-200 focus:border-[#1B4F4F]'
          }`}
        />
        <button
          type="button"
          onClick={() => setReveal(r => !r)}
          disabled={locked || !value}
          aria-label={reveal ? 'Hide' : 'Show'}
          className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-40 transition-colors"
        >
          {reveal ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
      {hint && <p className="text-[11px] text-gray-500">{hint}</p>}
    </div>
  )
}

function OriginBadge({ origin }) {
  if (origin === 'override') {
    return <span className="text-[10px] uppercase font-bold tracking-wide px-2 py-0.5 rounded-md bg-teal-50 text-teal-700">override</span>
  }
  if (origin === 'env') {
    return <span className="text-[10px] uppercase font-bold tracking-wide px-2 py-0.5 rounded-md bg-gray-100 text-gray-500">from .env</span>
  }
  return <span className="text-[10px] uppercase font-bold tracking-wide px-2 py-0.5 rounded-md bg-amber-50 text-amber-700">empty</span>
}

function ServerOnlyBadge() {
  return <span className="text-[10px] uppercase font-bold tracking-wide px-2 py-0.5 rounded-md bg-purple-50 text-purple-700">server-side</span>
}

// ---------------------------------------------------------------------------

export default function SettingsTab() {
  const [settings, setSettings] = useState(getSettings())
  const [dirty, setDirty] = useState({ supabaseUrl: '', supabaseKey: '', monthlyTarget: '' })
  const [hasChanges, setHasChanges] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [copied, setCopied] = useState(false)
  const [testResult, setTestResult] = useState({ supabase: null }) // null | 'testing' | {ok, msg}

  useEffect(() => {
    setDirty({
      supabaseUrl: '', supabaseKey: '', monthlyTarget: '',
      userName: '', userRole: '', dashboardTitle: '', organizationName: '',
    })
    setHasChanges(false)
  }, [settings])

  const effective = {
    supabaseUrl:      dirty.supabaseUrl   || settings.supabaseUrl,
    supabaseKey:      dirty.supabaseKey   || settings.supabaseKey,
    monthlyTarget:    dirty.monthlyTarget || String(settings.monthlyTarget),
    userName:         dirty.userName      || settings.userName,
    userRole:         dirty.userRole      || settings.userRole,
    dashboardTitle:   dirty.dashboardTitle || settings.dashboardTitle,
    organizationName: dirty.organizationName || settings.organizationName,
  }

  function field(key, value) {
    setDirty(d => ({ ...d, [key]: value }))
    setHasChanges(true)
  }

  function save() {
    saveSettings(dirty)
    setSettings(getSettings())
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 1500)
  }

  function reset() {
    if (!confirm('Clear all overrides and fall back to .env values?')) return
    resetOverrides()
    setSettings(getSettings())
  }

  async function testSupabase() {
    setTestResult(r => ({ ...r, supabase: 'testing' }))
    // Save first so the test uses the latest values
    if (hasChanges) save()
    try {
      const { count, error } = await getSupabase()
        .from('sales_records')
        .select('*', { count: 'exact', head: true })
      if (error) throw error
      setTestResult(r => ({ ...r, supabase: { ok: true, msg: `Connected. ${count ?? 0} rows in sales_records.` } }))
    } catch (e) {
      setTestResult(r => ({ ...r, supabase: { ok: false, msg: e.message || String(e) } }))
    }
  }

  function copyAsEnv() {
    const lines = [
      '# Supabase (publishable key — safe to expose to the browser)',
      `VITE_SUPABASE_URL=${effective.supabaseUrl}`,
      `VITE_SUPABASE_ANON_KEY=${effective.supabaseKey}`,
      '',
      '# Server-side only — paste your secret key on the next line in your editor',
      'SUPABASE_SERVICE_KEY=',
      '',
      '# YouCanBook.me (server-side proxy)',
      'YCBM_ACCOUNT_ID=',
      'YCBM_API_KEY=',
    ].join('\n')
    navigator.clipboard.writeText(lines).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="flex flex-col gap-4 pb-24 sm:pb-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage API credentials. Browser-safe values can be edited here; server-side values live in <code className="px-1 py-0.5 bg-gray-100 rounded text-xs">.env</code>.
        </p>
      </div>

      {/* Personalization section */}
      <section className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex flex-col gap-4">
        <div>
          <h2 className="font-semibold text-gray-900">Personalization</h2>
          <p className="text-xs text-gray-500 mt-0.5">Header, greeting, and branding — yours.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Your name</label>
              <OriginBadge origin={settings._origin.userName} />
            </div>
            <input
              type="text" value={effective.userName} onChange={e => field('userName', e.target.value)}
              placeholder="MJ"
              className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#1B4F4F]" />
            <p className="text-[11px] text-gray-500">Shown sa header and greeting ("Magandang umaga, MJ").</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Your role</label>
              <OriginBadge origin={settings._origin.userRole} />
            </div>
            <input
              type="text" value={effective.userRole} onChange={e => field('userRole', e.target.value)}
              placeholder="General Manager"
              className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#1B4F4F]" />
            <p className="text-[11px] text-gray-500">e.g. Sales Manager, GM, Founder</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Dashboard title</label>
              <OriginBadge origin={settings._origin.dashboardTitle} />
            </div>
            <input
              type="text" value={effective.dashboardTitle} onChange={e => field('dashboardTitle', e.target.value)}
              placeholder="Operations Console"
              className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#1B4F4F]" />
            <p className="text-[11px] text-gray-500">Main heading sa top.</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Organization label</label>
              <OriginBadge origin={settings._origin.organizationName} />
            </div>
            <input
              type="text" value={effective.organizationName} onChange={e => field('organizationName', e.target.value)}
              placeholder="POTB · Pinoy Online Travel Biz"
              className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#1B4F4F]" />
            <p className="text-[11px] text-gray-500">Small uppercase line above the title.</p>
          </div>
        </div>

        <button
          onClick={save}
          disabled={!hasChanges}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed self-start"
          style={{ backgroundColor: PRIMARY }}
        >
          {savedFlash ? <><Check size={14} /> Saved</> : <><Save size={14} /> Save</>}
        </button>
      </section>

      {/* Business section — monthly target etc. */}
      <section className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex flex-col gap-4">
        <div>
          <h2 className="font-semibold text-gray-900">Business</h2>
          <p className="text-xs text-gray-500 mt-0.5">Targets & benchmarks used across the dashboard.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">Monthly Sales Target (₱)</label>
            <OriginBadge origin={settings._origin.monthlyTarget} />
          </div>
          <input
            type="number"
            min="0"
            step="10000"
            value={effective.monthlyTarget}
            onChange={e => field('monthlyTarget', e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#1B4F4F] transition-colors"
            placeholder="1000000"
          />
          <p className="text-[11px] text-gray-500">
            Drives the Monthly Target progress bar, pace projection, and Smart Insights. Default: ₱1,000,000.
          </p>
        </div>
        <button
          onClick={save}
          disabled={!hasChanges}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed self-start"
          style={{ backgroundColor: PRIMARY }}
        >
          {savedFlash ? <><Check size={14} /> Saved</> : <><Save size={14} /> Save</>}
        </button>
      </section>

      {/* Supabase section */}
      <section className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-gray-900">Supabase</h2>
            <p className="text-xs text-gray-500 mt-0.5">Powers the Sales Agents tab.</p>
          </div>
          <a
            href="https://supabase.com/dashboard/project/qvufabzpwcbafutaalbw/settings/api-keys"
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-[#1B4F4F] hover:underline whitespace-nowrap"
          >
            Open Supabase <ExternalLink size={11} />
          </a>
        </div>

        <SecretField
          label="Project URL"
          hint="e.g. https://your-ref.supabase.co"
          value={dirty.supabaseUrl || settings.supabaseUrl}
          onChange={v => field('supabaseUrl', v)}
          originBadge={<OriginBadge origin={settings._origin.supabaseUrl} />}
        />

        <SecretField
          label="Publishable key (anon)"
          hint="Browser-safe key. Use one starting with sb_publishable_ — never paste a secret key here."
          value={dirty.supabaseKey || settings.supabaseKey}
          onChange={v => field('supabaseKey', v)}
          originBadge={<OriginBadge origin={settings._origin.supabaseKey} />}
        />

        <SecretField
          label="Secret key (service_role)"
          hint="Stored only in .env. Used by scripts/seed-supabase.mjs. Never enter it in this form."
          value={''}
          onChange={() => {}}
          locked
          originBadge={<ServerOnlyBadge />}
        />

        <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-gray-100">
          <button
            onClick={save}
            disabled={!hasChanges}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: PRIMARY }}
          >
            {savedFlash ? <><Check size={14} /> Saved</> : <><Save size={14} /> Save</>}
          </button>
          <button
            onClick={testSupabase}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            {testResult.supabase === 'testing' ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            Test connection
          </button>
          <button
            onClick={reset}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-gray-500 hover:bg-gray-50 transition-colors"
          >
            <RotateCcw size={13} /> Reset overrides
          </button>
        </div>

        {testResult.supabase && testResult.supabase !== 'testing' && (
          <div className={`flex items-start gap-2 p-3 rounded-xl text-sm ${
            testResult.supabase.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
          }`}>
            {testResult.supabase.ok ? <CheckCircle2 size={16} className="mt-0.5" /> : <XCircle size={16} className="mt-0.5" />}
            <span className="break-all">{testResult.supabase.msg}</span>
          </div>
        )}
      </section>

      {/* Meta Ads connection status */}
      <MetaConnectionStatus />

      {/* YouCanBook.me section */}
      <section className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-gray-900">YouCanBook.me</h2>
            <p className="text-xs text-gray-500 mt-0.5">Powers the Bookings & Dashboard tabs.</p>
          </div>
          <a
            href="https://app.youcanbook.me/#/account/security"
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-[#1B4F4F] hover:underline whitespace-nowrap"
          >
            Open YCBM <ExternalLink size={11} />
          </a>
        </div>

        <SecretField
          label="Account ID"
          hint="Server-side only — edit YCBM_ACCOUNT_ID in .env, then restart `npm run dev`."
          value=""
          onChange={() => {}}
          locked
          originBadge={<ServerOnlyBadge />}
        />

        <SecretField
          label="API Key"
          hint="Server-side only — edit YCBM_API_KEY in .env, then restart `npm run dev`."
          value=""
          onChange={() => {}}
          locked
          originBadge={<ServerOnlyBadge />}
        />

        <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-xl text-xs text-amber-800">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
          <span>
            The YCBM API key proxies through the Vite dev server (so it never reaches the browser).
            Changes to <code className="px-1 bg-amber-100 rounded">.env</code> only take effect after a server restart.
          </span>
        </div>
      </section>

      {/* Export helper */}
      <section className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex flex-col gap-3">
        <div>
          <h2 className="font-semibold text-gray-900">Export current values as .env</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Copies a ready-to-paste <code className="px-1 bg-gray-100 rounded">.env</code> template to your clipboard with the current browser overrides pre-filled. Paste secret keys yourself in your editor.
          </p>
        </div>
        <button
          onClick={copyAsEnv}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border border-gray-200 hover:bg-gray-50 transition-colors self-start"
        >
          {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy .env template</>}
        </button>
      </section>

      {/* Security reminder */}
      <section className="bg-red-50 border border-red-100 rounded-2xl p-4 text-sm text-red-800 flex items-start gap-2">
        <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
        <div className="flex flex-col gap-1">
          <p className="font-semibold">Never paste secret keys in chat, email, screenshots, or commits.</p>
          <p className="text-xs text-red-700/80">
            Secret keys (those starting with <code className="px-1 bg-red-100 rounded">sb_secret_</code>) bypass Row-Level Security. Always rotate at the source if one leaks.
          </p>
        </div>
      </section>
    </div>
  )
}
