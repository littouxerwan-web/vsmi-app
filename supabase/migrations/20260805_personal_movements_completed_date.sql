alter table public.personal_movements
  add column if not exists completed_date date;

update public.personal_movements
set completed_date = movement_date
where status = 'completed'
  and completed_date is null;

create index if not exists personal_movements_owner_completed_date_idx
  on public.personal_movements(owner_id, completed_date);
