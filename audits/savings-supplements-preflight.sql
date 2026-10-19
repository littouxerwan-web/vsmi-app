-- READ ONLY. Run before any production migration; no financial rows or secrets returned.
with required(table_name,column_name,type_name) as (values
 ('personal_savings_proposals','id','uuid'),('personal_savings_proposals','owner_id','uuid'),
 ('personal_savings_proposals','source_account_id','uuid'),('personal_savings_proposals','destination_account_id','uuid'),
 ('personal_savings_proposals','status','text'),('personal_savings_proposals','transfer_group_id','uuid'),
 ('personal_accounts','id','uuid'),('personal_accounts','owner_id','uuid'),('personal_accounts','is_active','bool'),
 ('personal_accounts','account_type','text'),('personal_balance_snapshots','id','uuid'),('personal_balance_snapshots','owner_id','uuid'),
 ('personal_balance_snapshots','account_id','uuid'),('personal_balance_snapshots','snapshot_date','date'),('personal_balance_snapshots','created_at','timestamptz'),
 ('personal_movements','id','uuid'),('personal_movements','owner_id','uuid'),('personal_movements','account_id','uuid'),
 ('personal_movements','movement_type','text'),('personal_movements','label','text'),('personal_movements','movement_date','date'),
 ('personal_movements','completed_date','date'),('personal_movements','completed_at','timestamptz'),
 ('personal_movements','transfer_group_id','uuid'),('personal_movements','status','text')
), mismatches as (
 select r.* from required r left join pg_attribute a on a.attrelid=to_regclass('public.'||r.table_name)
 and a.attname=r.column_name and not a.attisdropped
 left join pg_type t on t.oid=a.atttypid where t.typname is distinct from r.type_name
)
select
 to_regclass('public.personal_savings_supplements') is null as nouvelle_table_absente,
 not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='mutate_personal_savings_supplement') as nom_rpc_disponible,
 to_regclass('public.personal_savings_supplements_decision_idx') is null and to_regclass('public.personal_savings_supplements_group_uidx') is null as noms_index_disponibles,
 coalesce((select jsonb_agg(to_jsonb(m)) from mismatches m),'[]'::jsonb) as colonnes_incompatibles,
 (select jsonb_agg(jsonb_build_object('table',table_name,'colonne',column_name,'type',data_type)) from information_schema.columns where table_schema='public' and (table_name='personal_savings_proposals' and column_name='amount' or table_name='personal_movements' and column_name='amount' or table_name='personal_balance_snapshots' and column_name='balance')) as colonnes_montants,
 exists(select 1 from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1] where c.conrelid='public.personal_savings_proposals'::regclass and c.contype in ('p','u') and cardinality(c.conkey)=1 and a.attname='id') as decision_id_referenceable,
 to_regprocedure('auth.uid()') is not null as auth_uid_presente,
 (select count(*)=2 from pg_roles where rolname in ('authenticated','anon')) as roles_presents,
 (select jsonb_agg(jsonb_build_object('table',c.relname,'rls',c.relrowsecurity,'select',has_table_privilege('authenticated',c.oid,'SELECT'),'insert',has_table_privilege('authenticated',c.oid,'INSERT'),'update',has_table_privilege('authenticated',c.oid,'UPDATE'))) from pg_class c where c.oid in ('public.personal_accounts'::regclass,'public.personal_movements'::regclass,'public.personal_savings_proposals'::regclass,'public.personal_balance_snapshots'::regclass)) as droits_et_rls,
 (select jsonb_agg(jsonb_build_object('table',tablename,'policy',policyname,'commande',cmd,'roles',roles,'using',qual,'with_check',with_check)) from pg_policies where schemaname='public' and tablename in ('personal_accounts','personal_movements','personal_savings_proposals','personal_balance_snapshots')) as policies_existantes,
 (select jsonb_agg(jsonb_build_object('table',c.relname,'trigger',t.tgname,'definition',pg_get_triggerdef(t.oid))) from pg_trigger t join pg_class c on c.oid=t.tgrelid where not t.tgisinternal and t.tgrelid in ('public.personal_movements'::regclass,'public.personal_savings_proposals'::regclass)) as triggers_existants;
