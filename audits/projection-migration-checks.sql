/* Lecture seule. Exécuter IMMÉDIATEMENT AVANT puis APRÈS les deux migrations,
   sans autre écriture entre les deux mesures. Sauvegarder les résultats.
   Les empreintes doivent rester identiques, hors nouvelles colonnes.
   Un trigger updated_at existant peut modifier une empreinte : examiner avant application.
   Aucun montant, UUID, label, corps de fonction ou secret n'est exporté. */
with m as (select to_jsonb(x) j from public.personal_movements x),
p as (select to_jsonb(x) j from public.personal_savings_proposals x),
c as (select to_jsonb(x) j from public.common_movements x),
g as (select j->>'transfer_group_id' id,count(*) n from m
 where j->>'transfer_group_id' is not null group by 1),
idx as (select i.*,cl.relname from pg_index i join pg_class cl on cl.oid=i.indexrelid
 where i.indrelid in ('public.personal_movements'::regclass,'public.personal_savings_proposals'::regclass)),
f as (select p.* from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('preserve_personal_occurrence_date','mutate_personal_savings_decision'))
select jsonb_build_object(
 'mouvements', (select count(*) from m),
 'recurrents', (select count(*) from m where j->>'recurrence_id' is not null),
 'recurrents_identite_absente', (select count(*) from m where j->>'recurrence_id' is not null and j->>'occurrence_date' is null),
 'recurrents_identite_egale_movement_date', (select count(*) from m where j->>'recurrence_id' is not null and j->>'occurrence_date'=j->>'movement_date'),
 'identite_sur_non_recurrent', (select count(*) from m where j->>'recurrence_id' is null and j->>'occurrence_date' is not null),
 'doublons_occurrences', (select count(*) from (select j->>'owner_id',j->>'recurrence_id',coalesce(j->>'occurrence_date',j->>'movement_date'),j->>'movement_type'
 from m where j->>'recurrence_id' is not null group by 1,2,3,4 having count(*)>1) x),
 'doublons_decisions', (select count(*) from (select j->>'owner_id',j->>'source_account_id',j->>'destination_account_id',j->>'source_month',coalesce(j->>'decision_slot','0')
 from p group by 1,2,3,4,5 having count(*)>1) x),
 'decisions_par_statut_creneau', (select jsonb_agg(to_jsonb(x)) from (select j->>'status' statut,coalesce(j->>'decision_slot','ABSENT') creneau,count(*) nombre from p group by 1,2) x),
 'groupes_perso', (select count(*) from g),
 'groupes_une_jambe', (select count(*) from g where n=1),
 'empreinte_mouvements_metier', (select md5(coalesce(string_agg((j-'occurrence_date'-'updated_at')::text,E'\n' order by j->>'id'),'')) from m),
 'empreinte_decisions_hors_creneau', (select md5(coalesce(string_agg((j-'decision_slot')::text,E'\n' order by j->>'id'),'')) from p),
 'empreinte_commun', (select md5(coalesce(string_agg(j::text,E'\n' order by j->>'id'),'')) from c),
 'index_cibles', (select jsonb_agg(jsonb_build_object('nom',relname,'unique',indisunique,'valide',indisvalid,'pret',indisready,'definition',pg_get_indexdef(indexrelid))) from idx
 where relname in ('personal_movements_occurrence_uidx','personal_savings_proposals_decision_uidx')),
 'fonctions', (select jsonb_agg(jsonb_build_object('signature',oid::regprocedure::text,'security_definer',prosecdef,
 'execute_anon',has_function_privilege('anon',oid,'EXECUTE'),'execute_authenticated',has_function_privilege('authenticated',oid,'EXECUTE'),
 'execute_public',exists(select 1 from aclexplode(coalesce(proacl,acldefault('f',proowner))) ac where ac.grantee=0 and ac.privilege_type='EXECUTE'))) from f),
 'trigger_identite', (select jsonb_agg(jsonb_build_object('nom',tgname,'actif',tgenabled)) from pg_trigger
 where tgrelid='public.personal_movements'::regclass and tgname='preserve_personal_occurrence_date'),
 'rls', (select jsonb_agg(jsonb_build_object('table',relname,'active',relrowsecurity,'force',relforcerowsecurity)) from pg_class
 where oid in ('public.personal_movements'::regclass,'public.personal_savings_proposals'::regclass,'public.personal_accounts'::regclass,'public.personal_balance_snapshots'::regclass))
) as controle_avant_apres;
