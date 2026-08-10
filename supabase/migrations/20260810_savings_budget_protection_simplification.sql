-- Simplifie les protections des budgets d'épargne sans rendre mobilisable
-- une enveloppe qui ne l'était pas auparavant.
-- preserve + allow_recovery = libre
-- preserve sans allow_recovery = intouchable
update public.personal_savings_budgets
set protection = case
  when protection = 'preserve' and allow_recovery then 'free'
  when protection = 'preserve' then 'untouchable'
  else protection
end,
allow_recovery = case
  when protection = 'free' then true
  when protection = 'preserve' and allow_recovery then true
  else false
end,
priority = case
  when (protection = 'free') or (protection = 'preserve' and allow_recovery) then 10
  else 100
end;

alter table public.personal_savings_budgets
  drop constraint if exists personal_savings_budgets_protection_check;

alter table public.personal_savings_budgets
  add constraint personal_savings_budgets_protection_check
  check (protection in ('free','untouchable'));
