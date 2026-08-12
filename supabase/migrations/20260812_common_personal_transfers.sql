begin;

create or replace function public.common_transfer_accounts()
returns table(account_id uuid, account_name text, owner_name text)
language sql
security definer
set search_path = public, auth
as $$
  select a.id, a.name,
         coalesce(nullif(u.raw_user_meta_data->>'first_name',''), split_part(coalesce(u.raw_user_meta_data->>'full_name',''), ' ', 1)) as owner_name
  from public.personal_accounts a
  join auth.users u on u.id=a.owner_id
  where exists (select 1 from auth.users me where me.id=auth.uid() and lower(coalesce(nullif(me.raw_user_meta_data->>'first_name',''), split_part(coalesce(me.raw_user_meta_data->>'full_name',''), ' ', 1))) in ('erwan','laure'))
    and a.is_active=true
    and a.account_type='checking'
    and lower(coalesce(nullif(u.raw_user_meta_data->>'first_name',''), split_part(coalesce(u.raw_user_meta_data->>'full_name',''), ' ', 1))) in ('erwan','laure')
  order by owner_name, a.display_order nulls last, a.name;
$$;

grant execute on function public.common_transfer_accounts() to authenticated;

create or replace function public.common_create_personal_transfer(
  p_person_name text,
  p_account_id uuid,
  p_direction text,
  p_amount numeric,
  p_movement_date date,
  p_status text default 'planned'
) returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_owner uuid;
  v_first text;
  v_group uuid := gen_random_uuid();
  v_completed_date date;
  v_completed_at timestamptz;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if not exists (select 1 from auth.users me where me.id=auth.uid() and lower(coalesce(nullif(me.raw_user_meta_data->>'first_name',''), split_part(coalesce(me.raw_user_meta_data->>'full_name',''), ' ', 1))) in ('erwan','laure')) then raise exception 'Acces refuse'; end if;
  if p_direction not in ('to_common','from_common') then raise exception 'Sens de virement incorrect'; end if;
  if p_status not in ('planned','completed') then raise exception 'Etat incorrect'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Montant incorrect'; end if;

  select a.owner_id,
         coalesce(nullif(u.raw_user_meta_data->>'first_name',''), split_part(coalesce(u.raw_user_meta_data->>'full_name',''), ' ', 1))
    into v_owner,v_first
  from public.personal_accounts a
  join auth.users u on u.id=a.owner_id
  where a.id=p_account_id and a.is_active=true and a.account_type='checking'
    and lower(coalesce(nullif(u.raw_user_meta_data->>'first_name',''), split_part(coalesce(u.raw_user_meta_data->>'full_name',''), ' ', 1))) in ('erwan','laure');

  if v_owner is null or lower(v_first) <> lower(trim(p_person_name)) then raise exception 'Compte courant non autorisé'; end if;

  if p_status='completed' then
    v_completed_date := (now() at time zone 'Europe/Paris')::date;
    v_completed_at := now();
  end if;

  insert into public.common_movements(movement_type,label,amount,movement_date,status,completed_date,completed_at,created_by)
  values(case when p_direction='to_common' then 'income' else 'expense' end,
         'Virement '||v_first,p_amount,p_movement_date,p_status,v_completed_date,v_completed_at,auth.uid());

  insert into public.personal_movements(owner_id,account_id,movement_type,label,amount,movement_date,status,completed_date,completed_at,transfer_group_id)
  values(v_owner,p_account_id,
         case when p_direction='to_common' then 'transfer_out' else 'transfer_in' end,
         case when p_direction='to_common' then 'Virement vers COMMUN' else 'Virement depuis COMMUN' end,
         p_amount,p_movement_date,p_status,v_completed_date,v_completed_at,v_group);
end;
$$;

grant execute on function public.common_create_personal_transfer(text,uuid,text,numeric,date,text) to authenticated;

commit;
