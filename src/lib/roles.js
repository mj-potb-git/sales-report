// Role-based access control.
//
// Each user has a role (stored in public.user_roles, keyed by email). The role
// decides which dashboard tabs they can see. Tab ids must match TabNav.

import { getSupabase } from '../api/supabase'

// role -> allowed tab ids (must match the ids in components/TabNav.jsx)
export const ROLE_TABS = {
  admin:     ['insights', 'bookings', 'dashboard', 'sales', 'officers', 'aacio', 'users', 'settings'],
  sales:     ['officers'],
  signup:    ['bookings', 'sales'],
  marketing: ['dashboard'],
  aacio:     ['aacio'],
}

export const ROLE_LABELS = {
  admin:     'Admin',
  sales:     'Sales',
  signup:    'Sign-up',
  marketing: 'Marketing',
  aacio:     'AACIO',
}

// Owner bootstrap — these emails are always admin, even before the user_roles
// table exists / has rows. Prevents locking the owner out during setup.
const OWNER_EMAILS = new Set([
  'mj.pamintuan@pinoyonlinebiz.com',
])

/** Allowed tab ids for a role (empty array if the role is unknown). */
export function allowedTabsForRole(role) {
  return ROLE_TABS[role] || []
}

/**
 * Resolve a user's role by email from public.user_roles.
 * Returns the role string, or null if none is assigned / on error.
 */
export async function fetchRole(email) {
  if (!email) return null
  const lower = email.toLowerCase()
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
  // Owner bootstrap fallback (table missing, or no row yet)
  if (OWNER_EMAILS.has(lower)) return 'admin'
  return null
}
