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

alter table public.registration_requests enable row level security;
alter table public.waitlist_entries enable row level security;

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
