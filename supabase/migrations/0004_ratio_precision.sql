-- DocGrid: allow ratios with up to 5 decimal places (e.g. 0.92345).
-- Existing values are kept as they are. Safe to re-run.

alter table public.shift_types alter column ratio type numeric(8,5);
alter table public.shifts      alter column ratio type numeric(8,5);
