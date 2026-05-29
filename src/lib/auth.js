// Supabase Auth — email + password, invite-only access control.
//
// Access model (per MJ): per-person email invite. Public signup is OFF in the
// Supabase dashboard (Authentication → Providers → Email → "Allow new users to
// sign up" = disabled). To grant access: invite the person from
//   Supabase → Authentication → Users → Invite user
// They get a magic link, set a password, and can log in here. To revoke:
// delete the user in that same panel — access is cut immediately.
//
// We keep a DEDICATED auth client (separate from the attendance client in
// api/supabase.js, which runs with persistSession:false). Auth needs the
// session persisted + auto-refreshed, and a distinct storageKey avoids the
// "Multiple GoTrueClient instances" warning when both point at the same project.

import { createClient } from '@supabase/supabase-js'
import { getSettings, subscribeSettings } from './settings'

let cached = null
let signature = ''

function client() {
  const { supabaseUrl, supabaseKey } = getSettings()
  const sig = `${supabaseUrl}|${supabaseKey}`
  if (cached && sig === signature) return cached
  cached = createClient(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseKey || 'placeholder',
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,   // handles the invite / magic-link redirect
        storageKey: 'potb-dashboard-auth',
      },
    },
  )
  signature = sig
  return cached
}

// Rebuild the client if the user swaps Supabase credentials at runtime.
subscribeSettings(() => { cached = null; signature = '' })

/** Returns true if Supabase URL + key are configured (else auth can't work). */
export function isAuthConfigured() {
  const { supabaseUrl, supabaseKey } = getSettings()
  return Boolean(supabaseUrl && supabaseKey)
}

/** Current session (or null). Async — reads from storage + validates. */
export async function getSession() {
  const { data, error } = await client().auth.getSession()
  if (error) { console.warn('[auth] getSession failed:', error.message); return null }
  return data.session
}

/** Sign in with email + password. Throws on failure (caller shows the message). */
export async function signIn(email, password) {
  const { data, error } = await client().auth.signInWithPassword({
    email: email.trim(),
    password,
  })
  if (error) throw error
  return data.session
}

/** Send a password-reset email (for "Forgot password"). */
export async function sendPasswordReset(email) {
  const { error } = await client().auth.resetPasswordForEmail(email.trim(), {
    redirectTo: window.location.origin,
  })
  if (error) throw error
}

/** Sign out the current user. */
export async function signOut() {
  const { error } = await client().auth.signOut()
  if (error) console.warn('[auth] signOut failed:', error.message)
}

/**
 * Subscribe to auth state changes (login / logout / token refresh).
 * Calls handler(session) immediately is NOT done here — caller should fetch
 * the initial session via getSession(). Returns an unsubscribe function.
 */
export function onAuthChange(handler) {
  const { data } = client().auth.onAuthStateChange((_event, session) => {
    handler(session)
  })
  return () => data.subscription.unsubscribe()
}
