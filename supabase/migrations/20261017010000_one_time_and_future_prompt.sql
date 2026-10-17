-- Allow one-time (non-recurring) budget items with recurrence_interval_months = 0
-- and store which YYYY-MM a one-time item belongs to.

alter table public.budget_items
  drop constraint if exists budget_items_recurrence_interval_months_check;

alter table public.budget_items
  add constraint budget_items_recurrence_interval_months_check
  check (recurrence_interval_months in (0, 1, 2, 3, 4, 6, 12));

alter table public.budget_items
  add column if not exists one_time_year_month text check (one_time_year_month is null or one_time_year_month ~ '^\d{4}-\d{2}$');
