create table if not exists public.personal_recurrence_exclusions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  recurrence_id uuid not null references public.personal_recurrences(id) on delete cascade,
  occurrence_date date not null,
  created_at timestamptz not null default now(),
  unique (recurrence_id, occurrence_date)
);

alter table public.personal_recurrence_exclusions enable row level security;

drop policy if exists "personal_recurrence_exclusions_owner" on public.personal_recurrence_exclusions;
create policy "personal_recurrence_exclusions_owner"
on public.personal_recurrence_exclusions
for all
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

create index if not exists personal_recurrence_exclusions_owner_date_idx
on public.personal_recurrence_exclusions(owner_id, occurrence_date);
