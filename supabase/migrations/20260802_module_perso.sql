begin;

create extension if not exists pgcrypto;

create table if not exists public.personal_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  account_type text not null default 'checking' check (account_type in ('checking','savings')),
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.personal_categories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  movement_type text not null check (movement_type in ('income','expense')),
  parent_id uuid references public.personal_categories(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, movement_type, parent_id, name)
);

create table if not exists public.personal_balance_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id uuid not null references public.personal_accounts(id) on delete cascade,
  balance numeric(14,2) not null,
  snapshot_date date not null,
  notes text,
  created_at timestamptz not null default now(),
  unique(account_id, snapshot_date)
);

create table if not exists public.personal_movements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id uuid not null references public.personal_accounts(id) on delete cascade,
  category_id uuid references public.personal_categories(id) on delete set null,
  movement_type text not null check (movement_type in ('income','expense','transfer_in','transfer_out')),
  label text not null,
  amount numeric(14,2) not null check (amount > 0),
  movement_date date not null,
  status text not null default 'planned' check (status in ('planned','completed','cancelled')),
  notes text,
  transfer_group_id uuid,
  recurrence_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.personal_recurrences (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id uuid not null references public.personal_accounts(id) on delete cascade,
  category_id uuid references public.personal_categories(id) on delete set null,
  movement_type text not null check (movement_type in ('income','expense','transfer')),
  destination_account_id uuid references public.personal_accounts(id) on delete cascade,
  label text not null,
  amount numeric(14,2) not null check (amount > 0),
  frequency text not null check (frequency in ('weekly','monthly','quarterly','yearly')),
  interval_count integer not null default 1 check (interval_count > 0),
  start_date date not null,
  end_date date,
  annual_change_percent numeric(7,3) not null default 0,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (movement_type <> 'transfer' or destination_account_id is not null),
  check (end_date is null or end_date >= start_date)
);

alter table public.personal_movements
  drop constraint if exists personal_movements_recurrence_id_fkey;
alter table public.personal_movements
  add constraint personal_movements_recurrence_id_fkey foreign key (recurrence_id)
  references public.personal_recurrences(id) on delete cascade;

create index if not exists personal_accounts_owner_idx on public.personal_accounts(owner_id);
create index if not exists personal_categories_owner_idx on public.personal_categories(owner_id, movement_type, parent_id);
create index if not exists personal_snapshots_account_date_idx on public.personal_balance_snapshots(account_id, snapshot_date desc);
create index if not exists personal_movements_owner_date_idx on public.personal_movements(owner_id, movement_date);
create index if not exists personal_recurrences_owner_active_idx on public.personal_recurrences(owner_id, is_active);

create or replace function public.vsmi_personal_set_updated_at()
returns trigger language plpgsql security invoker set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'personal_accounts_set_updated_at') then
    create trigger personal_accounts_set_updated_at before update on public.personal_accounts for each row execute function public.vsmi_personal_set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'personal_categories_set_updated_at') then
    create trigger personal_categories_set_updated_at before update on public.personal_categories for each row execute function public.vsmi_personal_set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'personal_movements_set_updated_at') then
    create trigger personal_movements_set_updated_at before update on public.personal_movements for each row execute function public.vsmi_personal_set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'personal_recurrences_set_updated_at') then
    create trigger personal_recurrences_set_updated_at before update on public.personal_recurrences for each row execute function public.vsmi_personal_set_updated_at();
  end if;
end $$;

alter table public.personal_accounts enable row level security;
alter table public.personal_categories enable row level security;
alter table public.personal_balance_snapshots enable row level security;
alter table public.personal_movements enable row level security;
alter table public.personal_recurrences enable row level security;

do $$
declare t text;
begin
  foreach t in array array['personal_accounts','personal_categories','personal_balance_snapshots','personal_movements','personal_recurrences'] loop
    execute format('drop policy if exists %I on public.%I', t || '_owner_all', t);
    execute format('create policy %I on public.%I for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id)', t || '_owner_all', t);
  end loop;
end $$;

commit;
