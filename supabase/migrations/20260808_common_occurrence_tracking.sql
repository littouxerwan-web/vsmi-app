-- Pointage des opérations COMMUN
alter table public.common_movements
  add column if not exists completed_date date,
  add column if not exists completed_at timestamptz;

create unique index if not exists common_movements_recurrence_occurrence_uidx
  on public.common_movements(recurrence_id, movement_date)
  where recurrence_id is not null;
