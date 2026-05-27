// Bulk-inserts mockSalesRecords into the Supabase sales_records table.
// Requires: SUPABASE_SERVICE_KEY (or VITE_SUPABASE_ANON_KEY w/ insert policy) in .env
// Run with:  node scripts/seed-supabase.mjs

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mockSalesRecords } from '../src/data/mockSalesData.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Lightweight .env loader (avoids adding the dotenv dep)
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

const supabase = createClient(url, key, { auth: { persistSession: false } })

console.log(`Seeding ${mockSalesRecords.length} rows into sales_records…`)

const BATCH = 200
let inserted = 0

for (let i = 0; i < mockSalesRecords.length; i += BATCH) {
  const batch = mockSalesRecords.slice(i, i + BATCH)
  const { error } = await supabase
    .from('sales_records')
    .upsert(batch, { onConflict: 'transaction_id' })
  if (error) {
    console.error(`Batch ${i / BATCH + 1} failed:`, error.message)
    process.exit(1)
  }
  inserted += batch.length
  console.log(`  inserted ${inserted}/${mockSalesRecords.length}`)
}

// Verify
const { count, error: countErr } = await supabase
  .from('sales_records')
  .select('*', { count: 'exact', head: true })

if (countErr) {
  console.error('Verification query failed:', countErr.message)
  process.exit(1)
}

console.log(`\nDone. Table now contains ${count} rows.`)
