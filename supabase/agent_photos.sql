-- Agent photos for the TV Sales Achievement board (/tv).
-- Maps a sales agent's name (as it appears in the source data) to an uploaded
-- headshot so the TV leaderboard can show faces. Managed via the /tv/admin
-- upload screen (no code deploy needed to add/change a photo).
--
-- Run this once in the Supabase SQL editor for project qvufabzpwcbafutaalbw.

-- 1. The mapping table -------------------------------------------------------
create table if not exists public.agent_photos (
  -- normalized name key (lowercased, single-spaced) so lookups are stable
  name_key   text primary key,
  -- the display name exactly as shown in the source data
  name       text not null,
  -- which board the agent belongs to: 'acquisition' | 'officers' | 'aacio'
  source     text,
  -- public URL of the uploaded headshot in the agent-photos bucket
  photo_url  text,
  updated_at timestamptz not null default now()
);

alter table public.agent_photos enable row level security;

-- Internal kiosk tool → allow the publishable/anon key to read + manage rows.
-- (The board is only exposed on the office TV / internal Vercel URL.)
drop policy if exists "agent_photos read"  on public.agent_photos;
drop policy if exists "agent_photos write" on public.agent_photos;
create policy "agent_photos read"  on public.agent_photos
  for select using (true);
create policy "agent_photos write" on public.agent_photos
  for all using (true) with check (true);

-- 2. The storage bucket for the image files ----------------------------------
insert into storage.buckets (id, name, public)
values ('agent-photos', 'agent-photos', true)
on conflict (id) do update set public = true;

-- Public read + anon upload/replace within the agent-photos bucket.
drop policy if exists "agent-photos public read"   on storage.objects;
drop policy if exists "agent-photos anon write"     on storage.objects;
create policy "agent-photos public read" on storage.objects
  for select using (bucket_id = 'agent-photos');
create policy "agent-photos anon write" on storage.objects
  for all using (bucket_id = 'agent-photos') with check (bucket_id = 'agent-photos');
