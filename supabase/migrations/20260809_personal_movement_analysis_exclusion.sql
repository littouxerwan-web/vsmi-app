-- Exclusion ponctuelle de mouvements PERSO de la page Analyse uniquement.
-- Aucun impact sur En cours, Projection, budgets ou épargne.

alter table public.personal_movements
  add column if not exists exclude_from_analysis boolean not null default false;
