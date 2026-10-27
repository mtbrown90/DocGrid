-- DocGrid: a Call shift can cover all locations (no specific location), and a
-- shift type whose start and end time are equal runs for 24 hours.
-- Safe to re-run.

alter table public.shift_types alter column location_id drop not null;

-- Superseded by migration 0007 (categories), which replaces is_call; skip this
-- step if 0007 has already been applied.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'shift_types' and column_name = 'is_call'
  ) then
    alter table public.shift_types drop constraint if exists shift_types_location_required;
    alter table public.shift_types add constraint shift_types_location_required
      check (location_id is not null or is_call);
  end if;
end $$;

-- Allow start = end (24 hours): drop the old "end_time <> start_time" check.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.shift_types'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%end_time <> start_time%'
  loop
    execute format('alter table public.shift_types drop constraint %I', c.conname);
  end loop;
end $$;
