begin;

create table if not exists public.personal_photo_payment_states (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  payment_id uuid not null references public.wedding_payments(id) on delete cascade,
  account_id uuid references public.personal_accounts(id) on delete set null,
  is_completed boolean not null default false,
  completed_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, payment_id)
);

alter table public.personal_photo_payment_states enable row level security;
drop policy if exists personal_photo_payment_states_owner_all on public.personal_photo_payment_states;
create policy personal_photo_payment_states_owner_all on public.personal_photo_payment_states
for all to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create index if not exists personal_photo_payment_states_account_idx
  on public.personal_photo_payment_states(owner_id, account_id, is_completed);

commit;
