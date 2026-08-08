-- Crédit CAF pour le simulateur Budget COMMUN
alter table public.common_settings
  add column if not exists caf_credit_amount numeric(12,2) not null default 0 check (caf_credit_amount >= 0),
  add column if not exists caf_person_1_amount numeric(12,2) not null default 0 check (caf_person_1_amount >= 0),
  add column if not exists caf_person_2_amount numeric(12,2) not null default 0 check (caf_person_2_amount >= 0);
