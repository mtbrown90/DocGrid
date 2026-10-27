-- DocGrid: initial schema.
-- Run in the Supabase SQL editor (or `supabase db push`). Safe to re-run.

create extension if not exists btree_gist;

create table if not exists public.doctors (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) > 0),
  specialty  text not null default 'General',
  color      int  not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.shifts (
  id         uuid primary key default gen_random_uuid(),
  doctor_id  uuid not null references public.doctors (id) on delete cascade,
  shift_date date not null,
  start_time time not null,
  end_time   time not null,
  kind       text not null default 'clinic' check (kind in ('clinic', 'on-call', 'time-off')),
  location   text not null default '',
  notes      text not null default '',
  created_at timestamptz not null default now(),
  check (end_time > start_time),
  -- A doctor can never be in two places at once: the database rejects overlaps,
  -- so conflicts are caught even if two people save at the same moment.
  constraint shifts_no_overlap exclude using gist (
    doctor_id with =,
    tsrange(shift_date + start_time, shift_date + end_time) with &&
  )
);

create index if not exists shifts_date_idx on public.shifts (shift_date);

-- Row Level Security: only signed-in staff can read or change the schedule.
-- Turn OFF "Allow new users to sign up" in Supabase Auth settings and invite
-- staff instead, so "signed in" means "trusted staff member".
alter table public.doctors enable row level security;
alter table public.shifts  enable row level security;

drop policy if exists "staff manage doctors" on public.doctors;
create policy "staff manage doctors" on public.doctors
  for all to authenticated using (true) with check (true);

drop policy if exists "staff manage shifts" on public.shifts;
create policy "staff manage shifts" on public.shifts
  for all to authenticated using (true) with check (true);
