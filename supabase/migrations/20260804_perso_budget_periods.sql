alter table public.personal_categories
  add column if not exists budget_period text not null default 'monthly',
  add column if not exists budget_month date;

alter table public.personal_categories
  drop constraint if exists personal_categories_budget_period_check;

alter table public.personal_categories
  add constraint personal_categories_budget_period_check
  check (budget_period in ('monthly', 'specific_month'));

alter table public.personal_categories
  drop constraint if exists personal_categories_budget_month_check;

alter table public.personal_categories
  add constraint personal_categories_budget_month_check
  check (
    budget_period = 'monthly'
    or budget_month is not null
  );

comment on column public.personal_categories.budget_period is
  'monthly = budget répété chaque mois ; specific_month = budget appliqué uniquement au mois indiqué';

comment on column public.personal_categories.budget_month is
  'Premier jour du mois concerné lorsque budget_period = specific_month';
