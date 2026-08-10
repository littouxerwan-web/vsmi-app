-- Nouvelle hiérarchie Budgets Épargne :
-- Réserve = mobilisable immédiatement ; Projet libre = relais ; Projet intouchable = jamais mobilisé.
-- La priorité n'est plus utilisée par le moteur.
update public.personal_savings_budgets
set protection = case
      when kind = 'reserve' then 'free'
      when protection = 'untouchable' then 'untouchable'
      else 'free'
    end,
    allow_recovery = case
      when kind = 'reserve' then true
      when protection = 'untouchable' then false
      else true
    end,
    priority = 0;
