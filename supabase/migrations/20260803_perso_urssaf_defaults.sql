alter table public.personal_settings
  add column if not exists urssaf_default_account_id uuid null references public.personal_accounts(id) on delete set null;

create table if not exists public.personal_urssaf_states (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  contribution_month date not null,
  account_id uuid null references public.personal_accounts(id) on delete set null,
  is_completed boolean not null default false,
  completed_date date null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, contribution_month)
);

alter table public.personal_urssaf_states enable row level security;
drop policy if exists personal_urssaf_states_owner_all on public.personal_urssaf_states;
create policy personal_urssaf_states_owner_all on public.personal_urssaf_states
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

comment on column public.personal_settings.urssaf_default_account_id is
  'Compte débité par défaut pour les cotisations URSSAF calculées automatiquement.';
