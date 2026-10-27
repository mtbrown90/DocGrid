-- DocGrid: each doctor's preferred share of shifts per location (percent).
-- A doctor's percentages should add up to 100; the app enforces that.
-- Safe to re-run.

create table if not exists public.doctor_location_prefs (
  doctor_id   uuid not null references public.doctors (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  percent     numeric(5,2) not null check (percent >= 0 and percent <= 100),
  primary key (doctor_id, location_id)
);

alter table public.doctor_location_prefs enable row level security;

drop policy if exists "staff manage location prefs" on public.doctor_location_prefs;
create policy "staff manage location prefs" on public.doctor_location_prefs
  for all to authenticated using (true) with check (true);
