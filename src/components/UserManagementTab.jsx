// User Management (admin-only) — add people who can access the dashboard,
// assign their role, and auto-generate a password to hand them. Talks to the
// server-side /api/admin endpoint (which uses the Supabase service key) with
// the admin's own access token for authorization.

import { useState, useEffect, useCallback } from 'react'
import {
  UserPlus, Trash2, Copy, Check, RefreshCw, AlertCircle, ShieldCheck, Loader2, KeyRound,
} from 'lucide-react'
import { getAccessToken } from '../lib/auth'
import { ROLE_LABELS, ROLE_TABS } from '../lib/roles'

const TEAL = '#1B4F4F'
// Assignable roles — 'owner' is intentionally excluded: owners are defined in
// OWNER_EMAILS (lib/roles.js), not granted via this dropdown.
const ROLES = Object.keys(ROLE_LABELS).filter(r => r !== 'owner')

async function adminApi(method, payload) {
  const token = await getAccessToken()
  const res = await fetch('/api/admin', {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: method === 'GET' ? undefined : JSON.stringify(payload || {}),
  })
  let json = {}
  try { json = await res.json() } catch { /* ignore */ }
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`)
  return json
}

function tabsForRole(role) {
  const ids = ROLE_TABS[role] || []
  return ids.filter(t => t !== 'settings' && t !== 'users')
}

// Inline-editable name. Saves on blur or Enter, only when the value changed.
function NameCell({ value, onSave }) {
  const [val, setVal] = useState(value || '')
  useEffect(() => { setVal(value || '') }, [value])
  const commit = () => { const t = val.trim(); if (t !== (value || '')) onSave(t) }
  return (
    <input
      value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur() } if (e.key === 'Escape') { setVal(value || ''); e.currentTarget.blur() } }}
      placeholder="—"
      className="w-full max-w-[180px] rounded-lg border border-transparent hover:border-gray-200 focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15 px-2 py-1 text-sm outline-none bg-transparent"
    />
  )
}

export default function UserManagementTab() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // add form
  const [email, setEmail] = useState('')
  const [name, setName]   = useState('')
  const [role, setRole]   = useState('sales')
  const [busy, setBusy]   = useState(false)
  const [created, setCreated] = useState(null) // { email, role, password, created }
  const [copied, setCopied]   = useState(false)

  // No synchronous setState here — state is only updated after the await, so
  // calling this from an effect doesn't trigger a cascading render.
  const load = useCallback(async () => {
    try {
      const { users } = await adminApi('GET')
      setUsers(users || [])
      setError('')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const refresh = useCallback(() => { setLoading(true); load() }, [load])

  // Initial fetch — setState only inside async callbacks (not synchronously in
  // the effect body), guarded by `alive` to avoid setting state after unmount.
  useEffect(() => {
    let alive = true
    adminApi('GET')
      .then(({ users }) => { if (alive) { setUsers(users || []); setError('') } })
      .catch((e) => { if (alive) setError(e.message) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  async function handleAdd(e) {
    e.preventDefault()
    setError(''); setCreated(null); setCopied(false)
    if (!email.trim()) { setError('Email is required.'); return }
    setBusy(true)
    try {
      const result = await adminApi('POST', { email: email.trim(), name: name.trim(), role })
      setCreated(result)
      setEmail(''); setName('')
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function changeRole(userEmail, newRole) {
    setError('')
    try {
      await adminApi('PATCH', { email: userEmail, role: newRole })
      const now = new Date().toISOString()
      setUsers(us => us.map(u => u.email === userEmail ? { ...u, role: newRole, updated_at: now } : u))
    } catch (e) { setError(e.message) }
  }

  async function removeUser(userEmail) {
    if (!window.confirm(`Remove access for ${userEmail}? Hindi na sila makakapasok.`)) return
    setError('')
    try {
      await adminApi('DELETE', { email: userEmail })
      setUsers(us => us.filter(u => u.email !== userEmail))
    } catch (e) { setError(e.message) }
  }

  // Save an edited name (called on blur/Enter only when it actually changed).
  async function saveName(userEmail, newName) {
    setError('')
    try {
      await adminApi('PATCH', { email: userEmail, name: newName })
      const now = new Date().toISOString()
      setUsers(us => us.map(u => u.email === userEmail ? { ...u, name: newName, updated_at: now } : u))
    } catch (e) { setError(e.message) }
  }

  // Reset a user's password and surface the new one to hand over.
  async function resetPassword(userEmail) {
    if (!window.confirm(`Reset the password for ${userEmail}? Bibigyan ka ng bagong password na ipapasa sa kanya.`)) return
    setError(''); setCreated(null); setCopied(false)
    try {
      const role = users.find(u => u.email === userEmail)?.role
      const res = await adminApi('PATCH', { email: userEmail, resetPassword: true })
      setCreated({ email: userEmail, password: res.password, role, created: false })
    } catch (e) { setError(e.message) }
  }

  function copyCreds() {
    if (!created) return
    const text = `POTB Dashboard access\nEmail: ${created.email}\nPassword: ${created.password}\nRole: ${ROLE_LABELS[created.role] || created.role}`
    navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500) })
  }

  return (
    <div className="flex flex-col gap-5 max-w-5xl mx-auto w-full pb-24 sm:pb-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <ShieldCheck size={20} style={{ color: TEAL }} /> User Management
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Magdagdag ng makakapasok sa dashboard, i-assign ang role, at kumuha ng auto-generated na password.
        </p>
      </div>

      {/* Add user */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-3">
          <UserPlus size={16} style={{ color: TEAL }} /> Add user
        </h2>
        <form onSubmit={handleAdd} className="grid sm:grid-cols-[1.4fr_1fr_1fr_auto] gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="juan@gmail.com"
                   className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Name (optional)</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Juan Cruz"
                   className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Role</label>
            <select value={role} onChange={e => setRole(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-teal-600 bg-white">
              {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </div>
          <button type="submit" disabled={busy}
                  className="flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  style={{ backgroundColor: TEAL }}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />}
            Add
          </button>
        </form>
        <p className="text-[11px] text-gray-400 mt-2">
          Makikita ng <b>{ROLE_LABELS[role]}</b>: {tabsForRole(role).join(', ') || '—'}
          {role === 'admin' && ' (lahat ng tabs)'}
        </p>

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            <AlertCircle size={15} className="mt-0.5 flex-shrink-0" /> <span>{error}</span>
          </div>
        )}

        {created && (
          <div className="mt-3 rounded-xl bg-emerald-50 border border-emerald-200 p-4">
            <div className="flex items-center gap-2 text-emerald-800 font-semibold text-sm">
              <KeyRound size={15} /> {created.created ? 'Account created' : 'Account updated'} — ibigay ito sa kanya:
            </div>
            <div className="mt-2 grid sm:grid-cols-3 gap-2 text-sm">
              <div><span className="text-gray-500 text-xs">Email</span><div className="font-medium">{created.email}</div></div>
              <div><span className="text-gray-500 text-xs">Password</span><div className="font-mono font-semibold">{created.password}</div></div>
              <div><span className="text-gray-500 text-xs">Role</span><div className="font-medium">{ROLE_LABELS[created.role] || created.role}</div></div>
            </div>
            <button onClick={copyCreds}
                    className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                    style={{ backgroundColor: TEAL }}>
              {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied!' : 'Copy credentials'}
            </button>
            <p className="text-[11px] text-emerald-700/80 mt-2">
              ⚠️ Makikita lang ang password na ito ngayon — i-copy/ipasa agad. Pwede nilang palitan mamaya.
            </p>
          </div>
        )}
      </section>

      {/* Existing users */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">People with access ({users.length})</h2>
          <button onClick={refresh} className="text-gray-400 hover:text-gray-700" title="Refresh">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Email', 'Name', 'Role', 'Last login', ''].map(h => (
                  <th key={h} className="px-4 py-2 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400"><Loader2 className="inline animate-spin mr-2" size={15} />Loading…</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Wala pang users. Magdagdag sa taas.</td></tr>
              ) : users.map(u => (
                <tr key={u.email} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-gray-900 whitespace-nowrap">{u.email}</td>
                  <td className="px-4 py-2.5">
                    <NameCell value={u.name} onSave={(name) => saveName(u.email, name)} />
                  </td>
                  <td className="px-4 py-2.5">
                    <select value={u.role} onChange={e => changeRole(u.email, e.target.value)}
                            className="rounded-lg border border-gray-200 px-2 py-1 text-xs bg-white">
                      {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-2.5 text-xs whitespace-nowrap">
                    {u.lastSignInAt
                      ? <span className="text-gray-500">{new Date(u.lastSignInAt).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                      : <span className="text-gray-300 italic">Never logged in</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <button onClick={() => resetPassword(u.email)} title="Reset password"
                            className="text-gray-300 hover:text-teal-700 transition-colors mr-3 align-middle">
                      <KeyRound size={15} />
                    </button>
                    <button onClick={() => removeUser(u.email)} title="Remove access"
                            className="text-gray-300 hover:text-red-600 transition-colors align-middle">
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
