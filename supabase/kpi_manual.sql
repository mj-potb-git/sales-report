-- Manual KPI inputs for the Acquisition Monthly Score Card (/kpi).
--
-- The scorecard auto-computes Show-up rate, Closing rate, and Adventurer
-- sign-ups from live YCBM + LakbayHub data. Only TWO fields are manual —
-- MJ types them per agent, per month:
--   • qa_score  — QA rating 0-100 (%)
--   • has_memo  — true = agent has a memo (0% on that KPI), false = no memo (5%)
--
-- Keyed by (agent_key, month) so each agent has one editable row per month.
-- agent_key = normalized agent name (lowercased, single-spaced), same nameKey()
-- convention used by agent_photos.
--
-- Run this once in the Supabase SQL editor for project qvufabzpwcbafutaalbw.

create table if not exists public.kpi_manual (
  -- normalized agent name key (matches nameKey() in the app)
  agent_key  text not null,
  -- calendar month this score covers, as 'YYYY-MM'
  month      text not null,
  -- QA score rating, 0-100 (manual input). null = not yet rated.
  qa_score   numeric,
  -- true = agent has a memo this month (scores 0% on the MEMO KPI);
  -- false / default = no memo (scores the full 5%).
  has_memo   boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (agent_key, month)
);

alter table public.kpi_manual enable row level security;

-- Internal tool → allow the publishable/anon key to read + manage rows.
drop policy if exists "kpi_manual read"  on public.kpi_manual;
drop policy if exists "kpi_manual write" on public.kpi_manual;
create policy "kpi_manual read"  on public.kpi_manual
  for select using (true);
create policy "kpi_manual write" on public.kpi_manual
  for all using (true) with check (true);
