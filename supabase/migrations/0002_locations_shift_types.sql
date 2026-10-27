-- DocGrid: locations, shift types (with ratio), richer doctor profile,
-- overnight-capable shifts. Safe to re-run.

-- Locations ------------------------------------------------------------------
create table if not exists public.locations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now()
);
create unique index if not exists locations_name_key on public.locations (lower(name));

-- Shift types: a named, reusable shift at a location. If end_time <= start_time
-- the shift runs overnight into the next day (e.g. 19:00 -> 07:00).
create table if not exists public.shift_types (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  location_id uuid not null references public.locations (id) on delete restrict,
  start_time  time not null,
  end_time    time not null,
  ratio       numeric(5,2) not null default 1 check (ratio >= 0),
  headcount   int not null default 1 check (headcount >= 0),
  is_night    boolean not null default false,
  is_call     boolean not null default false,
  created_at  timestamptz not null default now(),
  check (end_time <> start_time)
);

-- Doctors --------------------------------------------------------------------
alter table public.doctors
  add column if not exists employee_id   text,
  add column if not exists phone         text not null default '',
  add column if not exists email         text not null default '',
  add column if not exists address       text not null default '',
  add column if not exists is_nocturnist boolean not null default false;

create unique index if not exists doctors_employee_id_key
  on public.doctors (lower(employee_id))
  where employee_id is not null and employee_id <> '';

-- Shifts ---------------------------------------------------------------------
-- Drop the old same-day-only rules; they're replaced below.
alter table public.shifts drop constraint if exists shifts_no_overlap;
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.shifts'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%end_time > start_time%'
  loop
    execute format('alter table public.shifts drop constraint %I', c.conname);
  end loop;
end $$;

-- "clinic" / "on-call" are now properties of the shift type; a shift row is
-- either work or time off.
alter table public.shifts drop constraint if exists shifts_kind_check;
update public.shifts set kind = 'work' where kind in ('clinic', 'on-call');
alter table public.shifts alter column kind set default 'work';
alter table public.shifts add constraint shifts_kind_check check (kind in ('work', 'time-off'));

-- Each shift keeps a copy of its type's name/location/ratio so editing a shift
-- type later never rewrites history or past hours.
alter table public.shifts
  add column if not exists shift_type_id uuid references public.shift_types (id) on delete set null,
  add column if not exists location_id   uuid references public.locations (id) on delete set null,
  add column if not exists name          text not null default '',
  add column if not exists ratio         numeric(5,2) not null default 1 check (ratio >= 0);

-- Replaced by location_id (only held test data).
alter table public.shifts drop column if exists location;

alter table public.shifts
  add column if not exists starts_at timestamp
    generated always as (shift_date + start_time) stored;
alter table public.shifts
  add column if not exists ends_at timestamp
    generated always as (
      shift_date + end_time
      + case when end_time <= start_time then interval '1 day' else interval '0 day' end
    ) stored;

-- A doctor can never be in two places at once, including across midnight.
alter table public.shifts add constraint shifts_no_overlap exclude using gist (
  doctor_id with =,
  tsrange(starts_at, ends_at) with &&
);

-- Row Level Security ---------------------------------------------------------
alter table public.locations   enable row level security;
alter table public.shift_types enable row level security;

drop policy if exists "staff manage locations" on public.locations;
create policy "staff manage locations" on public.locations
  for all to authenticated using (true) with check (true);

drop policy if exists "staff manage shift types" on public.shift_types;
create policy "staff manage shift types" on public.shift_types
  for all to authenticated using (true) with check (true);
