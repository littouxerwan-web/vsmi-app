-- Objectifs d'épargne : rattacher virements ponctuels/récurrents à une enveloppe.
alter table public.personal_movements
  add column if not exists savings_budget_id uuid null references public.personal_savings_budgets(id) on delete set null;

alter table public.personal_recurrences
  add column if not exists savings_budget_id uuid null references public.personal_savings_budgets(id) on delete set null;

create index if not exists personal_movements_savings_budget_idx on public.personal_movements(savings_budget_id);
create index if not exists personal_recurrences_savings_budget_idx on public.personal_recurrences(savings_budget_id);

-- Un objectif peut démarrer à 0 € puis être alimenté par des virements.
alter table public.personal_savings_budgets drop constraint if exists personal_savings_budgets_allocation_value_check;
alter table public.personal_savings_budgets add constraint personal_savings_budgets_allocation_value_check check (allocation_value >= 0);
