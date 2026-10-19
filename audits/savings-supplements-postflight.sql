-- Read-only checks immediately after migration, before using the feature.
select
 (select count(*) from public.personal_savings_supplements) as nombre_lignes_attendu_zero,
 (select relrowsecurity from pg_class where oid='public.personal_savings_supplements'::regclass) as rls_active,
 (select jsonb_agg(jsonb_build_object('nom',indexname,'definition',indexdef)) from pg_indexes where schemaname='public' and tablename='personal_savings_supplements') as index_crees,
 (select jsonb_agg(jsonb_build_object('nom',policyname,'roles',roles,'commande',cmd,'using',qual,'with_check',with_check)) from pg_policies where schemaname='public' and tablename='personal_savings_supplements') as policies,
 (select not prosecdef from pg_proc where oid='public.mutate_personal_savings_supplement(uuid,uuid,text,numeric)'::regprocedure) as rpc_security_invoker,
 has_table_privilege('authenticated','public.personal_savings_supplements','SELECT')
 and has_table_privilege('authenticated','public.personal_savings_supplements','INSERT')
 and has_table_privilege('authenticated','public.personal_savings_supplements','UPDATE') as droits_authenticated,
 has_function_privilege('authenticated','public.mutate_personal_savings_supplement(uuid,uuid,text,numeric)','EXECUTE') as authenticated_peut_appeler_rpc,
 has_table_privilege('anon','public.personal_savings_supplements','SELECT,INSERT,UPDATE,DELETE') as anon_a_des_droits_attendu_false,
 has_function_privilege('anon','public.mutate_personal_savings_supplement(uuid,uuid,text,numeric)','EXECUTE') as anon_peut_appeler_rpc_attendu_false;
