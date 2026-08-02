begin;

create extension if not exists pgcrypto;

create table if not exists public.weddings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  partner1_first_name text,
  partner1_last_name text,
  partner2_first_name text,
  partner2_last_name text,
  email text,
  phone text,
  address text,
  postal_code text,
  city text,
  wedding_date date not null,
  formula text,
  total_amount numeric(12,2) not null check (total_amount > 0),
  color_delivery boolean not null default true,
  black_white_delivery boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wedding_moments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  moment_type text not null check (moment_type in (
    'preparation','town_hall','ceremony','couple_photos','cocktail','dinner','first_dance','other'
  )),
  label text not null,
  location text,
  scheduled_time time,
  photographer_present boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (wedding_id, moment_type)
);

create table if not exists public.wedding_payments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  wedding_id uuid references public.weddings(id) on delete cascade,
  display_name text not null,
  wedding_date date,
  payment_type text not null check (payment_type in ('deposit','balance')),
  amount numeric(12,2) not null check (amount > 0),
  expected_date date,
  received_date date,
  status text not null default 'expected' check (status in ('expected','received','cancelled')),
  source text not null default 'automatic' check (source in ('automatic','manual')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'received' or received_date is not null)
);

create index if not exists weddings_owner_date_idx on public.weddings(owner_id, wedding_date);
create index if not exists wedding_moments_wedding_idx on public.wedding_moments(wedding_id, position);
create index if not exists wedding_payments_owner_expected_idx on public.wedding_payments(owner_id, expected_date);
create index if not exists wedding_payments_owner_received_idx on public.wedding_payments(owner_id, received_date);

create or replace function public.vsmi_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists weddings_set_updated_at on public.weddings;
create trigger weddings_set_updated_at before update on public.weddings
for each row execute function public.vsmi_set_updated_at();

drop trigger if exists wedding_moments_set_updated_at on public.wedding_moments;
create trigger wedding_moments_set_updated_at before update on public.wedding_moments
for each row execute function public.vsmi_set_updated_at();

drop trigger if exists wedding_payments_set_updated_at on public.wedding_payments;
create trigger wedding_payments_set_updated_at before update on public.wedding_payments
for each row execute function public.vsmi_set_updated_at();

alter table public.weddings enable row level security;
alter table public.wedding_moments enable row level security;
alter table public.wedding_payments enable row level security;

drop policy if exists weddings_owner_all on public.weddings;
create policy weddings_owner_all on public.weddings
for all to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

drop policy if exists wedding_moments_owner_all on public.wedding_moments;
create policy wedding_moments_owner_all on public.wedding_moments
for all to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

drop policy if exists wedding_payments_owner_all on public.wedding_payments;
create policy wedding_payments_owner_all on public.wedding_payments
for all to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

commit;
