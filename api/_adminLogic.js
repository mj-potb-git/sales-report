// Shared admin (user-management) logic — used by the Vercel function
// (api/admin.js), the Express server (server.js), and the Vite dev middleware
// (vite.config.js). Runs SERVER-SIDE ONLY (needs the Supabase service key).
//
// Security: every request must carry the caller's Supabase access token
// (Authorization: Bearer <token>). We verify it and require the caller to be an
// admin before doing anything. Non-admins / anonymous get 401/403.

import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'

const VALID_ROLES = ['admin', 'sales', 'signup', 'marketing', 'aacio']
// Owner emails are always treated as admin (mirrors src/lib/roles.js bootstrap).
const OWNER_EMAILS = new Set(['mj.pamintuan@pinoyonlinebiz.com'])

// Generate a readable, strong-ish password (avoids ambiguous chars like O/0/l/1).
function genPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const b = randomBytes(12)
  let s = ''
  for (let i = 0; i < 12; i++) s += chars[b[i] % chars.length]
  return `POTB-${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`
}

export function createAdminHandler({ url, serviceKey }) {
  if (!url || !serviceKey) {
    // Return a handler that always reports misconfiguration (so callers see a
    // clear message instead of a crash).
    return async () => ({ status: 500, body: { error: 'Server not configured (missing SUPABASE_SERVICE_KEY / URL)' } })
  }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

  async function requireAdmin(authHeader) {
    const token = (authHeader || '').replace(/^Bearer\s+/i, '').trim()
    if (!token) return { ok: false, status: 401, error: 'Missing auth token' }
    const { data, error } = await admin.auth.getUser(token)
    const email = data?.user?.email
    if (error || !email) return { ok: false, status: 401, error: 'Invalid or expired session' }
    const { data: row } = await admin.from('user_roles').select('role').eq('email', email.toLowerCase()).maybeSingle()
    const role = row?.role || (OWNER_EMAILS.has(email.toLowerCase()) ? 'admin' : null)
    if (role !== 'admin') return { ok: false, status: 403, error: 'Admin access required' }
    return { ok: true, email: email.toLowerCase() }
  }

  return async function handle({ method, query = {}, body = {}, authHeader }) {
    const gate = await requireAdmin(authHeader)
    if (!gate.ok) return { status: gate.status, body: { error: gate.error } }

    try {
      // --- List users + roles ---
      if (method === 'GET') {
        const { data, error } = await admin
          .from('user_roles')
          .select('email, role, name, updated_at')
          .order('updated_at', { ascending: false })
        if (error) throw error
        return { status: 200, body: { users: data || [] } }
      }

      // --- Add user (create login + assign role + generate password) ---
      if (method === 'POST') {
        const email = String(body.email || '').trim().toLowerCase()
        const role  = String(body.role || '').trim().toLowerCase()
        const name  = body.name ? String(body.name).trim() : null
        if (!email || !role) return { status: 400, body: { error: 'email and role are required' } }
        if (!VALID_ROLES.includes(role)) return { status: 400, body: { error: `invalid role (valid: ${VALID_ROLES.join(', ')})` } }

        const password = genPassword()
        let created = true
        const { error: cErr } = await admin.auth.admin.createUser({
          email, password, email_confirm: true, user_metadata: name ? { name } : {},
        })
        if (cErr) {
          if (/already|registered|exists/i.test(cErr.message)) {
            // Existing account → reset its password instead
            created = false
            const { data: list } = await admin.auth.admin.listUsers()
            const u = list?.users?.find(x => x.email?.toLowerCase() === email)
            if (u) await admin.auth.admin.updateUserById(u.id, { password })
          } else {
            return { status: 400, body: { error: cErr.message } }
          }
        }
        const { error: rErr } = await admin.from('user_roles')
          .upsert({ email, role, name, updated_at: new Date().toISOString() }, { onConflict: 'email' })
        if (rErr) return { status: 500, body: { error: 'login created but role save failed: ' + rErr.message } }
        return { status: 200, body: { email, role, name, password, created } }
      }

      // --- Change a user's role ---
      if (method === 'PATCH') {
        const email = String(body.email || '').trim().toLowerCase()
        const role  = String(body.role || '').trim().toLowerCase()
        if (!email || !VALID_ROLES.includes(role)) return { status: 400, body: { error: 'valid email and role required' } }
        const { error } = await admin.from('user_roles')
          .upsert({ email, role, updated_at: new Date().toISOString() }, { onConflict: 'email' })
        if (error) throw error
        return { status: 200, body: { ok: true, email, role } }
      }

      // --- Remove a user (revoke login + role) ---
      if (method === 'DELETE') {
        const email = String(query.email || body.email || '').trim().toLowerCase()
        if (!email) return { status: 400, body: { error: 'email required' } }
        if (OWNER_EMAILS.has(email)) return { status: 400, body: { error: 'cannot remove the owner account' } }
        const { data: list } = await admin.auth.admin.listUsers()
        const u = list?.users?.find(x => x.email?.toLowerCase() === email)
        if (u) await admin.auth.admin.deleteUser(u.id)
        await admin.from('user_roles').delete().eq('email', email)
        return { status: 200, body: { ok: true } }
      }

      return { status: 405, body: { error: 'method not allowed' } }
    } catch (e) {
      return { status: 500, body: { error: e.message || 'server error' } }
    }
  }
}
