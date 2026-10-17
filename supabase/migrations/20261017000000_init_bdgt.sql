-- ============================================================================
-- bdgt — Private Economy & Shared Household Budgeting Schema for Supabase
-- ============================================================================

create extension if not exists "pgcrypto";

-- 1. User Profiles (synced with auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  preferred_locale text not null default 'sv' check (preferred_locale in ('sv', 'en')),
  created_at timestamptz not null default now()
);

-- 2. Households (supports personal or shared partner/family economy)
create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  currency text not null default 'SEK',
  default_locale text not null default 'sv' check (default_locale in ('sv', 'en')),
  invite_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 3. Household Members
create table if not exists public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  member_email text,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  unique (household_id, user_id)
);

-- 4. Custom Budget Groups (Income, Expense categories, Savings)
create table if not exists public.budget_groups (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  kind text not null default 'expense' check (kind in ('income', 'expense', 'savings')),
  icon text not null default 'Receipt',
  color text not null default 'emerald',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- 5. Budget Items (Bills, Incomes, Variable multi-entry budgets)
create table if not exists public.budget_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  group_id uuid not null references public.budget_groups(id) on delete cascade,
  name text not null,
  entry_mode text not null default 'single_bill' check (entry_mode in ('single_bill', 'multi_entry')),
  expected_amount numeric(12, 2) not null default 0,
  recurrence_interval_months int not null default 1 check (recurrence_interval_months in (1, 2, 3, 4, 6, 12)),
  anchor_month int not null default 1 check (anchor_month between 1 and 12),
  coverage_months int not null default 1 check (coverage_months between 1 and 12),
  is_variable_estimate boolean not null default false,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- 6. Monthly Records (Expected vs Actual follow-up per YYYY-MM)
create table if not exists public.monthly_records (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  item_id uuid not null references public.budget_items(id) on delete cascade,
  year_month text not null check (year_month ~ '^\d{4}-\d{2}$'),
  expected_snapshot numeric(12, 2) not null default 0,
  actual_amount numeric(12, 2),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'skipped')),
  notes text,
  confirmed_by uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (item_id, year_month)
);

-- 7. Sub-Transactions for Multi-Entry items (e.g. Groceries partial logs)
create table if not exists public.record_transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  monthly_record_id uuid not null references public.monthly_records(id) on delete cascade,
  amount numeric(12, 2) not null,
  description text not null default '',
  spent_on date not null default current_date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- Helper Functions & Row-Level Security (RLS)
-- ============================================================================

create or replace function public.user_household_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select household_id
  from public.household_members
  where user_id = auth.uid();
$$;

-- Automatically create profile on user signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Join a household using an 8-character invite code
create or replace function public.join_household_by_code(p_invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household_id uuid;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select id into v_household_id
  from public.households
  where upper(invite_code) = upper(trim(p_invite_code))
  limit 1;

  if v_household_id is null then
    raise exception 'Invalid invite code';
  end if;

  select email into v_email from auth.users where id = auth.uid();

  insert into public.household_members (household_id, user_id, member_email, role)
  values (v_household_id, auth.uid(), v_email, 'member')
  on conflict (household_id, user_id) do nothing;

  return v_household_id;
end;
$$;

-- Enable RLS on all tables
alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.budget_groups enable row level security;
alter table public.budget_items enable row level security;
alter table public.monthly_records enable row level security;
alter table public.record_transactions enable row level security;

-- Profiles policies
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Households policies
create policy "Members can view their households"
  on public.households for select
  using (id in (select public.user_household_ids()) or created_by = auth.uid());

create policy "Authenticated users can create households"
  on public.households for insert
  with check (auth.uid() is not null);

create policy "Members can update their households"
  on public.households for update
  using (id in (select public.user_household_ids()));

-- Household members policies
create policy "Members can view household members"
  on public.household_members for select
  using (household_id in (select public.user_household_ids()) or user_id = auth.uid());

create policy "Users can add themselves as member"
  on public.household_members for insert
  with check (user_id = auth.uid());

create policy "Members can remove members"
  on public.household_members for delete
  using (household_id in (select public.user_household_ids()));

-- Budget groups policies
create policy "Members can manage budget groups"
  on public.budget_groups for all
  using (household_id in (select public.user_household_ids()))
  with check (household_id in (select public.user_household_ids()));

-- Budget items policies
create policy "Members can manage budget items"
  on public.budget_items for all
  using (household_id in (select public.user_household_ids()))
  with check (household_id in (select public.user_household_ids()));

-- Monthly records policies
create policy "Members can manage monthly records"
  on public.monthly_records for all
  using (household_id in (select public.user_household_ids()))
  with check (household_id in (select public.user_household_ids()));

-- Record transactions policies
create policy "Members can manage record transactions"
  on public.record_transactions for all
  using (household_id in (select public.user_household_ids()))
  with check (household_id in (select public.user_household_ids()));
