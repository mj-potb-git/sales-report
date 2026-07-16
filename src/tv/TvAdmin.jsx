// Photo manager for the TV Sales Achievement board.
// Reachable at /tv/admin. Lists every agent found in the live data and lets
// you upload a headshot per person. Photos go to Supabase storage and appear
// on the TV within ~1 minute (no deploy needed).

import { useEffect, useMemo, useRef, useState } from 'react'
import { UploadCloud, Check, Loader2, Search, ArrowLeft, Trash2, Lock, LogOut } from 'lucide-react'
import useTvData, { SOURCE_LABELS } from './useTvData'
import { uploadAgentPhoto, removeAgentPhoto, nameKey } from './agentPhotos'
import { getSession, onAuthChange, signIn, signOut } from '../lib/auth'
import { fetchRole, isOwner } from '../lib/roles'

const SOURCE_COLORS = {
  acquisition: '#1CA9D6',
  officers:    '#F5A623',
  aacio:       '#7C5CFC',
}

function AgentRow({ agent, photoUrl, onUploaded, onRemoved }) {
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState(null)

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true); setErr(null); setDone(false)
    try {
      const url = await uploadAgentPhoto(agent.name, file, agent.source)
      onUploaded(agent.name, url)
      setDone(true); setTimeout(() => setDone(false), 2000)
    } catch (e2) {
      setErr(e2.message)
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function handleRemove() {
    if (!confirm(`Remove photo for ${agent.name}?`)) return
    setBusy(true); setErr(null)
    try { await removeAgentPhoto(agent.name); onRemoved(agent.name) }
    catch (e2) { setErr(e2.message) }
    finally { setBusy(false) }
  }

  const initials = agent.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const color = SOURCE_COLORS[agent.source] || '#64748b'

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-white">
      <div className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center shrink-0 text-white font-bold"
           style={{ backgroundColor: color }}>
        {photoUrl
          ? <img src={photoUrl} alt={agent.name} className="w-full h-full object-cover" />
          : initials}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-gray-900 truncate">{agent.name}</p>
        <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color }}>
          {SOURCE_LABELS[agent.source] || agent.source}
        </span>
        {err && <p className="text-xs text-red-600 mt-0.5">{err}</p>}
      </div>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={handleFile} />
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
          style={{ backgroundColor: '#1B4F4F' }}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" />
                : done ? <Check className="w-4 h-4" />
                : <UploadCloud className="w-4 h-4" />}
          {photoUrl ? 'Replace' : 'Upload'}
        </button>
        {photoUrl && (
          <button onClick={handleRemove} disabled={busy}
                  className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"
                  title="Remove photo">
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  )
}

// ── Login gate ───────────────────────────────────────────────────────────
// The board (/tv) is open so the TV can just display it. Uploading photos is
// owner/admin-only — MJ logs in with the SAME dashboard credentials here.

function LoginScreen({ onSignedIn }) {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setErr(null)
    try { await signIn(email, pw); onSignedIn() }
    catch (e2) { setErr(e2.message || 'Login failed'); setBusy(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: '#F4F8F8' }}>
      <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: '#E3F3F1' }}>
          <Lock className="w-6 h-6" style={{ color: '#1B4F4F' }} />
        </div>
        <h1 className="text-lg font-bold text-center" style={{ color: '#1B4F4F' }}>Agent Photos — Owner login</h1>
        <p className="text-sm text-gray-500 text-center mt-1 mb-5">Log in with your dashboard account.</p>
        {err && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-2 mb-3">{err}</p>}
        <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@pinoyonlinebiz.com"
               className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm mb-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500/30" />
        <input type="password" required value={pw} onChange={e => setPw(e.target.value)} placeholder="Password"
               className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-teal-500/30" />
        <button type="submit" disabled={busy}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
                style={{ backgroundColor: '#1B4F4F' }}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />} Log in
        </button>
      </form>
    </div>
  )
}

export default function TvAdmin() {
  // 'checking' | null (logged out) | session object
  const [session, setSession] = useState('checking')
  const [role, setRole] = useState('loading')

  useEffect(() => {
    let alive = true
    getSession().then(s => { if (alive) setSession(s) })
    const off = onAuthChange(s => setSession(s))
    return () => { alive = false; off() }
  }, [])

  const email = session && session !== 'checking' ? session.user?.email : null
  useEffect(() => {
    if (!email) return
    let alive = true
    fetchRole(email).then(r => { if (alive) setRole(r) })
    return () => { alive = false }
  }, [email])

  if (session === 'checking') {
    return <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F4F8F8' }}>
      <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#1CA9D6' }} /></div>
  }
  if (!session) return <LoginScreen onSignedIn={() => getSession().then(setSession)} />

  const canUpload = isOwner(email) || role === 'owner' || role === 'admin'
  if (role === 'loading') {
    return <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F4F8F8' }}>
      <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#1CA9D6' }} /></div>
  }
  if (!canUpload) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: '#F4F8F8' }}>
        <div className="max-w-sm w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
          <h1 className="text-lg font-bold" style={{ color: '#1B4F4F' }}>No access</h1>
          <p className="text-sm text-gray-500 mt-2">You're logged in as <b>{email}</b>, but only owner/admin accounts can upload.</p>
          <button onClick={signOut} className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: '#1B4F4F' }}>
            <LogOut className="w-4 h-4" /> Log out
          </button>
        </div>
      </div>
    )
  }
  return <TvAdminInner email={email} />
}

function TvAdminInner() {
  const { knownAgents, photoMap, loading } = useTvData()
  const [overrides, setOverrides] = useState({}) // name_key → url (optimistic)
  const [q, setQ] = useState('')

  const urlFor = (name) => {
    const k = nameKey(name)
    if (k in overrides) return overrides[k]
    return photoMap[k]?.photo_url || null
  }

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return knownAgents
    return knownAgents.filter(a => a.name.toLowerCase().includes(term))
  }, [knownAgents, q])

  const withPhoto = filtered.filter(a => urlFor(a.name)).length

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <a href="/tv" className="p-2 rounded-lg text-gray-500 hover:bg-gray-100" title="Back to TV board">
            <ArrowLeft className="w-5 h-5" />
          </a>
          <div className="flex-1">
            <h1 className="text-lg font-bold" style={{ color: '#1B4F4F' }}>Agent Photos</h1>
            <p className="text-xs text-gray-500">
              {withPhoto}/{filtered.length} with photo · shows on the TV within ~1 min
            </p>
          </div>
          <button onClick={signOut} title="Log out"
                  className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
        <div className="max-w-3xl mx-auto px-4 pb-3">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={q} onChange={e => setQ(e.target.value)}
              placeholder="Search agent..."
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30"
            />
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-5 flex flex-col gap-2.5">
        {loading && knownAgents.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-16 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" /> Loading agents...
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-gray-400 py-16 text-sm">No agents found.</p>
        ) : (
          filtered.map(a => (
            <AgentRow
              key={`${a.source}:${a.name}`}
              agent={a}
              photoUrl={urlFor(a.name)}
              onUploaded={(name, url) => setOverrides(o => ({ ...o, [nameKey(name)]: url }))}
              onRemoved={(name) => setOverrides(o => ({ ...o, [nameKey(name)]: null }))}
            />
          ))
        )}
      </main>
    </div>
  )
}
