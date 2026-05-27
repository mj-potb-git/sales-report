import { createClient } from '@supabase/supabase-js'
import { getSettings, subscribeSettings } from '../lib/settings'

let cached = null
let signature = ''

export function getSupabase() {
  const { supabaseUrl, supabaseKey } = getSettings()
  const sig = `${supabaseUrl}|${supabaseKey}`
  if (cached && sig === signature) return cached
  if (!supabaseUrl || !supabaseKey) {
    console.warn('[supabase] no URL/key configured — set them in Settings')
  }
  cached = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseKey || 'placeholder', {
    auth: { persistSession: false },
  })
  signature = sig
  return cached
}

// Invalidate the cached client when settings change so the next call rebuilds it
subscribeSettings(() => { cached = null; signature = '' })

// Backwards-compat for existing imports
export const supabase = new Proxy({}, {
  get(_, prop) {
    const client = getSupabase()
    const value = client[prop]
    return typeof value === 'function' ? value.bind(client) : value
  },
})
