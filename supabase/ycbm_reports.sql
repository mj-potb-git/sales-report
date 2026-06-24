-- Shared uploaded-YCBM-report store.
--
-- The YCBM v1 API can't fully paginate busy slots (>10 bookings at the exact
-- same start time can't be retrieved), so MJ uploads the exact YCBM CSV export.
-- Previously that report lived only in the uploader's browser localStorage —
-- which meant every viewer would have had to upload it themselves. This table
-- makes the report SHARED: MJ uploads once, all invited viewers read it.
--
-- One row per account ('acquisition' = POTB YCBM, 'aacio' = AACIO YCBM). The
-- whole accumulated, deduped booking set is stored as a single JSONB array.
--
-- Run this once in the Supabase SQL editor for project qvufabzpwcbafutaalbw.

create table if not exists public.ycbm_reports (
  account    text primary key,
  bookings   jsonb       not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.ycbm_reports enable row level security;

-- Invite-only internal dashboard using the anon/publishable key, matching the
-- existing booking_attendance / sales_records pattern: allow read + write to
-- all clients. (Tighten later with auth-scoped policies if needed.)
drop policy if exists "ycbm_reports_select" on public.ycbm_reports;
drop policy if exists "ycbm_reports_insert" on public.ycbm_reports;
drop policy if exists "ycbm_reports_update" on public.ycbm_reports;

create policy "ycbm_reports_select" on public.ycbm_reports
  for select using (true);
create policy "ycbm_reports_insert" on public.ycbm_reports
  for insert with check (true);
create policy "ycbm_reports_update" on public.ycbm_reports
  for update using (true) with check (true);
