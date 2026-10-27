-- DocGrid: auto-generated schedules. Safe to re-run.
--
-- shifts.generated marks rows created by the generator so a draft can be
-- replaced or deleted without touching shifts entered by hand. Editing a
-- generated shift in the app clears the flag (the edit "locks" it in).

alter table public.shifts add column if not exists generated boolean not null default false;
create index if not exists shifts_generated_idx on public.shifts (shift_date) where generated;

-- Saves a generated schedule all-or-nothing: optionally clears the previously
-- generated shifts in the date range, then inserts the new rows. If any row
-- breaks the overlap rules the whole call is rolled back and nothing changes.
-- Rows are built by the app from the shift types: each element of p_rows has
-- doctor_id, shift_date, start_time, end_time, category, shift_type_id,
-- location_id (may be null), name, ratio.
create or replace function public.replace_generated_shifts(
  p_from    date,
  p_to      date,
  p_replace boolean,
  p_rows    jsonb
) returns int
language plpgsql
as $$
declare
  inserted int;
begin
  if p_replace then
    delete from public.shifts where generated and shift_date between p_from and p_to;
  end if;

  insert into public.shifts
    (doctor_id, shift_date, start_time, end_time, kind, category,
     shift_type_id, location_id, name, ratio, notes, generated)
  select
    (r->>'doctor_id')::uuid,
    (r->>'shift_date')::date,
    (r->>'start_time')::time,
    (r->>'end_time')::time,
    'work',
    r->>'category',
    (r->>'shift_type_id')::uuid,
    (r->>'location_id')::uuid,
    r->>'name',
    (r->>'ratio')::numeric,
    '',
    true
  from jsonb_array_elements(p_rows) as r;

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;
