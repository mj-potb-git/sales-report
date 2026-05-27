-- Booking attendance table for cross-device, multi-user attendance tracking.
-- Replaces the per-browser localStorage approach.
--
-- Paste this into Supabase SQL Editor and click Run, once.
-- https://supabase.com/dashboard/project/qvufabzpwcbafutaalbw/sql/new

drop table if exists public.booking_attendance;

create table public.booking_attendance (
  booking_id text primary key,
  status     text not null check (status in ('showed','no_show')),
  noted_at   timestamptz not null default now(),
  note       text
);

create index booking_attendance_status_idx on public.booking_attendance (status);
create index booking_attendance_noted_idx  on public.booking_attendance (noted_at);

-- Enable Row Level Security
alter table public.booking_attendance enable row level security;

-- Allow the publishable (anon) key to read, insert, update, delete.
-- This is acceptable for an internal ops dashboard. For wider distribution,
-- restrict to `authenticated` only and add user-based policies.
drop policy if exists "attendance_read"   on public.booking_attendance;
drop policy if exists "attendance_insert" on public.booking_attendance;
drop policy if exists "attendance_update" on public.booking_attendance;
drop policy if exists "attendance_delete" on public.booking_attendance;

create policy "attendance_read"   on public.booking_attendance for select to anon, authenticated using (true);
create policy "attendance_insert" on public.booking_attendance for insert to anon, authenticated with check (true);
create policy "attendance_update" on public.booking_attendance for update to anon, authenticated using (true);
create policy "attendance_delete" on public.booking_attendance for delete to anon, authenticated using (true);
