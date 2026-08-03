begin;

alter table public.wedding_payments
  add column if not exists personal_account_id uuid references public.personal_accounts(id) on delete set null;

create table if not exists public.personal_settings (
  owner_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  photo_default_account_id uuid references public.personal_accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.personal_settings enable row level security;
drop policy if exists personal_settings_owner_all on public.personal_settings;
create policy personal_settings_owner_all on public.personal_settings
for all to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

drop trigger if exists personal_settings_set_updated_at on public.personal_settings;
create trigger personal_settings_set_updated_at
before update on public.personal_settings
for each row execute function public.vsmi_personal_set_updated_at();

create index if not exists wedding_payments_personal_account_idx
  on public.wedding_payments(owner_id, personal_account_id, status, expected_date);

commit;
