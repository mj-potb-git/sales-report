// Assign a dashboard role to a user (writes to public.user_roles).
//
// Usage:
//   node scripts/set-role.mjs <email> <role> [name]
// Roles: admin | sales | signup | marketing | aacio
// Example:
//   node scripts/set-role.mjs juan@gmail.com sales "Juan Dela Cruz"
//
// Requires SUPABASE_SERVICE_KEY + VITE_SUPABASE_URL in .env (server-side only).

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const VALID_ROLES = ['admin', 'sales', 'signup', 'marketing', 'aacio']

function loadEnv() {
  const env = {}
  try {
    for (const line of readFileSync(resolve(__dirname, '../.env'), 'utf8').split(/\r?\n/)) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const i = t.indexOf('=')
      if (i === -1) continue
      env[t.slice(0, i).trim()] = t.slice(i + 1).trim()
    }
  } catch {}
  return env
}

const env = { ...loadEnv(), ...process.env }
const url = env.VITE_SUPABASE_URL
const key = env.SUPABASE_SERVICE_KEY
if (!url || !key) { console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_KEY in .env'); process.exit(1) }

const email = (process.argv[2] || '').toLowerCase()
const role  = (process.argv[3] || '').toLowerCase()
const name  = process.argv[4] || null
if (!email || !role) { console.error('Usage: node scripts/set-role.mjs <email> <role> [name]'); process.exit(1) }
if (!VALID_ROLES.includes(role)) { console.error(`Invalid role "${role}". Valid: ${VALID_ROLES.join(', ')}`); process.exit(1) }

const supabase = createClient(url, key, { auth: { persistSession: false } })

const { error } = await supabase.from('user_roles').upsert(
  { email, role, name, updated_at: new Date().toISOString() },
  { onConflict: 'email' },
)
if (error) { console.error('Failed:', error.message); process.exit(1) }

console.log(`\n✅ ${email} → role "${role}"${name ? ` (${name})` : ''}`)
console.log('   They will see only the tabs allowed for this role on next login/refresh.')
