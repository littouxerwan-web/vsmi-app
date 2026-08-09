alter table public.personal_movements
  add column if not exists is_essential_override boolean null;

comment on column public.personal_movements.is_essential_override is
  'Override individuel pour Analyse : true = essentielle, false = non essentielle, null = hérite de la récurrence ou catégorie.';
