-- Role-based access control
-- ----------------------------------------------------------------------------
-- Maps each user (by email) to a role. The dashboard reads the logged-in
-- user's role and shows only the tabs that role is allowed to see.
--
-- Roles & allowed tabs (see src/lib/roles.js for the source of truth):
--   admin     -> everything
--   sales     -> Officers
--   signup    -> Bookings + Sales
--   marketing -> Operations
--   aacio     -> AACIO
--
-- Run once in the Supabase SQL editor for project qvufabzpwcbafutaalbw.

create table if not exists public.user_roles (
  email      text primary key,   -- lowercase email of the auth user
  role       text not null,      -- 'admin' | 'sales' | 'signup' | 'marketing' | 'aacio'
  name       text,               -- optional display name
  updated_at timestamptz default now()
);

alter table public.user_roles enable row level security;

-- Authenticated users may read roles (so the app can resolve their own role).
drop policy if exists "user_roles_read" on public.user_roles;
create policy "user_roles_read"
  on public.user_roles for select
  using (true);

-- Writes happen via the service key (role-assign script) or the SQL editor,
-- so no public write policy is granted here.

-- Seed the owner as admin (edit if your email differs).
insert into public.user_roles (email, role, name)
values ('mj.pamintuan@pinoyonlinebiz.com', 'admin', 'MJ')
on conflict (email) do update set role = excluded.role;
