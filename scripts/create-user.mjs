// One-off: create (or update) a dashboard user with the Supabase Admin API.
// Auto-confirms the email so the person can sign in immediately.
//
// Usage:
//   node scripts/create-user.mjs <email> <password>
// Example:
//   node scripts/create-user.mjs mj.pamintuan@pinoyonlinebiz.com 'POTBdashboard2026!'
//
// Requires SUPABASE_SERVICE_KEY + VITE_SUPABASE_URL in .env (server-side only).

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadEnv() {
  const envPath = resolve(__dirname, '../.env')
  const env = {}
  try {
    for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
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

if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_KEY in .env')
  process.exit(1)
}

const email    = process.argv[2]
const password = process.argv[3]
if (!email || !password) {
  console.error('Usage: node scripts/create-user.mjs <email> <password>')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })

console.log(`Creating user ${email}…`)

const { data, error } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,                       // auto-confirm — no email step
  user_metadata: { role: 'owner' },
})

if (error) {
  // If the user already exists, update their password instead.
  if (/already.*registered|exists/i.test(error.message)) {
    console.log('User already exists — updating password instead…')
    const { data: list } = await supabase.auth.admin.listUsers()
    const existing = list?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase())
    if (!existing) { console.error('Could not locate existing user.'); process.exit(1) }
    const { error: updErr } = await supabase.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
    })
    if (updErr) { console.error('Update failed:', updErr.message); process.exit(1) }
    console.log(`\n✅ Password updated for ${email}`)
    process.exit(0)
  }
  console.error('Create failed:', error.message)
  process.exit(1)
}

console.log(`\n✅ User created: ${data.user.email} (id: ${data.user.id})`)
console.log('   You can now sign in on the dashboard with this email + password.')
