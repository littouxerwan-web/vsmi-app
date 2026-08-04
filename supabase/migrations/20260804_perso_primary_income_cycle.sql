alter table public.personal_categories
  add column if not exists is_primary_income boolean not null default false;

create unique index if not exists personal_categories_one_primary_income_per_owner
  on public.personal_categories(owner_id)
  where is_primary_income = true and is_active = true;

comment on column public.personal_categories.is_primary_income is
  'Déclenche le début d’un cycle de trésorerie utilisé pour calculer le potentiel d’épargne jusqu’au revenu principal suivant.';
