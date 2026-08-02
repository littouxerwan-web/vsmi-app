begin;

create table if not exists public.personal_savings_goals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id uuid not null references public.personal_accounts(id) on delete cascade,
  name text not null,
  target_amount numeric(14,2) not null check (target_amount > 0),
  target_date date not null,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists personal_savings_goals_owner_idx on public.personal_savings_goals(owner_id, is_active, target_date);
alter table public.personal_savings_goals enable row level security;
drop policy if exists personal_savings_goals_owner_all on public.personal_savings_goals;
create policy personal_savings_goals_owner_all on public.personal_savings_goals for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
drop trigger if exists personal_savings_goals_set_updated_at on public.personal_savings_goals;
create trigger personal_savings_goals_set_updated_at before update on public.personal_savings_goals for each row execute function public.vsmi_personal_set_updated_at();

commit;
