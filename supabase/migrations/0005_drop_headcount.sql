-- DocGrid: a shift is always one slot for one doctor. To run a shift with two
-- doctors, list the shift type twice (the Setup page has a Duplicate button),
-- so the per-shift "doctors needed" setting is no longer used. Safe to re-run.

alter table public.shift_types drop column if exists headcount;
