-- DocGrid: which location a doctor is MDOC for, and whether they can be AOC.
-- Call shifts need no setting: any doctor can cover Call. Safe to re-run.

alter table public.doctors
  add column if not exists mdoc_location_id uuid references public.locations (id) on delete set null,
  add column if not exists can_aoc          boolean not null default false;
