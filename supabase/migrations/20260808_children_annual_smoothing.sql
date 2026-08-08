-- ENFANTS : montant annuel + lissage sur 12 mois
alter table public.children_expenses
  add column if not exists annual_amount numeric(14,2),
  add column if not exists smooth_annual boolean not null default false;

-- On repart sur l'exercice 2026-2027 uniquement.
delete from public.children_expenses
where school_year_start is distinct from 2026;

-- Les lignes 2026-2027 éventuellement présentes conservent leur total actuel.
update public.children_expenses
set annual_amount =
  round(
    amount * (
      (extract(year from end_month)::integer - extract(year from start_month)::integer) * 12
      + (extract(month from end_month)::integer - extract(month from start_month)::integer)
      + 1
    ),
    2
  )
where annual_amount is null;

alter table public.children_expenses
  alter column annual_amount set not null;

alter table public.children_expenses
  drop constraint if exists children_expenses_annual_amount_check;

alter table public.children_expenses
  add constraint children_expenses_annual_amount_check
  check (annual_amount > 0);
