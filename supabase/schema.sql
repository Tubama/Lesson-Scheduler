create extension if not exists pgcrypto;
create extension if not exists btree_gist;

create table if not exists public.registration_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  term text not null check (term in ('school', 'summer')),
  family_type text not null check (family_type in ('returning', 'new')),
  access_code text,
  parent_name text not null,
  email text not null,
  student_name text not null,
  student_birthdate date,
  emergency_contact_name text,
  emergency_contact_phone text,
  lesson_length integer not null check (lesson_length in (30, 45, 60)),
  location text not null,
  first_choice text,
  second_choice text,
  third_choice text,
  policy_acknowledged boolean not null default false,
  signed_name text,
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
  student_birthdate date,
  emergency_contact_name text,
  emergency_contact_phone text,
  lesson_length integer not null check (lesson_length in (30, 45, 60)),
  location text not null,
  policy_acknowledged boolean not null default false,
  signed_name text,
  notes text,
  status text not null default 'waiting' check (status in ('waiting', 'invited', 'trial', 'closed'))
);

create table if not exists public.studio_admins (
  email text primary key,
  created_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
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

create table if not exists public.schedule_holds (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  request_id uuid references public.registration_requests(id) on delete cascade,
  term text not null check (term in ('school', 'summer')),
  location text not null,
  day_of_week text not null check (day_of_week in ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')),
  start_minutes integer not null check (start_minutes >= 0 and start_minutes < 1440),
  end_minutes integer not null check (end_minutes > 0 and end_minutes <= 1440),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'moved', 'waitlist')),
  active boolean not null default true,
  check (start_minutes < end_minutes)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'schedule_holds_no_overlap'
  ) then
    alter table public.schedule_holds
    add constraint schedule_holds_no_overlap
    exclude using gist (
      term with =,
      location with =,
      day_of_week with =,
      int4range(start_minutes, end_minutes, '[)') with &&
    )
    where (active);
  end if;
end;
$$;

insert into public.studio_admins (email)
values ('moorejacob22@yahoo.com')
on conflict (email) do nothing;

insert into public.app_settings (key, value)
values ('returning_access_code', 'FALL2026')
on conflict (key) do nothing;

create or replace function public.validate_returning_access_code(submitted_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  stored_code text;
begin
  select value
  into stored_code
  from public.app_settings
  where key = 'returning_access_code';

  return upper(trim(coalesce(submitted_code, ''))) = upper(trim(coalesce(stored_code, 'FALL2026')));
end;
$$;

grant execute on function public.validate_returning_access_code(text) to anon, authenticated;

alter table public.registration_requests
  add column if not exists student_birthdate date,
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_phone text,
  add column if not exists policy_acknowledged boolean not null default false,
  add column if not exists signed_name text;

alter table public.waitlist_entries
  add column if not exists student_birthdate date,
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_phone text,
  add column if not exists policy_acknowledged boolean not null default false,
  add column if not exists signed_name text;

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
alter table public.app_settings enable row level security;
alter table public.schedule_rules enable row level security;
alter table public.schedule_holds enable row level security;

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

drop policy if exists "Studio admins can read app settings" on public.app_settings;
create policy "Studio admins can read app settings"
on public.app_settings
for select
to authenticated
using (
  exists (
    select 1
    from public.studio_admins
    where studio_admins.email = auth.jwt() ->> 'email'
  )
);

drop policy if exists "Studio admins can create app settings" on public.app_settings;
create policy "Studio admins can create app settings"
on public.app_settings
for insert
to authenticated
with check (
  exists (
    select 1
    from public.studio_admins
    where studio_admins.email = auth.jwt() ->> 'email'
  )
);

drop policy if exists "Studio admins can update app settings" on public.app_settings;
create policy "Studio admins can update app settings"
on public.app_settings
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

drop policy if exists "Public can read active schedule rules" on public.schedule_rules;
create policy "Public can read active schedule rules"
on public.schedule_rules
for select
to anon, authenticated
using (active = true);

drop policy if exists "Public can read active schedule holds" on public.schedule_holds;
create policy "Public can read active schedule holds"
on public.schedule_holds
for select
to anon, authenticated
using (active = true);

drop policy if exists "Public can create pending schedule holds" on public.schedule_holds;
create policy "Public can create pending schedule holds"
on public.schedule_holds
for insert
to anon, authenticated
with check (
  active = true
  and status = 'pending'
  and start_minutes < end_minutes
);

drop policy if exists "Studio admins can read all schedule rules" on public.schedule_rules;
create policy "Studio admins can read all schedule rules"
on public.schedule_rules
for select
to authenticated
using (
  exists (
    select 1
    from public.studio_admins
    where studio_admins.email = auth.jwt() ->> 'email'
  )
);

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

drop policy if exists "Studio admins can delete schedule rules" on public.schedule_rules;
create policy "Studio admins can delete schedule rules"
on public.schedule_rules
for delete
to authenticated
using (
  exists (
    select 1
    from public.studio_admins
    where studio_admins.email = auth.jwt() ->> 'email'
  )
);

drop policy if exists "Studio admins can update schedule holds" on public.schedule_holds;
create policy "Studio admins can update schedule holds"
on public.schedule_holds
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
