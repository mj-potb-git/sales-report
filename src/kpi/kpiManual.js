// Manual KPI inputs (QA score + memo) for the Acquisition Score Card.
//
// Everything else on the scorecard is auto-computed from YCBM + LakbayHub.
// These two fields are the only things MJ types by hand, so they persist in
// Supabase (public.kpi_manual, see supabase/kpi_manual.sql) keyed by
// (agent_key, month) — that way the input syncs across every device that
// opens /kpi.

import { getSupabase } from '../api/supabase'

// Normalized agent name → stable lookup key (same convention as agent_photos).
export function nameKey(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

// Fetch the agent_key → { qa_score, has_memo } map for one month ('YYYY-MM').
export async function fetchKpiManual(month) {
  try {
    const { data, error } = await getSupabase()
      .from('kpi_manual')
      .select('agent_key, month, qa_score, has_memo')
      .eq('month', month)
    if (error) throw error
    const map = {}
    for (const row of data || []) map[row.agent_key] = row
    return map
  } catch (err) {
    console.warn('[kpi] fetchKpiManual failed:', err.message)
    return {}
  }
}

// Upsert one agent's manual inputs for a month. `patch` may carry qa_score
// and/or has_memo.
export async function saveKpiManual(agentKey, month, patch) {
  const sb = getSupabase()
  // Merge onto the existing row so setting QA doesn't wipe memo (and vice versa).
  const { data: existing } = await sb
    .from('kpi_manual')
    .select('qa_score, has_memo')
    .eq('agent_key', agentKey)
    .eq('month', month)
    .maybeSingle()

  const row = {
    agent_key: agentKey,
    month,
    qa_score: patch.qa_score !== undefined ? patch.qa_score : (existing?.qa_score ?? null),
    has_memo: patch.has_memo !== undefined ? patch.has_memo : (existing?.has_memo ?? false),
    updated_at: new Date().toISOString(),
  }
  const { error } = await sb
    .from('kpi_manual')
    .upsert(row, { onConflict: 'agent_key,month' })
  if (error) throw new Error(error.message)
  return row
}
