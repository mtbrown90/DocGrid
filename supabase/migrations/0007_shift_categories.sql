-- DocGrid: shift categories (regular / call / aoc / mdoc) and category-aware
-- overlap rules. Safe to re-run.
--
-- Overlap rules for one doctor:
--   * Nothing may overlap a Call or AOC shift (or time off).
--   * Same-kind shifts never overlap each other (two regulars, two MDOCs...).
--   * The single exception: a Regular shift MAY overlap an MDOC shift
--     (a doctor can work while being MDOC).
-- MDOC vs Call/AOC is blocked.

-- Shift types ------------------------------------------------------------------
alter table public.shift_types
  add column if not exists category text not null default 'regular'
  check (category in ('regular', 'call', 'aoc', 'mdoc'));

-- Carry over the old Call checkbox, if it is still there.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'shift_types' and column_name = 'is_call'
  ) then
    update public.shift_types set category = 'call' where is_call;
  end if;
end $$;

-- Call and AOC shifts may cover all locations (no specific location).
alter table public.shift_types drop constraint if exists shift_types_location_required;
alter table public.shift_types drop column if exists is_call;
alter table public.shift_types add constraint shift_types_location_required
  check (location_id is not null or category in ('call', 'aoc'));

-- Scheduled shifts keep a copy of their category -------------------------------
alter table public.shifts
  add column if not exists category text not null default 'regular'
  check (category in ('regular', 'call', 'aoc', 'mdoc', 'time-off'));

update public.shifts set category = 'time-off' where kind = 'time-off';
update public.shifts s set category = t.category
  from public.shift_types t
  where s.shift_type_id = t.id and s.kind = 'work';

-- Overlap rules ------------------------------------------------------------------
-- Two exclusion constraints whose combined blocked pairs are everything except
-- (regular, mdoc): A covers call/aoc/mdoc/time-off, B covers regular/call/aoc/time-off.
alter table public.shifts drop constraint if exists shifts_no_overlap;
alter table public.shifts drop constraint if exists shifts_no_overlap_a;
alter table public.shifts drop constraint if exists shifts_no_overlap_b;

alter table public.shifts add constraint shifts_no_overlap_a exclude using gist (
  doctor_id with =,
  tsrange(starts_at, ends_at) with &&
) where (category in ('call', 'aoc', 'mdoc', 'time-off'));

alter table public.shifts add constraint shifts_no_overlap_b exclude using gist (
  doctor_id with =,
  tsrange(starts_at, ends_at) with &&
) where (category in ('regular', 'call', 'aoc', 'time-off'));
