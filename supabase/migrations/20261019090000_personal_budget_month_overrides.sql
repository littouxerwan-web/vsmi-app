-- Prepared locally only. No production execution.
-- Independent of the Projection occurrence/savings migrations.
begin;
create table public.personal_budget_month_overrides (
  owner_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references public.personal_categories(id) on delete cascade,
  budget_month date not null check (extract(day from budget_month) = 1),
  amount numeric(14,2) not null check (amount >= 0 and amount <> 'NaN'::numeric),
  primary key (owner_id, category_id, budget_month)
);
create index personal_budget_month_overrides_category_idx
  on public.personal_budget_month_overrides(category_id);
alter table public.personal_budget_month_overrides enable row level security;
revoke all on public.personal_budget_month_overrides from public, anon;
grant select, insert, update, delete on public.personal_budget_month_overrides to authenticated;
create policy personal_budget_month_overrides_owner
  on public.personal_budget_month_overrides for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check (
    (select auth.uid()) = owner_id
    and exists (
      select 1 from public.personal_categories c
      where c.id = personal_budget_month_overrides.category_id and c.owner_id = (select auth.uid())
    )
  );
commit;
