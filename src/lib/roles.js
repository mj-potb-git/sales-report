// Role-based access control.
//
// Each user has a role (stored in public.user_roles, keyed by email). The role
// decides which dashboard tabs they can see. Tab ids must match TabNav.

import { getSupabase } from '../api/supabase'

// role -> allowed tab ids (must match the ids in components/TabNav.jsx)
// NOTE: only 'owner' has the 'users' tab — owners are the ONLY ones who can
// manage users / grant access. Admins get everything else.
export const ROLE_TABS = {
  owner:     ['insights', 'bookings', 'orientation', 'dashboard', 'leadquality', 'sales', 'officers', 'aacio', 'ads', 'users', 'settings'],
  admin:     ['insights', 'bookings', 'orientation', 'dashboard', 'leadquality', 'sales', 'officers', 'aacio', 'ads', 'settings'],
  sales:     ['officers'],
  signup:    ['bookings', 'sales', 'aacio'],   // Sign-up Team: Bookings, Acquisition (id=sales), AACIO
  marketing: ['dashboard', 'leadquality', 'ads'],
  aacio:     ['aacio'],
}

export const ROLE_LABELS = {
  owner:     'Owner',
  admin:     'Admin',
  sales:     'Sales',
  signup:    'Sign-up Team',
  marketing: 'Marketing',
  aacio:     'AACIO',
}

// OWNERS — the only accounts that can see the Users tab and grant access.
// This is the source of truth for owners: an email here ALWAYS resolves to the
// 'owner' role, overriding whatever user_roles says (so owners can't be locked
// out or demoted from the UI). Not assignable via the Users tab dropdown.
export const OWNER_EMAILS = new Set([
  'mj.pamintuan@pinoyonlinebiz.com',
  'glady.bolosa@pinoyonlinebiz.com',
])

export const isOwner = (email) => !!email && OWNER_EMAILS.has(email.toLowerCase())

/** Allowed tab ids for a role (empty array if the role is unknown). */
export function allowedTabsForRole(role) {
  return ROLE_TABS[role] || []
}

/**
 * Resolve a user's role AND name by email from public.user_roles, so each
 * logged-in user is greeted by their OWN name (not a shared default). Owners
 * always resolve to the 'owner' role. Returns { role, name }.
 */
export async function fetchProfile(email) {
  if (!email) return { role: null, name: null }
  const lower = email.toLowerCase()
  let role = null, name = null
  try {
    const { data, error } = await getSupabase()
      .from('user_roles')
      .select('role, name')
      .eq('email', lower)
      .maybeSingle()
    if (error) throw error
    if (data) { role = data.role || null; name = data.name || null }
  } catch (err) {
    console.warn('[roles] fetchProfile failed:', err.message)
  }
  if (OWNER_EMAILS.has(lower)) role = 'owner'   // owners can't be demoted/locked out
  return { role, name }
}

/**
 * Resolve a user's role by email from public.user_roles.
 * Returns the role string, or null if none is assigned / on error.
 */
export async function fetchRole(email) {
  if (!email) return null
  const lower = email.toLowerCase()
  // Owners ALWAYS resolve to 'owner' — overrides any stored role so they keep
  // the Users tab and can't be demoted/locked out from the UI.
  if (OWNER_EMAILS.has(lower)) return 'owner'
  try {
    const { data, error } = await getSupabase()
      .from('user_roles')
      .select('role')
      .eq('email', lower)
      .maybeSingle()
    if (error) throw error
    if (data?.role) return data.role
  } catch (err) {
    console.warn('[roles] failed to resolve role:', err.message)
  }
  return null
}
