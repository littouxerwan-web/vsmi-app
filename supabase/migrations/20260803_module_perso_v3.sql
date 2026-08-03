begin;

alter table public.personal_categories
  add column if not exists monthly_budget numeric(14,2) not null default 0 check (monthly_budget >= 0);

create table if not exists public.personal_recurrence_overrides (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  recurrence_id uuid not null references public.personal_recurrences(id) on delete cascade,
  occurrence_month date not null,
  amount numeric(14,2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(recurrence_id, occurrence_month)
);
create index if not exists personal_recurrence_overrides_owner_month_idx on public.personal_recurrence_overrides(owner_id, occurrence_month);
alter table public.personal_recurrence_overrides enable row level security;
drop policy if exists personal_recurrence_overrides_owner_all on public.personal_recurrence_overrides;
create policy personal_recurrence_overrides_owner_all on public.personal_recurrence_overrides for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
drop trigger if exists personal_recurrence_overrides_set_updated_at on public.personal_recurrence_overrides;
create trigger personal_recurrence_overrides_set_updated_at before update on public.personal_recurrence_overrides for each row execute function public.vsmi_personal_set_updated_at();

commit;
