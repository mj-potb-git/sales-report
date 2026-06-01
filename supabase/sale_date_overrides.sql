-- Sale Date Corrections
-- ----------------------------------------------------------------------------
-- LakbayHub records a sale's date as `date_paid` (when the payment was POSTED).
-- Manual payments are often posted late, so a deal that actually closed (say)
-- on May 30 can land in June and distort the by-date sales report.
--
-- This table lets the manager re-date a specific sale to its TRUE close date.
-- All reports prefer the corrected date when one exists. Keyed by a stable
-- composite of the record (lead identity + original date + amount) since
-- LakbayHub has no stable per-row id.
--
-- Run this once in the Supabase SQL editor for project qvufabzpwcbafutaalbw.

create table if not exists public.sale_date_overrides (
  record_key     text primary key,         -- `${email|name}__${originalDate}__${amount}`
  effective_date date not null,             -- the corrected (true) sale date
  original_date  date,                      -- the LakbayHub date_paid we replaced
  note           text,                      -- optional reason, e.g. "manual GCash, posted late"
  updated_at     timestamptz default now()
);

-- Same access model as booking_attendance: the browser uses the publishable
-- (anon) key, so allow read/write under RLS. Tighten later when auth roles land.
alter table public.sale_date_overrides enable row level security;

drop policy if exists "sale_date_overrides_all" on public.sale_date_overrides;
create policy "sale_date_overrides_all"
  on public.sale_date_overrides
  for all
  using (true)
  with check (true);
