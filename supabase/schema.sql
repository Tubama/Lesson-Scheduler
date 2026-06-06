create extension if not exists pgcrypto;

create table if not exists public.registration_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  term text not null check (term in ('school', 'summer')),
  family_type text not null check (family_type in ('returning', 'new')),
  access_code text,
  parent_name text not null,
  email text not null,
  student_name text not null,
  lesson_length integer not null check (lesson_length in (30, 45, 60)),
  location text not null,
  first_choice text,
  second_choice text,
  third_choice text,
  notes text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'moved', 'waitlist')),
  source text not null default 'public_registration'
);

create table if not exists public.waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  parent_name text not null,
  email text not null,
  student_name text not null,
  lesson_length integer not null check (lesson_length in (30, 45, 60)),
  location text not null,
  notes text,
  status text not null default 'waiting' check (status in ('waiting', 'invited', 'trial', 'closed'))
);

create table if not exists public.studio_admins (
  email text primary key,
  created_at timestamptz not null default now()
);

create table if not exists public.schedule_rules (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  term text not null check (term in ('school', 'summer')),
  location text not null,
  day_of_week text not null check (day_of_week in ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')),
  start_time time not null,
  end_time time not null,
  active boolean not null default true,
  check (start_time < end_time)
);

create unique index if not exists schedule_rules_unique_block
on public.schedule_rules (term, location, day_of_week, start_time, end_time, active);

insert into public.studio_admins (email)
values ('moorejacob22@yahoo.com')
on conflict (email) do nothing;

insert into public.schedule_rules (term, location, day_of_week, start_time, end_time)
values
  ('school', 'Vacaville', 'Monday', '15:00', '20:00'),
  ('school', 'Vacaville', 'Wednesday', '15:00', '20:00'),
  ('school', 'Vacaville', 'Friday', '15:00', '20:00'),
  ('school', 'Davis', 'Tuesday', '15:00', '20:45'),
  ('school', 'Davis', 'Thursday', '14:45', '20:00'),
  ('school', 'Davis', 'Saturday', '09:00', '14:45')
on conflict do nothing;

alter table public.registration_requests enable row level security;
alter table public.waitlist_entries enable row level security;
alter table public.studio_admins enable row level security;
alter table public.schedule_rules enable row level security;

drop policy if exists "Public can create registration requests" on public.registration_requests;
create policy "Public can create registration requests"
on public.registration_requests
for insert
to anon
with check (true);

drop policy if exists "Public can join waitlist" on public.waitlist_entries;
create policy "Public can join waitlist"
on public.waitlist_entries
for insert
to anon
with check (true);

drop policy if exists "Studio admins can read admin list" on public.studio_admins;
create policy "Studio admins can read admin list"
on public.studio_admins
for select
to authenticated
using (email = auth.jwt() ->> 'email');

drop policy if exists "Public can read active schedule rules" on public.schedule_rules;
create policy "Public can read active schedule rules"
on public.schedule_rules
for select
to anon, authenticated
using (active = true);

drop policy if exists "Studio admins can create schedule rules" on public.schedule_rules;
create policy "Studio admins can create schedule rules"
on public.schedule_rules
for insert
to authenticated
with check (
  exists (
    select 1
    from public.studio_admins
    where studio_admins.email = auth.jwt() ->> 'email'
  )
);

drop policy if exists "Studio admins can update schedule rules" on public.schedule_rules;
create policy "Studio admins can update schedule rules"
on public.schedule_rules
for update
to authenticated
using (
  exists (
    select 1
    from public.studio_admins
    where studio_admins.email = auth.jwt() ->> 'email'
  )
)
with check (
  exists (
    select 1
    from public.studio_admins
    where studio_admins.email = auth.jwt() ->> 'email'
  )
);

drop policy if exists "Studio admins can read registration requests" on public.registration_requests;
create policy "Studio admins can read registration requests"
on public.registration_requests
for select
to authenticated
using (
  exists (
    select 1
    from public.studio_admins
    where studio_admins.email = auth.jwt() ->> 'email'
  )
);

drop policy if exists "Studio admins can update registration requests" on public.registration_requests;
create policy "Studio admins can update registration requests"
on public.registration_requests
for update
to authenticated
using (
  exists (
    select 1
    from public.studio_admins
    where studio_admins.email = auth.jwt() ->> 'email'
  )
)
with check (
  exists (
    select 1
    from public.studio_admins
    where studio_admins.email = auth.jwt() ->> 'email'
  )
);

drop policy if exists "Studio admins can read waitlist entries" on public.waitlist_entries;
create policy "Studio admins can read waitlist entries"
on public.waitlist_entries
for select
to authenticated
using (
  exists (
    select 1
    from public.studio_admins
    where studio_admins.email = auth.jwt() ->> 'email'
  )
);

drop policy if exists "Studio admins can update waitlist entries" on public.waitlist_entries;
create policy "Studio admins can update waitlist entries"
on public.waitlist_entries
for update
to authenticated
using (
  exists (
    select 1
    from public.studio_admins
    where studio_admins.email = auth.jwt() ->> 'email'
  )
)
with check (
  exists (
    select 1
    from public.studio_admins
    where studio_admins.email = auth.jwt() ->> 'email'
  )
);
