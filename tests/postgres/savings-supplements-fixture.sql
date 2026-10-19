-- SYNTHETIC FIXTURE ONLY. Execute solely in an empty disposable PostgreSQL database.
do $$begin if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if; if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if; end$$;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to authenticated;
create table public.personal_accounts(id uuid primary key,owner_id uuid not null,account_type text,is_active boolean default true);
create table public.personal_savings_proposals(id uuid primary key,owner_id uuid not null,source_account_id uuid,destination_account_id uuid,source_month date,decision_slot smallint,amount numeric,status text,transfer_group_id uuid);
create table public.personal_balance_snapshots(id uuid primary key,owner_id uuid,account_id uuid,balance numeric,snapshot_date date,created_at timestamptz);
create table public.personal_movements(id uuid primary key default gen_random_uuid(),owner_id uuid,account_id uuid,movement_type text,label text,amount numeric check(amount>0),movement_date date,status text,completed_date date,completed_at timestamptz,transfer_group_id uuid);
do $$declare t text; begin foreach t in array array['personal_accounts','personal_savings_proposals','personal_balance_snapshots','personal_movements'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy own on public.%I to authenticated using (owner_id=auth.uid()) with check (owner_id=auth.uid())',t);
 execute format('grant select,insert,update,delete on public.%I to authenticated',t);
end loop;end$$;
insert into auth.users values('40000000-0000-0000-0000-000000000001'),('40000000-0000-0000-0000-000000000002');
insert into personal_accounts values('20000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','savings',true),('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','checking',true);
insert into personal_savings_proposals select ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',date_trunc('month',now())::date,15,100,'accepted',('10000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,8) n;
insert into personal_movements(owner_id,account_id,movement_type,amount,movement_date,status,completed_date,completed_at,transfer_group_id)
 select p.owner_id,case leg when 1 then p.source_account_id else p.destination_account_id end,case leg when 1 then 'transfer_out' else 'transfer_in' end,100,current_date-1,'completed',current_date-1,now()-interval '1 day',p.transfer_group_id from personal_savings_proposals p cross join generate_series(1,2) leg;
insert into personal_balance_snapshots values(gen_random_uuid(),'40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',1000,current_date,now());
create table baseline_decisions as select * from personal_savings_proposals;
create table baseline_movements as select * from personal_movements;
