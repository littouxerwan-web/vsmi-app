-- Exceptions mensuelles des récurrences COMMUN
create table if not exists public.common_recurrence_overrides (
  id uuid primary key default gen_random_uuid(),
  recurrence_id uuid not null references public.common_recurrences(id) on delete cascade,
  occurrence_date date not null,
  label text,
  amount numeric(12,2) check (amount > 0),
  category_id uuid references public.common_categories(id) on delete set null,
  movement_type text check (movement_type in ('income','expense')),
  created_at timestamptz not null default now(),
  unique(recurrence_id, occurrence_date)
);

create table if not exists public.common_recurrence_exclusions (
  id uuid primary key default gen_random_uuid(),
  recurrence_id uuid not null references public.common_recurrences(id) on delete cascade,
  occurrence_date date not null,
  created_at timestamptz not null default now(),
  unique(recurrence_id, occurrence_date)
);

alter table public.common_recurrence_overrides enable row level security;
alter table public.common_recurrence_exclusions enable row level security;

drop policy if exists common_shared_access on public.common_recurrence_overrides;
create policy common_shared_access on public.common_recurrence_overrides
for all to authenticated using (public.can_access_common()) with check (public.can_access_common());

drop policy if exists common_shared_access on public.common_recurrence_exclusions;
create policy common_shared_access on public.common_recurrence_exclusions
for all to authenticated using (public.can_access_common()) with check (public.can_access_common());
