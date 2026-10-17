-- Add columns for seasonal monthly curve, partner cost split, savings goals, and household split settings

alter table public.budget_items
  add column if not exists seasonal_amounts jsonb default null,
  add column if not exists cost_split text not null default 'shared' check (cost_split in ('shared', 'personal_a', 'personal_b')),
  add column if not exists target_amount numeric(12, 2) default null,
  add column if not exists current_saved numeric(12, 2) default 0;

alter table public.households
  add column if not exists partner_a_name text not null default 'Partner A',
  add column if not exists partner_b_name text not null default 'Partner B',
  add column if not exists split_mode text not null default 'proportional' check (split_mode in ('equal', 'proportional')),
  add column if not exists partner_a_income numeric(12, 2) not null default 25000,
  add column if not exists partner_b_income numeric(12, 2) not null default 25000;
