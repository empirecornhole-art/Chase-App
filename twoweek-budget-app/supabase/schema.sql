-- ============================================================
-- Two-Week Budget — Supabase schema
-- Run this in the Supabase SQL editor (Project > SQL Editor > New query)
-- ============================================================

-- 1. Households: lets 2+ people share one budget view
create table if not exists households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Our Household',
  created_at timestamptz not null default now()
);

-- 2. Link auth users to a household
create table if not exists household_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  household_id uuid not null references households(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- 3. SimpleFIN connection — holds the access URL (contains embedded credentials).
--    Server-only. RLS is enabled with NO policies for regular users, so this
--    table is only reachable via the service-role key on the server.
create table if not exists simplefin_connections (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  access_url text not null,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  unique (household_id)
);

-- 4. Budget periods — you set the amount manually each 2-week period
create table if not exists budget_periods (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  amount numeric(10, 2) not null,
  created_by uuid references auth.users(id),
  heads_up_notified boolean not null default false,
  over_budget_notified boolean not null default false,
  created_at timestamptz not null default now(),
  unique (household_id, start_date)
);

-- 5. Transactions pulled from SimpleFIN (Chase card)
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  simplefin_id text not null,
  posted_at date not null,
  amount numeric(10, 2) not null, -- positive = spend, negative = refund/payment
  description text not null,
  merchant text,
  category text not null default 'Uncategorized',
  account_name text,
  pending boolean not null default false,
  excluded boolean not null default false,
  created_at timestamptz not null default now(),
  unique (household_id, simplefin_id)
);

-- 6. Category rules — keyword-based auto-categorization, editable by household
create table if not exists category_rules (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  keyword text not null,
  category text not null,
  created_at timestamptz not null default now(),
  unique (household_id, keyword)
);

-- 7. Per-category budgets — optional sub-budgets within a period
--    (e.g. Groceries: $400, Dining: $150), scoped to a specific budget period
create table if not exists category_budgets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  period_id uuid not null references budget_periods(id) on delete cascade,
  category text not null,
  amount numeric(10, 2) not null,
  created_at timestamptz not null default now(),
  unique (period_id, category)
);

-- 8. Push notification subscriptions — one row per phone/browser that has
--    enabled alerts, scoped to the individual user (not the household)
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table households enable row level security;
alter table household_members enable row level security;
alter table simplefin_connections enable row level security; -- no policies = server-only
alter table budget_periods enable row level security;
alter table transactions enable row level security;
alter table category_rules enable row level security;
alter table category_budgets enable row level security;
alter table push_subscriptions enable row level security;

-- Helper: is the current user a member of this household?
create or replace function is_household_member(hh_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from household_members
    where household_id = hh_id and user_id = auth.uid()
  );
$$;

create policy "members can view their household" on households
  for select using (is_household_member(id));
create policy "any signed-in user can create a household" on households
  for insert with check (auth.uid() is not null);

create policy "members can view household roster" on household_members
  for select using (is_household_member(household_id));
create policy "a user can add themself to a household" on household_members
  for insert with check (user_id = auth.uid());

create policy "members can view budget periods" on budget_periods
  for select using (is_household_member(household_id));
create policy "members can insert budget periods" on budget_periods
  for insert with check (is_household_member(household_id));
create policy "members can update budget periods" on budget_periods
  for update using (is_household_member(household_id));
create policy "members can delete budget periods" on budget_periods
  for delete using (is_household_member(household_id));

create policy "members can view transactions" on transactions
  for select using (is_household_member(household_id));
create policy "members can update transactions" on transactions
  for update using (is_household_member(household_id));

create policy "members can view category rules" on category_rules
  for select using (is_household_member(household_id));
create policy "members can manage category rules" on category_rules
  for all using (is_household_member(household_id))
  with check (is_household_member(household_id));

create policy "members can view category budgets" on category_budgets
  for select using (is_household_member(household_id));
create policy "members can manage category budgets" on category_budgets
  for all using (is_household_member(household_id))
  with check (is_household_member(household_id));

create policy "users manage their own push subscriptions" on push_subscriptions
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================
-- Starter category rules get inserted per-household after signup
-- (handled by app code — see lib/categorize.ts DEFAULT_RULES)
-- ============================================================
