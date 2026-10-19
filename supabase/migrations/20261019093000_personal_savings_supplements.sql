-- Prepared locally only. Requires the existing savings-decision schema.
-- Additive: does not update any historical decision, movement or COMMUN data.
begin;
set local lock_timeout = '5s';
create table public.personal_savings_supplements (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 decision_id uuid not null references public.personal_savings_proposals(id),
 previous_transfer_group_id uuid not null,
 amount numeric(14,2) not null check(amount >= 0 and amount <> 'NaN'::numeric),
 status text not null check(status in ('pending','accepted','deleted')),
 transfer_group_id uuid,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(owner_id,decision_id,previous_transfer_group_id),
 check ((status='accepted') = (transfer_group_id is not null)),
 check (status='deleted' or amount>0),
 check (transfer_group_id is null or transfer_group_id<>previous_transfer_group_id)
);
create index personal_savings_supplements_decision_idx on public.personal_savings_supplements(decision_id);
create unique index personal_savings_supplements_group_uidx on public.personal_savings_supplements(transfer_group_id) where transfer_group_id is not null;
alter table public.personal_savings_supplements enable row level security;
revoke all on public.personal_savings_supplements from public,anon;
grant select,insert,update on public.personal_savings_supplements to authenticated;
create policy personal_savings_supplements_owner on public.personal_savings_supplements for all to authenticated
 using ((select auth.uid())=owner_id)
 with check ((select auth.uid())=owner_id and exists (
  select 1 from public.personal_savings_proposals p where p.id=decision_id and p.owner_id=(select auth.uid())
 ));

create function public.mutate_personal_savings_supplement(
 p_decision uuid,p_previous_group uuid,p_action text,p_amount numeric
) returns void language plpgsql security invoker set search_path=pg_catalog,public as $$
declare
 v_owner uuid:=auth.uid();
 v_parent public.personal_savings_proposals%rowtype;
 v_existing public.personal_savings_supplements%rowtype;
 v_snapshot public.personal_balance_snapshots%rowtype;
 v_parent_amount numeric; v_balance numeric; v_group uuid; v_count integer;
 v_today date:=(now() at time zone 'Europe/Paris')::date;
begin
 if v_owner is null then raise exception 'Authentification requise'; end if;
 if p_decision is null or p_previous_group is null or p_action is null or p_action not in ('accept','update','delete')
 or p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity')
 or (p_action<>'delete' and round(p_amount,2)<=0) then raise exception 'Complément incorrect'; end if;
 -- Same lock as the original RPC: serializes all savings decisions for one owner.
 perform pg_advisory_xact_lock(hashtextextended(v_owner::text||':savings-decisions',0));
 select * into v_parent from public.personal_savings_proposals where id=p_decision and owner_id=v_owner for update;
 if v_parent.id is null or v_parent.status<>'accepted' or v_parent.transfer_group_id is null then
  raise exception 'Décision précédente absente ou non acceptée'; end if;
 if not exists(select 1 from public.personal_accounts where id=v_parent.source_account_id and owner_id=v_owner and is_active and account_type='savings')
 or not exists(select 1 from public.personal_accounts where id=v_parent.destination_account_id and owner_id=v_owner and is_active and account_type='checking')
 then raise exception 'Comptes du complément incorrects'; end if;
 if p_previous_group=v_parent.transfer_group_id then v_parent_amount:=v_parent.amount;
 else
  select amount into v_parent_amount from public.personal_savings_supplements where owner_id=v_owner
   and decision_id=p_decision and transfer_group_id=p_previous_group and status='accepted';
 end if;
 if v_parent_amount is null then raise exception 'Ce virement ne dépend pas de cette décision'; end if;
 if exists(select 1 from public.personal_savings_proposals where owner_id=v_owner and transfer_group_id=p_previous_group and id<>p_decision)
 or exists(select 1 from public.personal_savings_supplements where owner_id=v_owner and transfer_group_id=p_previous_group and decision_id<>p_decision)
 then raise exception 'Virement partagé avec une autre décision'; end if;
 perform id from public.personal_movements where owner_id=v_owner and transfer_group_id=p_previous_group order by id for update;
 if (select count(*) from public.personal_movements where owner_id=v_owner and transfer_group_id=p_previous_group)<>2
 or (select count(*) from public.personal_movements where owner_id=v_owner and transfer_group_id=p_previous_group
  and movement_type='transfer_out' and account_id=v_parent.source_account_id and status='completed' and amount=v_parent_amount)<>1
 or (select count(*) from public.personal_movements where owner_id=v_owner and transfer_group_id=p_previous_group
  and movement_type='transfer_in' and account_id=v_parent.destination_account_id and status='completed' and amount=v_parent_amount)<>1
 or exists(select 1 from public.personal_movements where owner_id=v_owner and transfer_group_id=p_previous_group
  and (movement_date is null or coalesce(completed_date,(completed_at at time zone 'Europe/Paris')::date,movement_date)>v_today))
 or (select count(distinct movement_date) from public.personal_movements where owner_id=v_owner and transfer_group_id=p_previous_group)<>1
 or (select count(distinct coalesce(completed_date,(completed_at at time zone 'Europe/Paris')::date,movement_date)) from public.personal_movements where owner_id=v_owner and transfer_group_id=p_previous_group)<>1
 then raise exception 'Virement précédent incomplet ou non réalisé'; end if;
 select * into v_existing from public.personal_savings_supplements where owner_id=v_owner and decision_id=p_decision
  and previous_transfer_group_id=p_previous_group for update;
 if v_existing.status='accepted' then
  if p_action='accept' then return; end if;
  raise exception 'Un complément accepté est conservé : gérer son virement séparément';
 end if;
 if v_existing.status='deleted' and p_action<>'delete' then raise exception 'Ce complément a été supprimé'; end if;
 if p_action='accept' then
  select * into v_snapshot from public.personal_balance_snapshots where owner_id=v_owner and account_id=v_parent.source_account_id order by snapshot_date desc,created_at desc limit 1;
  select coalesce(v_snapshot.balance,0)+coalesce(sum(case when movement_type in ('income','transfer_in') then amount else -amount end),0)
   into v_balance from public.personal_movements where owner_id=v_owner and account_id=v_parent.source_account_id and status='completed'
   and coalesce(completed_date,(completed_at at time zone 'Europe/Paris')::date,movement_date)<=v_today
   and (v_snapshot.id is null or (completed_at is not null and completed_at>v_snapshot.created_at)
    or (completed_at is null and coalesce(completed_date,movement_date)>v_snapshot.snapshot_date));
  if round(p_amount,2)>greatest(0,v_balance) then raise exception 'Fonds d’épargne actuellement insuffisants'; end if;
  v_group:=gen_random_uuid();
  insert into public.personal_movements(owner_id,account_id,movement_type,label,amount,movement_date,status,completed_date,completed_at,transfer_group_id)
  values(v_owner,v_parent.source_account_id,'transfer_out','Complément d’épargne',round(p_amount,2),v_today,'completed',v_today,now(),v_group),
        (v_owner,v_parent.destination_account_id,'transfer_in','Complément d’épargne',round(p_amount,2),v_today,'completed',v_today,now(),v_group);
  get diagnostics v_count=row_count;
  if v_count<>2 then raise exception 'Insertion incomplète du complément'; end if;
  if (select count(*) from public.personal_movements where owner_id=v_owner and transfer_group_id=v_group)<>2
  or (select count(*) from public.personal_movements where owner_id=v_owner and transfer_group_id=v_group and movement_type='transfer_out'
    and account_id=v_parent.source_account_id and status='completed' and amount=round(p_amount,2) and movement_date=v_today and completed_date=v_today)<>1
  or (select count(*) from public.personal_movements where owner_id=v_owner and transfer_group_id=v_group and movement_type='transfer_in'
    and account_id=v_parent.destination_account_id and status='completed' and amount=round(p_amount,2) and movement_date=v_today and completed_date=v_today)<>1
  then raise exception 'Complément altéré : transaction annulée'; end if;
 end if;
 insert into public.personal_savings_supplements(owner_id,decision_id,previous_transfer_group_id,amount,status,transfer_group_id)
 values(v_owner,p_decision,p_previous_group,case when p_action='delete' then 0 else round(p_amount,2) end,
   case p_action when 'accept' then 'accepted' when 'delete' then 'deleted' else 'pending' end,v_group)
 on conflict(owner_id,decision_id,previous_transfer_group_id) do update
 set amount=excluded.amount,status=excluded.status,transfer_group_id=excluded.transfer_group_id,updated_at=now();
 if not exists(select 1 from public.personal_savings_supplements where owner_id=v_owner and decision_id=p_decision
  and previous_transfer_group_id=p_previous_group and status=case p_action when 'accept' then 'accepted' when 'delete' then 'deleted' else 'pending' end
  and amount=case when p_action='delete' then 0 else round(p_amount,2) end and transfer_group_id is not distinct from v_group)
 then raise exception 'Complément non enregistré : transaction annulée'; end if;
end;
$$;
revoke all on function public.mutate_personal_savings_supplement(uuid,uuid,text,numeric) from public,anon;
grant execute on function public.mutate_personal_savings_supplement(uuid,uuid,text,numeric) to authenticated;
commit;
