alter table public.personal_settings
  add column if not exists savings_income_category_id uuid references public.personal_categories(id) on delete set null,
  add column if not exists savings_income_category_2_id uuid references public.personal_categories(id) on delete set null,
  add column if not exists savings_proposal_timing text not null default 'same_day',
  add column if not exists savings_proposal_timing_2 text not null default 'same_day';

alter table public.personal_settings
  drop constraint if exists personal_settings_savings_proposal_timing_check,
  add constraint personal_settings_savings_proposal_timing_check
    check (savings_proposal_timing in ('same_day','next_day')),
  drop constraint if exists personal_settings_savings_proposal_timing_2_check,
  add constraint personal_settings_savings_proposal_timing_2_check
    check (savings_proposal_timing_2 in ('same_day','next_day'));

comment on column public.personal_settings.savings_income_category_id is
  'Catégorie de revenu qui démarre le cycle de trésorerie du profil d’épargne 1.';
comment on column public.personal_settings.savings_income_category_2_id is
  'Catégorie de revenu qui démarre le cycle de trésorerie du profil d’épargne 2.';

notify pgrst, 'reload schema';
