create table if not exists public.personal_savings_budgets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.personal_accounts(id) on delete cascade,
  name text not null,
  kind text not null default 'project' check (kind in ('project','reserve')),
  allocation_mode text not null default 'amount' check (allocation_mode in ('amount','percent')),
  allocation_value numeric(14,2) not null check (allocation_value > 0),
  protection text not null default 'preserve' check (protection in ('free','preserve','untouchable')),
  allow_recovery boolean not null default false,
  critical_threshold numeric(14,2) not null default 0 check (critical_threshold >= 0),
  target_amount numeric(14,2),
  target_date date,
  priority integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists personal_savings_budgets_owner_idx on public.personal_savings_budgets(owner_id);
create index if not exists personal_savings_budgets_account_idx on public.personal_savings_budgets(account_id);

alter table public.personal_savings_budgets enable row level security;

drop policy if exists personal_savings_budgets_select_own on public.personal_savings_budgets;
create policy personal_savings_budgets_select_own on public.personal_savings_budgets for select using (auth.uid() = owner_id);
drop policy if exists personal_savings_budgets_insert_own on public.personal_savings_budgets;
create policy personal_savings_budgets_insert_own on public.personal_savings_budgets for insert with check (auth.uid() = owner_id);
drop policy if exists personal_savings_budgets_update_own on public.personal_savings_budgets;
create policy personal_savings_budgets_update_own on public.personal_savings_budgets for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
drop policy if exists personal_savings_budgets_delete_own on public.personal_savings_budgets;
create policy personal_savings_budgets_delete_own on public.personal_savings_budgets for delete using (auth.uid() = owner_id);
