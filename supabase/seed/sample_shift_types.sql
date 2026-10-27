-- DocGrid SAMPLE shift types (placeholders, not real). Not a migration: run it
-- once when you want starter data. Requires migrations through 0007.
-- Safe to re-run: it never creates a shift type that already exists.
--
-- For every existing location:
--   Day    07:00-19:00  ratio 1.00
--   Night  19:00-07:00  ratio 1.25  (night)
--   MDOC   07:00-07:00  ratio 0.50  (24 h, one per location)
-- For all locations (no specific location):
--   Call Day      06:00-20:00  ratio 0.25
--   Call Evening  12:00-00:00  ratio 0.25
--   Call Night    17:00-07:00  ratio 0.25  (night)
--   AOC           07:00-07:00  ratio 0.50  (24 h)
-- Edit the numbers on the Setup page afterwards.

-- Remove the single placeholder "Call" from the earlier sample, if it is there.
delete from public.shift_types where name = 'Call' and location_id is null;

insert into public.shift_types (name, location_id, start_time, end_time, ratio, is_night, category)
select s.name, l.id, s.start_time, s.end_time, s.ratio, s.is_night, s.category
from public.locations l
cross join (
  values
    ('Day',   time '07:00', time '19:00', 1.00::numeric, false, 'regular'),
    ('Night', time '19:00', time '07:00', 1.25::numeric, true,  'regular'),
    ('MDOC',  time '07:00', time '07:00', 0.50::numeric, false, 'mdoc')
) as s (name, start_time, end_time, ratio, is_night, category)
where not exists (
  select 1 from public.shift_types t where t.location_id = l.id and t.name = s.name
);

-- Locations that need 2 doctors on each shift list Day and Night a second time
-- (the same thing as the Duplicate button on the Setup page). The locations were
-- picked at random: North, Greer, Simpsonville, Easley need 2; the other four need 1.
-- MDOC stays a single listing. Call and AOC aren't duplicated.
insert into public.shift_types (name, location_id, start_time, end_time, ratio, is_night, category)
select s.name, l.id, s.start_time, s.end_time, s.ratio, s.is_night, s.category
from public.locations l
cross join (
  values
    ('Day (2)',   time '07:00', time '19:00', 1.00::numeric, false, 'regular'),
    ('Night (2)', time '19:00', time '07:00', 1.25::numeric, true,  'regular')
) as s (name, start_time, end_time, ratio, is_night, category)
where l.name in ('North', 'Greer', 'Simpsonville', 'Easley')
  and not exists (
    select 1 from public.shift_types t where t.location_id = l.id and t.name = s.name
  );

insert into public.shift_types (name, location_id, start_time, end_time, ratio, is_night, category)
select s.name, null, s.start_time, s.end_time, s.ratio, s.is_night, s.category
from (
  values
    ('Call Day',     time '06:00', time '20:00', 0.25::numeric, false, 'call'),
    ('Call Evening', time '12:00', time '00:00', 0.25::numeric, false, 'call'),
    ('Call Night',   time '17:00', time '07:00', 0.25::numeric, true,  'call'),
    ('AOC',          time '07:00', time '07:00', 0.50::numeric, false, 'aoc')
) as s (name, start_time, end_time, ratio, is_night, category)
where not exists (
  select 1 from public.shift_types t where t.location_id is null and t.name = s.name
);
