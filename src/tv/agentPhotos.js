// Agent headshots for the TV Sales Achievement board.
//
// Photos live in the Supabase `agent-photos` storage bucket; the name→url
// mapping lives in the `agent_photos` table (see supabase/agent_photos.sql).
// Keyed by a NORMALIZED name so "Martin", " martin " and "Martin " all match.

import { getSupabase } from '../api/supabase'

const BUCKET = 'agent-photos'

// Normalize a source agent name into a stable lookup key.
export function nameKey(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

// Fetch the full name_key → { name, photo_url, source } map in one call.
export async function fetchPhotoMap() {
  try {
    const { data, error } = await getSupabase()
      .from('agent_photos')
      .select('name_key, name, photo_url, source')
    if (error) throw error
    const map = {}
    for (const row of data || []) map[row.name_key] = row
    return map
  } catch (err) {
    console.warn('[tv] fetchPhotoMap failed:', err.message)
    return {}
  }
}

// Upload (or replace) an agent's headshot and upsert the mapping row.
// Returns the public URL on success.
export async function uploadAgentPhoto(name, file, source = null) {
  const sb = getSupabase()
  const key = nameKey(name)
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const path = `${key.replace(/[^a-z0-9]+/g, '-')}.${ext}`

  const { error: upErr } = await sb.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, cacheControl: '3600', contentType: file.type })
  if (upErr) throw new Error(`Upload failed: ${upErr.message}`)

  const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path)
  // cache-bust so a replaced photo shows immediately on the TV
  const photo_url = `${pub.publicUrl}?v=${path.length}${key.length}`

  const { error: dbErr } = await sb
    .from('agent_photos')
    .upsert({ name_key: key, name, source, photo_url }, { onConflict: 'name_key' })
  if (dbErr) throw new Error(`Save failed: ${dbErr.message}`)

  return photo_url
}

// Remove an agent's photo mapping (leaves the file; harmless).
export async function removeAgentPhoto(name) {
  const { error } = await getSupabase()
    .from('agent_photos')
    .delete()
    .eq('name_key', nameKey(name))
  if (error) throw new Error(error.message)
}
