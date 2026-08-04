alter table public.personal_settings
  add column if not exists savings_threshold numeric(12,2) not null default 500,
  add column if not exists savings_source_account_2_id uuid references public.personal_accounts(id) on delete set null,
  add column if not exists savings_destination_account_2_id uuid references public.personal_accounts(id) on delete set null,
  add column if not exists savings_threshold_2 numeric(12,2) not null default 500;

notify pgrst, 'reload schema';
