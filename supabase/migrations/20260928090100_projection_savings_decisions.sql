-- PREPARED ONLY; requires 20260928090000_projection_stable_identities.sql.
-- SECURITY INVOKER: existing owner RLS remains enforced. No production execution here.
begin;
set local lock_timeout = '5s';
-- Explicit prerequisite check: PL/pgSQL would otherwise defer some errors until first call.
do $$
begin
 if not exists(select 1 from pg_attribute where attrelid='public.personal_movements'::regclass
   and attname='occurrence_date' and atttypid='date'::regtype and not attisdropped)
 or not exists(select 1 from pg_attribute where attrelid='public.personal_savings_proposals'::regclass
   and attname='decision_slot' and atttypid='smallint'::regtype and attnotnull and not attisdropped)
 or (select count(*) from pg_index where indexrelid in (
   to_regclass('public.personal_movements_occurrence_uidx'),to_regclass('public.personal_savings_proposals_decision_uidx'))
   and indisvalid and indisunique)<>2
 then raise exception 'Appliquer et vérifier la migration stable_identities avant cette RPC'; end if;
end $$;
-- Fail on an existing function instead of silently preserving unexpected grants.
create function public.mutate_personal_savings_decision(
 p_source uuid, p_destination uuid, p_month date, p_slot smallint, p_action text, p_amount numeric
) returns void language plpgsql security invoker set search_path=pg_catalog,public as $$
declare
 v_owner uuid := auth.uid();
 v_source_type text; v_destination_type text;
 v_existing public.personal_savings_proposals%rowtype;
 v_group uuid; v_label text; v_today date := (now() at time zone 'Europe/Paris')::date;
 v_changed integer;
 v_balance numeric; v_snapshot public.personal_balance_snapshots%rowtype;
begin
 if v_owner is null then raise exception 'Authentification requise'; end if;
 if p_source is null or p_destination is null or p_source=p_destination or p_slot not in (1,15) or p_slot is null
    or p_month is null or p_month<>date_trunc('month',p_month)::date
    or p_action not in ('accept','update','delete') or p_action is null
    or p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity')
    or (p_action<>'delete' and round(p_amount,2)<=0) then raise exception 'Décision incorrecte'; end if;
 -- Serialize all decisions for this owner (also protects two uses of the same savings).
 perform pg_advisory_xact_lock(hashtextextended(v_owner::text||':savings-decisions',0));
 select account_type into v_source_type from public.personal_accounts where id=p_source and owner_id=v_owner and is_active;
 select account_type into v_destination_type from public.personal_accounts where id=p_destination and owner_id=v_owner and is_active;
 if v_source_type is null or v_destination_type is null or
   not ((v_source_type='checking' and v_destination_type='savings') or (v_source_type='savings' and v_destination_type='checking'))
 then raise exception 'Comptes de la décision incorrects'; end if;
 if exists(select 1 from public.personal_savings_proposals where owner_id=v_owner
    and source_account_id=p_source and destination_account_id=p_destination and source_month=p_month
    and decision_slot=0 and status in ('accepted','deleted'))
 then raise exception 'Une décision historique couvre déjà ce mois. Vérifier son historique avant de la remplacer.'; end if;
 select * into v_existing from public.personal_savings_proposals where owner_id=v_owner
   and source_account_id=p_source and destination_account_id=p_destination and source_month=p_month and decision_slot=p_slot for update;
 if p_action<>'delete' and v_existing.status='deleted' then raise exception 'Cette décision a été supprimée'; end if;
 v_group := v_existing.transfer_group_id;
 if v_existing.status='accepted' and v_group is null then raise exception 'Décision acceptée sans virement : contrôle manuel nécessaire'; end if;
 -- Only an exact, completed, internal PERSO savings pair belongs to this decision.
 -- In particular, a single PERSO leg of a COMMUN transfer must never be touched.
 if v_existing.status is not null and v_existing.status not in ('accepted','pending','deleted') then
   raise exception 'Statut historique de décision inconnu';
 end if;
 if v_existing.status in ('pending','deleted') and v_group is not null then
   raise exception 'Décision non acceptée liée à un virement : contrôle manuel nécessaire';
 end if;
 if v_group is not null then
   perform id from public.personal_movements where owner_id=v_owner and transfer_group_id=v_group order by id for update;
   if (select count(*) from public.personal_movements where owner_id=v_owner and transfer_group_id=v_group)<>2
    or (select count(*) from public.personal_movements where owner_id=v_owner and transfer_group_id=v_group
       and movement_type='transfer_out' and account_id=p_source and status='completed'
       and amount=v_existing.amount)<>1
    or (select count(*) from public.personal_movements where owner_id=v_owner and transfer_group_id=v_group
       and movement_type='transfer_in' and account_id=p_destination and status='completed'
       and amount=v_existing.amount)<>1
    or exists(select 1 from public.personal_movements where owner_id=v_owner and transfer_group_id=v_group
       and (movement_date is null or coalesce(completed_date,(completed_at at time zone 'Europe/Paris')::date,movement_date)>v_today))
    or (select count(distinct movement_date) from public.personal_movements where owner_id=v_owner and transfer_group_id=v_group)<>1
    or (select count(distinct coalesce(completed_date,(completed_at at time zone 'Europe/Paris')::date,movement_date))
        from public.personal_movements where owner_id=v_owner and transfer_group_id=v_group)<>1
    or exists(select 1 from public.personal_savings_proposals where owner_id=v_owner and transfer_group_id=v_group
       and id<>v_existing.id)
   then raise exception 'Virement de décision incohérent : aucune modification effectuée'; end if;
 end if;
 if p_action='accept' and v_existing.status='accepted' then return; end if;
 -- A genuine accepted use cannot spend more savings than currently held.
 if v_source_type='savings' and (p_action='accept' or (p_action='update' and v_existing.status='accepted')) then
   select * into v_snapshot from public.personal_balance_snapshots where owner_id=v_owner and account_id=p_source order by snapshot_date desc,created_at desc limit 1;
   select coalesce(v_snapshot.balance,0)+coalesce(sum(case when movement_type in ('income','transfer_in') then amount else -amount end),0)
     into v_balance from public.personal_movements
     where owner_id=v_owner and account_id=p_source and status='completed'
       and coalesce(completed_date,(completed_at at time zone 'Europe/Paris')::date,movement_date)<=v_today
       and (v_snapshot.id is null or
         (completed_at is not null and completed_at>v_snapshot.created_at) or
         (completed_at is null and coalesce(completed_date,(completed_at at time zone 'Europe/Paris')::date,movement_date)>v_snapshot.snapshot_date));
   if p_action='update' then
     select v_balance+coalesce(sum(amount),0) into v_balance from public.personal_movements
       where owner_id=v_owner and account_id=p_source and transfer_group_id=v_group and status='completed'
       and (v_snapshot.id is null or completed_at>v_snapshot.created_at or
         (completed_at is null and coalesce(completed_date,(completed_at at time zone 'Europe/Paris')::date,movement_date)>v_snapshot.snapshot_date));
   end if;
   if round(p_amount,2)>greatest(0,v_balance) then raise exception 'Fonds d’épargne actuellement insuffisants. Actualiser la projection.'; end if;
 end if;
 if p_action='delete' then
   if v_group is not null then
     delete from public.personal_movements where owner_id=v_owner and transfer_group_id=v_group;
     get diagnostics v_changed = row_count;
     if v_changed<>2 then raise exception 'Suppression incomplète du virement'; end if;
   end if;
   insert into public.personal_savings_proposals(owner_id,source_account_id,destination_account_id,source_month,decision_slot,amount,status,transfer_group_id,accepted_at,updated_at)
    values(v_owner,p_source,p_destination,p_month,p_slot,0,'deleted',null,null,now())
    on conflict(owner_id,source_account_id,destination_account_id,source_month,decision_slot)
    do update set amount=0,status='deleted',transfer_group_id=null,accepted_at=null,updated_at=now();
 elsif p_action='update' then
   if v_existing.status='accepted' then
     update public.personal_movements set amount=round(p_amount,2) where owner_id=v_owner and transfer_group_id=v_group;
     get diagnostics v_changed = row_count;
     if v_changed<>2 then raise exception 'Modification incomplète du virement'; end if;
   end if;
   insert into public.personal_savings_proposals(owner_id,source_account_id,destination_account_id,source_month,decision_slot,amount,status,transfer_group_id,updated_at)
    values(v_owner,p_source,p_destination,p_month,p_slot,round(p_amount,2),case when v_existing.status='accepted' then 'accepted' else 'pending' end,v_group,now())
    on conflict(owner_id,source_account_id,destination_account_id,source_month,decision_slot)
    do update set amount=excluded.amount,status=excluded.status,transfer_group_id=excluded.transfer_group_id,updated_at=now();
 else
   v_group:=gen_random_uuid();
   v_label:=case when v_source_type='savings' then 'Utilisation d''épargne conseillée' else 'Versement épargne proposé' end||' · '||to_char(p_month,'YYYY-MM');
   insert into public.personal_movements(owner_id,account_id,movement_type,label,amount,movement_date,status,completed_date,completed_at,transfer_group_id)
     values(v_owner,p_source,'transfer_out',v_label,round(p_amount,2),v_today,'completed',v_today,now(),v_group),
           (v_owner,p_destination,'transfer_in',v_label,round(p_amount,2),v_today,'completed',v_today,now(),v_group);
   get diagnostics v_changed = row_count;
   if v_changed<>2 then raise exception 'Insertion incomplète du virement'; end if;
   insert into public.personal_savings_proposals(owner_id,source_account_id,destination_account_id,source_month,decision_slot,amount,status,transfer_group_id,accepted_at,updated_at)
    values(v_owner,p_source,p_destination,p_month,p_slot,round(p_amount,2),'accepted',v_group,now(),now())
    on conflict(owner_id,source_account_id,destination_account_id,source_month,decision_slot)
    do update set amount=excluded.amount,status='accepted',transfer_group_id=v_group,accepted_at=now(),updated_at=now();
 end if;
 -- Detect RLS/trigger interference before committing either leg or decision.
 if p_action<>'delete' and v_group is not null then
   if (select count(*) from public.personal_movements where owner_id=v_owner and transfer_group_id=v_group)<>2
    or (select count(*) from public.personal_movements where owner_id=v_owner and transfer_group_id=v_group
      and movement_type='transfer_out' and account_id=p_source and status='completed' and amount=round(p_amount,2))<>1
    or (select count(*) from public.personal_movements where owner_id=v_owner and transfer_group_id=v_group
      and movement_type='transfer_in' and account_id=p_destination and status='completed' and amount=round(p_amount,2))<>1
   then raise exception 'Virement altéré par une policy ou un trigger : transaction annulée'; end if;
 end if;
 if not exists(select 1 from public.personal_savings_proposals where owner_id=v_owner
   and source_account_id=p_source and destination_account_id=p_destination and source_month=p_month and decision_slot=p_slot
   and status=case when p_action='delete' then 'deleted' when p_action='accept' or v_existing.status='accepted' then 'accepted' else 'pending' end
   and amount=case when p_action='delete' then 0 else round(p_amount,2) end
   and transfer_group_id is not distinct from case when p_action='delete' then null::uuid else v_group end)
 then raise exception 'Décision non persistée comme attendu : transaction annulée'; end if;
end;
$$;
revoke all on function public.mutate_personal_savings_decision(uuid,uuid,date,smallint,text,numeric) from public,anon;
grant execute on function public.mutate_personal_savings_decision(uuid,uuid,date,smallint,text,numeric) to authenticated;
commit;
