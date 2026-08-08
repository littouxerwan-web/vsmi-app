-- Module ENFANTS : totalement indépendant de PERSO / COMMUN / PHOTO.
-- Accès réservé au compte principal VSMI (photo_access=true et rôle non personal).

create extension if not exists pgcrypto;

create or replace function public.can_access_children()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() is not null
    and coalesce((auth.jwt()->'app_metadata'->>'photo_access')::boolean, false)
    and coalesce(auth.jwt()->'app_metadata'->>'role', '') <> 'personal';
$$;

create table if not exists public.children_settings (
  owner_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  person_1_name text not null default 'Moi',
  person_2_name text not null default 'Autre parent',
  income_person_1 numeric(14,2) not null default 0 check (income_person_1 >= 0),
  income_person_2 numeric(14,2) not null default 0 check (income_person_2 >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.children_expenses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  label text not null,
  amount numeric(14,2) not null check (amount > 0),
  expense_date date not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists children_expenses_owner_date_idx
  on public.children_expenses(owner_id, expense_date desc);

alter table public.children_settings enable row level security;
alter table public.children_expenses enable row level security;

drop policy if exists children_settings_private on public.children_settings;
create policy children_settings_private on public.children_settings
for all to authenticated
using (owner_id = auth.uid() and public.can_access_children())
with check (owner_id = auth.uid() and public.can_access_children());

drop policy if exists children_expenses_private on public.children_expenses;
create policy children_expenses_private on public.children_expenses
for all to authenticated
using (owner_id = auth.uid() and public.can_access_children())
with check (owner_id = auth.uid() and public.can_access_children());
