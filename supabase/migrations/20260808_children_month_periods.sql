-- ENFANTS : passage d'une date précise à une période mensuelle.
alter table public.children_expenses
  add column if not exists start_month date,
  add column if not exists end_month date;

-- Conversion des anciennes dépenses : elles restent affectées à leur mois d'origine.
update public.children_expenses
set
  start_month = coalesce(start_month, date_trunc('month', expense_date)::date),
  end_month = coalesce(end_month, date_trunc('month', expense_date)::date)
where start_month is null or end_month is null;

alter table public.children_expenses
  alter column start_month set not null,
  alter column end_month set not null,
  alter column expense_date drop not null;

alter table public.children_expenses
  drop constraint if exists children_expenses_month_period_check;

alter table public.children_expenses
  add constraint children_expenses_month_period_check
  check (
    start_month = date_trunc('month', start_month)::date
    and end_month = date_trunc('month', end_month)::date
    and end_month >= start_month
  );

create index if not exists children_expenses_owner_period_idx
  on public.children_expenses(owner_id, start_month, end_month);


alter table public.children_expenses
  add column if not exists school_year_start integer;

update public.children_expenses
set school_year_start =
  case
    when extract(month from start_month) >= 9 then extract(year from start_month)::integer
    else (extract(year from start_month)::integer - 1)
  end
where school_year_start is null;

alter table public.children_expenses
  alter column school_year_start set not null;

create index if not exists children_expenses_owner_school_year_idx
  on public.children_expenses(owner_id, school_year_start);
