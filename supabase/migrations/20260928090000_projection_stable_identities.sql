-- PREPARED ONLY. Reviewed against the reported audits; full RLS/trigger metadata still required.
-- No production data has been modified by preparing this migration.
begin;

-- Fail quickly rather than waiting indefinitely for a busy application.
set local lock_timeout = '5s';
-- Freeze the inputs until COMMIT: concurrent edits cannot invalidate the backfill.
lock table public.personal_movements, public.personal_savings_proposals in share row exclusive mode;
lock table public.personal_recurrences in share mode;

-- Intentionally NOT IF NOT EXISTS: an unexpected partial installation must be reviewed.
alter table public.personal_movements add column occurrence_date date;

-- Adopt the CURRENT recorded calendar identity. Never use completed_date/completed_at.
-- The reported 54 rows all match this calendar. This does not reconstruct lost history.
-- If another case has appeared since the audit, abort the whole transaction.
do $$
begin
 if exists (
  select 1 from public.personal_movements m
  left join public.personal_recurrences r on r.id=m.recurrence_id
  where m.recurrence_id is not null and (
   r.id is null or m.owner_id is distinct from r.owner_id or m.owner_id is null
   or m.movement_date is null or m.movement_type is null or r.start_date is null
   or r.interval_count is null or r.interval_count<1 or r.frequency is null
   or r.frequency not in ('weekly','monthly','quarterly','yearly')
   or m.movement_date<r.start_date or (r.end_date is not null and m.movement_date>r.end_date)
   or not case
    when r.interval_count is null or r.interval_count<1 then false
    when r.frequency='weekly' then (m.movement_date-r.start_date)%(7::bigint*r.interval_count)=0
    when r.frequency in ('monthly','quarterly','yearly') then
     ((extract(year from m.movement_date)::integer-extract(year from r.start_date)::integer)*12
      +extract(month from m.movement_date)::integer-extract(month from r.start_date)::integer)
      %(r.interval_count::bigint*case r.frequency when 'quarterly' then 3 when 'yearly' then 12 else 1 end)=0
     and extract(day from m.movement_date)=least(extract(day from r.start_date),
       extract(day from (date_trunc('month',m.movement_date)+interval '1 month - 1 day')))
    else false end
  )
 ) then raise exception 'Backfill arrêté : occurrence hors calendrier, identité nulle ou récurrence incohérente. Audit manuel requis.'; end if;
end $$;

update public.personal_movements set occurrence_date = movement_date
where recurrence_id is not null;

create function public.preserve_personal_occurrence_date()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.recurrence_id is null then
    new.occurrence_date := null;
  elsif tg_op = 'UPDATE' and old.recurrence_id = new.recurrence_id then
    new.occurrence_date := coalesce(old.occurrence_date, old.movement_date);
  else
    new.occurrence_date := coalesce(new.occurrence_date, new.movement_date);
  end if;
  return new;
end;
$$;
create trigger preserve_personal_occurrence_date before insert or update on public.personal_movements
for each row execute function public.preserve_personal_occurrence_date();

-- Abort rather than deleting/merging historical duplicates automatically.
create unique index personal_movements_occurrence_uidx
on public.personal_movements(owner_id, recurrence_id, occurrence_date, movement_type)
where recurrence_id is not null and occurrence_date is not null;

alter table public.personal_savings_proposals add column decision_slot smallint not null default 0;
alter table public.personal_savings_proposals add constraint personal_savings_proposals_decision_slot_check
check (decision_slot in (0,1,15));
-- Slot 0 preserves legacy MONTHLY decisions, including deleted decisions.
-- New decisions use 1 or 15; their effective date can be today if that date has passed.
-- Remove only the old exact four-column uniqueness (its historical name may differ).
do $$
declare item record;
begin
  for item in
    select c.conname from pg_constraint c
    where c.conrelid='public.personal_savings_proposals'::regclass and c.contype='u'
    and (select array_agg(a.attname::text order by a.attname) from unnest(c.conkey) k
         join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k)
      = array['destination_account_id','owner_id','source_account_id','source_month']::text[]
  loop execute format('alter table public.personal_savings_proposals drop constraint %I',item.conname); end loop;
  for item in
    select ic.relname from pg_index i join pg_class ic on ic.oid=i.indexrelid
    where i.indrelid='public.personal_savings_proposals'::regclass and i.indisunique and not i.indisprimary
      and not exists(select 1 from pg_constraint c where c.conindid=i.indexrelid)
      and i.indexprs is null and i.indpred is null
      and (select array_agg(a.attname::text order by a.attname) from unnest(i.indkey) k
           join pg_attribute a on a.attrelid=i.indrelid and a.attnum=k)
        = array['destination_account_id','owner_id','source_account_id','source_month']::text[]
  loop execute format('drop index public.%I',item.relname); end loop;
end $$;
create unique index personal_savings_proposals_decision_uidx
on public.personal_savings_proposals(owner_id,source_account_id,destination_account_id,source_month,decision_slot);

-- Trigger functions are not public RPC entry points. Existing trigger execution is unaffected.
revoke all on function public.preserve_personal_occurrence_date() from public, anon, authenticated;
commit;
