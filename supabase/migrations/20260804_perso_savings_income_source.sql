alter table public.personal_settings
  add column if not exists savings_income_source text not null default 'category',
  add column if not exists savings_income_source_2 text not null default 'category';

alter table public.personal_settings
  drop constraint if exists personal_settings_savings_income_source_check,
  add constraint personal_settings_savings_income_source_check check (savings_income_source in ('category','weddings')),
  drop constraint if exists personal_settings_savings_income_source_2_check,
  add constraint personal_settings_savings_income_source_2_check check (savings_income_source_2 in ('category','weddings'));

comment on column public.personal_settings.savings_income_source is 'Déclencheur du cycle d’épargne du profil 1 : catégorie ou encaissements mariages.';
comment on column public.personal_settings.savings_income_source_2 is 'Déclencheur du cycle d’épargne du profil 2 : catégorie ou encaissements mariages.';

notify pgrst, 'reload schema';
