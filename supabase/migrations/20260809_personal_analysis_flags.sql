-- Paramètres d'analyse PERSO : exclusions et caractère essentiel des récurrences.
-- Ces colonnes n'affectent ni En cours ni Projection ; elles sont lues uniquement par Analyse/Paramètres.

alter table public.personal_categories
  add column if not exists exclude_from_analysis boolean not null default false;

alter table public.personal_recurrences
  add column if not exists exclude_from_analysis boolean not null default false,
  add column if not exists is_essential boolean not null default false;
