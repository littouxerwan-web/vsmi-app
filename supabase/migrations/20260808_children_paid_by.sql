-- Ajout du payeur réel pour les dépenses ENFANTS
alter table public.children_expenses
  add column if not exists paid_by text not null default 'person_1'
  check (paid_by in ('person_1','person_2'));
