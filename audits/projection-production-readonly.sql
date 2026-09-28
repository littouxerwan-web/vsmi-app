/* UNE instruction SELECT, strictement en lecture seule. Aucune fonction métier appelée.
   À exécuter dans le SQL Editor avec le rôle postgres pour voir toutes les lignes.
   Références M/P/R/G = numéros anonymes propres à CE résultat, pas des UUID.
   Échantillons limités à 30 ; les comptages portent sur toutes les lignes visibles.
   Ne produit ni libellés, ni noms de personnes, ni UUID, ni corps de fonctions.
   Les constantes textuelles des expressions de métadonnées sont masquées.
   Les six tables public ci-dessous sont supposées exister ; une erreur de relation
   manquante doit être rapportée, sans créer de table pour contourner l'erreur.
*/
WITH
names(name) AS (VALUES
 ('personal_movements'), ('personal_savings_proposals'), ('personal_accounts'),
 ('personal_balance_snapshots'), ('personal_recurrences'), ('personal_recurrence_exclusions')),
tables AS (
 SELECT c.*, n.nspname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 JOIN names t ON t.name=c.relname WHERE n.nspname='public'
),
/* Les nouvelles colonnes sont lues via JSON : leur absence est supportée. */
m AS (
 SELECT row_number() OVER (ORDER BY j->>'id') AS ref, j,
 j->>'id' id,j->>'owner_id' owner_id,j->>'account_id' account_id,
 j->>'recurrence_id' recurrence_id,j->>'transfer_group_id' grp,
 j->>'movement_type' kind,j->>'status' status,
 j->>'movement_date' planned,j->>'occurrence_date' origin,
 coalesce(j->>'occurrence_date',j->>'movement_date') future_origin,
 j->>'completed_date' completed_date,j->>'completed_at' completed_at,
 (j->>'amount')::numeric amount
 FROM (SELECT to_jsonb(x) j FROM public.personal_movements x) x
),
p AS (
 SELECT row_number() OVER (ORDER BY j->>'id') AS ref,j,
 j->>'owner_id' owner_id,j->>'source_account_id' src,j->>'destination_account_id' dst,
 j->>'source_month' month,j->>'status' status,j->>'transfer_group_id' grp,
 CASE WHEN j ? 'decision_slot' THEN j->>'decision_slot' ELSE '0' END slot,
 (j->>'amount')::numeric amount
 FROM (SELECT to_jsonb(x) j FROM public.personal_savings_proposals x) x
),
a AS (SELECT to_jsonb(x) j FROM public.personal_accounts x),
r AS (
 SELECT row_number() OVER (ORDER BY j->>'id') ref,j,j->>'id' id,j->>'owner_id' owner_id,
 (j->>'start_date')::date start_day,(j->>'end_date')::date end_day,
 j->>'frequency' frequency,(j->>'interval_count')::integer step
 FROM (SELECT to_jsonb(x) j FROM public.personal_recurrences x) x
),
snap AS (SELECT to_jsonb(x) j FROM public.personal_balance_snapshots x),
e AS (SELECT to_jsonb(x) j FROM public.personal_recurrence_exclusions x),
required(tbl,cols) AS (VALUES
 ('personal_movements','id,owner_id,account_id,movement_type,label,amount,movement_date,status,completed_date,completed_at,transfer_group_id,recurrence_id'),
 ('personal_savings_proposals','id,owner_id,source_account_id,destination_account_id,source_month,amount,status,transfer_group_id,accepted_at,updated_at'),
 ('personal_accounts','id,owner_id,account_type,is_active'),
 ('personal_balance_snapshots','id,owner_id,account_id,balance,snapshot_date,created_at'),
 ('personal_recurrences','id,owner_id,start_date,end_date,frequency,interval_count'),
 ('personal_recurrence_exclusions','owner_id,recurrence_id,occurrence_date')),
ix AS (
 SELECT t.relname tbl,i.*,ic.relname idx,
 ARRAY(SELECT att.attname::text FROM unnest(i.indkey) WITH ORDINALITY k(num,ord)
 LEFT JOIN pg_attribute att ON att.attrelid=i.indrelid AND att.attnum=k.num ORDER BY k.ord) cols,
 ARRAY(SELECT att.attname::text FROM unnest(i.indkey) k(num)
 JOIN pg_attribute att ON att.attrelid=i.indrelid AND att.attnum=k.num ORDER BY att.attname) sorted_cols
 FROM tables t JOIN pg_index i ON i.indrelid=t.oid JOIN pg_class ic ON ic.oid=i.indexrelid
),
old_unique AS (
 SELECT 'pg_constraint'::regclass::oid classid,c.oid objid,c.conname name,'constraint' kind
 FROM pg_constraint c JOIN tables t ON t.oid=c.conrelid
 WHERE t.relname='personal_savings_proposals' AND c.contype='u'
 AND ARRAY(SELECT att.attname::text FROM unnest(c.conkey) k(num)
 JOIN pg_attribute att ON att.attrelid=c.conrelid AND att.attnum=k.num ORDER BY att.attname)
 = ARRAY['destination_account_id','owner_id','source_account_id','source_month']::text[]
 UNION ALL
 SELECT 'pg_class'::regclass::oid,i.indexrelid,i.idx,'index' FROM ix i
 WHERE i.tbl='personal_savings_proposals' AND i.indisunique AND NOT i.indisprimary
 AND i.indexprs IS NULL AND i.indpred IS NULL
 AND i.sorted_cols=ARRAY['destination_account_id','owner_id','source_account_id','source_month']::text[]
),
functions AS (
 SELECT DISTINCT f.*,ns.nspname,lan.lanname FROM pg_proc f
 JOIN pg_namespace ns ON ns.oid=f.pronamespace JOIN pg_language lan ON lan.oid=f.prolang
 WHERE (ns.nspname='public' AND (
 f.proname IN ('preserve_personal_occurrence_date','mutate_personal_savings_decision')
 OR f.prosrc ~ '(personal_movements|personal_savings_proposals|personal_balance_snapshots|personal_recurrences)'))
 OR f.oid IN (SELECT tgfoid FROM pg_trigger WHERE tgrelid IN (SELECT oid FROM tables))
 OR (ns.nspname IN ('auth','pg_catalog','public','extensions')
 AND f.proname IN ('uid','gen_random_uuid','hashtextextended','pg_advisory_xact_lock'))
),
rec_dups AS (
 SELECT count(*) n, min(ref) sample_ref FROM m WHERE recurrence_id IS NOT NULL AND future_origin IS NOT NULL
 GROUP BY owner_id,recurrence_id,future_origin,kind HAVING count(*)>1
),
proposal_dups AS (
 SELECT count(*) n,min(ref) sample_ref FROM p
 GROUP BY owner_id,src,dst,month,slot HAVING count(*)>1
),
g AS (
 SELECT row_number() OVER (ORDER BY grp) ref,grp,count(*) n,
 count(DISTINCT owner_id) owners,count(DISTINCT account_id) accounts,
 count(*) FILTER(WHERE kind='transfer_out') outgoing,count(*) FILTER(WHERE kind='transfer_in') incoming,
 count(DISTINCT amount) amounts,count(DISTINCT planned) dates,count(DISTINCT status) statuses,
 count(DISTINCT coalesce(completed_date,'')) accounting_dates,
 count(*) FILTER(WHERE amount IS NULL OR owner_id IS NULL OR account_id IS NULL OR planned IS NULL OR status IS NULL) nulls,
 bool_and(status='completed') all_completed,
 min(ref) sample_movement
 FROM m WHERE grp IS NOT NULL GROUP BY grp
),
rec_rows AS (
 SELECT m.*,r.ref rec_ref,r.start_day,r.end_day,r.frequency,r.step,
 CASE WHEN r.id IS NULL THEN 'recurrence_absente'
 WHEN m.owner_id IS DISTINCT FROM r.owner_id THEN 'proprietaire_incoherent'
 WHEN m.future_origin IS NULL OR r.start_day IS NULL OR r.step IS NULL OR r.step<1
   OR r.frequency NOT IN ('weekly','monthly','quarterly','yearly') THEN 'calendrier_non_verifiable'
 WHEN m.future_origin::date<r.start_day OR (r.end_day IS NOT NULL AND m.future_origin::date>r.end_day) THEN 'hors_periode'
 WHEN r.frequency='weekly' THEN CASE WHEN (m.future_origin::date-r.start_day)%(7*r.step)=0 THEN 'sur_calendrier' ELSE 'hors_calendrier' END
 ELSE CASE WHEN (
  ((extract(year FROM m.future_origin::date)::integer-extract(year FROM r.start_day)::integer)*12
   +extract(month FROM m.future_origin::date)::integer-extract(month FROM r.start_day)::integer)
  %(r.step*CASE r.frequency WHEN 'quarterly' THEN 3 WHEN 'yearly' THEN 12 ELSE 1 END)=0
  AND extract(day FROM m.future_origin::date)=least(extract(day FROM r.start_day),
      extract(day FROM (date_trunc('month',m.future_origin::date)+interval '1 month - 1 day')))
 ) THEN 'sur_calendrier' ELSE 'hors_calendrier' END END calendar_check
 FROM m LEFT JOIN r ON r.id=m.recurrence_id WHERE m.recurrence_id IS NOT NULL
),
proposal_check AS (
 SELECT p.*,g.ref group_ref,
 ARRAY_REMOVE(ARRAY[
 CASE WHEN p.owner_id IS NULL OR p.src IS NULL OR p.dst IS NULL OR p.month IS NULL THEN 'cle_nulle' END,
 CASE WHEN p.src=p.dst THEN 'meme_compte' END,
 CASE WHEN p.slot IS NULL OR p.slot NOT IN ('0','1','15') THEN 'creneau_incompatible' END,
 CASE WHEN p.month IS NOT NULL AND p.month::date<>date_trunc('month',p.month::date)::date THEN 'mois_non_premier_jour' END,
 CASE WHEN p.status IS NULL OR p.status NOT IN ('pending','accepted','deleted') THEN 'statut_inattendu' END,
 CASE WHEN p.amount IS NULL OR p.amount::text IN ('NaN','Infinity','-Infinity') OR p.amount<0
    OR (p.status IN ('accepted','pending') AND p.amount<=0) THEN 'montant_incompatible' END,
 CASE WHEN p.status='accepted' AND p.grp IS NULL THEN 'acceptee_sans_groupe' END,
 CASE WHEN p.grp IS NOT NULL AND (g.grp IS NULL OR g.n<>2 OR g.outgoing<>1 OR g.incoming<>1
 OR g.owners<>1 OR g.accounts<>2 OR g.amounts<>1 OR g.dates<>1 OR g.statuses<>1 OR g.nulls<>0) THEN 'groupe_incomplet_ou_incoherent' END,
 CASE WHEN p.status='accepted' AND g.all_completed IS DISTINCT FROM true THEN 'acceptee_non_pointee' END,
 CASE WHEN p.status IN ('pending','deleted') AND p.grp IS NOT NULL THEN 'non_acceptee_avec_groupe' END,
 CASE WHEN p.grp IS NOT NULL AND EXISTS (SELECT 1 FROM m WHERE m.grp=p.grp AND
  (m.owner_id IS DISTINCT FROM p.owner_id OR m.amount IS DISTINCT FROM p.amount
   OR (m.kind='transfer_out' AND m.account_id IS DISTINCT FROM p.src)
   OR (m.kind='transfer_in' AND m.account_id IS DISTINCT FROM p.dst))) THEN 'groupe_different_de_la_decision' END,
 CASE WHEN NOT EXISTS(SELECT 1 FROM a src JOIN a dst ON true
  WHERE src.j->>'id'=p.src AND dst.j->>'id'=p.dst
  AND src.j->>'owner_id'=p.owner_id AND dst.j->>'owner_id'=p.owner_id
  AND src.j->>'is_active'='true' AND dst.j->>'is_active'='true'
  AND ((src.j->>'account_type'='checking' AND dst.j->>'account_type'='savings')
    OR (src.j->>'account_type'='savings' AND dst.j->>'account_type'='checking')))
 THEN 'comptes_non_admissibles_pour_la_rpc' END
 ],NULL) problems
 FROM p LEFT JOIN g ON g.grp=p.grp
),
report AS (
 SELECT '00_contexte' section,jsonb_build_object(
 'role',current_user,'version',current_setting('server_version'),
 'lecture_complete_attendue',coalesce((SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname=current_user),false),
 'avertissement','Un résultat sans anomalie ne certifie pas les corps de fonctions masqués ni les anciennes dates perdues. Les montants, UUID et libellés ne sont pas exportés.',
 'tables', (SELECT jsonb_object_agg(name,to_regclass('public.'||name) IS NOT NULL) FROM names),
 'lignes_visibles',jsonb_build_object('movements',(SELECT count(*) FROM m),'proposals',(SELECT count(*) FROM p),
 'recurrences',(SELECT count(*) FROM r),'snapshots',(SELECT count(*) FROM snap),'accounts',(SELECT count(*) FROM a))) details
 UNION ALL
 SELECT '01_colonnes',coalesce(jsonb_agg(jsonb_build_object('table',t.relname,'colonne',at.attname,
 'type',format_type(at.atttypid,at.atttypmod),'not_null',at.attnotnull,'identity',at.attidentity,'generated',at.attgenerated,
 'default_masque',regexp_replace(pg_get_expr(d.adbin,d.adrelid),$rx$'(?:[^']|'')*'$rx$,'<texte masque>','g')) ORDER BY t.relname,at.attnum),'[]'::jsonb)
 FROM tables t JOIN pg_attribute at ON at.attrelid=t.oid AND at.attnum>0 AND NOT at.attisdropped
 LEFT JOIN pg_attrdef d ON d.adrelid=t.oid AND d.adnum=at.attnum
 UNION ALL
 SELECT '02_colonnes_requises_manquantes',coalesce(jsonb_agg(jsonb_build_object('table',q.tbl,'colonne',col)),'[]'::jsonb)
 FROM required q CROSS JOIN LATERAL unnest(string_to_array(q.cols,',')) col
 WHERE NOT EXISTS(SELECT 1 FROM tables t JOIN pg_attribute at ON at.attrelid=t.oid
 WHERE t.relname=q.tbl AND at.attname=col AND at.attnum>0 AND NOT at.attisdropped)
 UNION ALL
 SELECT '03_contraintes',coalesce(jsonb_agg(jsonb_build_object('table',t.relname,'nom',c.conname,'type',c.contype,
 'validee',c.convalidated,'deferrable',c.condeferrable,'differee',c.condeferred,
 'definition_masquee',regexp_replace(pg_get_constraintdef(c.oid,true),$rx$'(?:[^']|'')*'$rx$,'<texte masque>','g'),
 'statuts_mentions', (SELECT jsonb_agg(v) FROM unnest(ARRAY['planned','completed','cancelled','pending','accepted','deleted']) v
 WHERE strpos(pg_get_constraintdef(c.oid),quote_literal(v))>0)) ORDER BY t.relname,c.conname),'[]'::jsonb)
 FROM tables t JOIN pg_constraint c ON c.conrelid=t.oid
 UNION ALL
 SELECT '04_index',coalesce(jsonb_agg(jsonb_build_object('table',tbl,'nom',idx,'colonnes',cols,
 'unique',indisunique,'primaire',indisprimary,'valide',indisvalid,'pret',indisready,
 'definition_masquee',regexp_replace(pg_get_indexdef(indexrelid),$rx$'(?:[^']|'')*'$rx$,'<texte masque>','g')) ORDER BY tbl,idx),'[]'::jsonb) FROM ix
 UNION ALL
 SELECT '05_rls_tables',coalesce(jsonb_agg(jsonb_build_object('table',relname,'rls',relrowsecurity,'force_rls',relforcerowsecurity,
 'proprietaire',pg_get_userbyid(relowner))),'[]'::jsonb) FROM tables
 UNION ALL
 SELECT '06_policies',coalesce(jsonb_agg(jsonb_build_object('table',t.relname,'nom',pol.polname,'commande',pol.polcmd,
 'permissive',pol.polpermissive,'roles',(SELECT jsonb_agg(CASE WHEN x=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x) END) FROM unnest(pol.polroles) x),
 'using_masque',regexp_replace(pg_get_expr(pol.polqual,pol.polrelid),$rx$'(?:[^']|'')*'$rx$,'<texte masque>','g'),
 'check_masque',regexp_replace(pg_get_expr(pol.polwithcheck,pol.polrelid),$rx$'(?:[^']|'')*'$rx$,'<texte masque>','g'))),'[]'::jsonb)
 FROM tables t JOIN pg_policy pol ON pol.polrelid=t.oid
 UNION ALL
 SELECT '07_privileges_roles',coalesce(jsonb_agg(jsonb_build_object('table',t.relname,'role',ro.rolname,
 'select',has_table_privilege(ro.oid,t.oid,'SELECT'),'insert',has_table_privilege(ro.oid,t.oid,'INSERT'),
 'update',has_table_privilege(ro.oid,t.oid,'UPDATE'),'delete',has_table_privilege(ro.oid,t.oid,'DELETE'),
 'usage_schema',has_schema_privilege(ro.oid,t.relnamespace,'USAGE'))),'[]'::jsonb)
 FROM tables t CROSS JOIN pg_roles ro WHERE ro.rolname IN ('anon','authenticated','service_role')
 UNION ALL
 SELECT '08_triggers',coalesce(jsonb_agg(jsonb_build_object('table',t.relname,'nom',tr.tgname,'actif',tr.tgenabled,
 'interne',tr.tgisinternal,'fonction',tr.tgfoid::regprocedure::text,
 'definition_masquee',regexp_replace(pg_get_triggerdef(tr.oid,true),$rx$'(?:[^']|'')*'$rx$,'<texte masque>','g'))),'[]'::jsonb)
 FROM tables t JOIN pg_trigger tr ON tr.tgrelid=t.oid
 UNION ALL
 SELECT '09_fonctions_rpc',coalesce(jsonb_agg(jsonb_build_object('signature',f.oid::regprocedure::text,
 'retour',pg_get_function_result(f.oid),'langage',f.lanname,'security_definer',f.prosecdef,'volatilite',f.provolatile,
 'proprietaire',pg_get_userbyid(f.proowner),'corps_masque',true,
 'search_path_configure',EXISTS(SELECT 1 FROM unnest(f.proconfig) cfg WHERE cfg LIKE 'search_path=%'),
 'execute_roles',(SELECT jsonb_object_agg(ro.rolname,has_function_privilege(ro.oid,f.oid,'EXECUTE')) FROM pg_roles ro WHERE ro.rolname IN ('anon','authenticated','service_role')))
 ORDER BY f.nspname,f.proname),'[]'::jsonb) FROM functions f
 UNION ALL
 SELECT '10_dependances_anciennes_unicites',coalesce(jsonb_agg(jsonb_build_object('cible',u.name,'type_cible',u.kind,
 'dependance',CASE WHEN d.objid IS NOT NULL THEN pg_describe_object(d.classid,d.objid,d.objsubid) END,'type_dependance',d.deptype)),'[]'::jsonb)
 FROM old_unique u LEFT JOIN pg_depend d ON d.refclassid=u.classid AND d.refobjid=u.objid
 UNION ALL
 SELECT '11_statuts_types_reels',coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) FROM (
 SELECT 'movements' origine,status,kind,count(*) nombre FROM m GROUP BY status,kind
 UNION ALL SELECT 'proposals',status,'slot='||coalesce(slot,'NULL'),count(*) FROM p GROUP BY status,slot
 ) x
 UNION ALL
 SELECT '12_doublons_futures_cles',jsonb_build_object(
 'groupes_recurrences',(SELECT count(*) FROM rec_dups),'lignes_recurrences',(SELECT coalesce(sum(n),0) FROM rec_dups),
 'exemples_recurrences',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) FROM (SELECT sample_ref AS mouvement_ref,n FROM rec_dups ORDER BY sample_ref LIMIT 30) x),
 'groupes_decisions',(SELECT count(*) FROM proposal_dups),'lignes_decisions',(SELECT coalesce(sum(n),0) FROM proposal_dups))
 UNION ALL
 SELECT '13_recurrences_materialisees',jsonb_build_object(
 'total',(SELECT count(*) FROM rec_rows),
 'par_diagnostic',(SELECT jsonb_object_agg(calendar_check,n) FROM (SELECT calendar_check,count(*) n FROM rec_rows GROUP BY calendar_check) x),
 'identite_deja_distincte_date',(SELECT count(*) FROM rec_rows WHERE origin IS NOT NULL AND origin<>planned),
 'sans_identite_historique',(SELECT count(*) FROM rec_rows WHERE origin IS NULL),
 'pointage_dans_autre_mois',(SELECT count(*) FROM rec_rows WHERE completed_date IS NOT NULL AND left(completed_date,7)<>left(planned,7)),
 'exemples_a_examiner',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) FROM (
 SELECT ref AS mouvement_ref,rec_ref AS recurrence_ref,status,planned AS date_prevue,origin AS date_origine,completed_date AS date_comptable,calendar_check
 FROM rec_rows WHERE calendar_check<>'sur_calendrier' OR origin IS DISTINCT FROM planned
 ORDER BY ref LIMIT 30) x),
 'limite','Hors calendrier = indice, pas preuve de déplacement. Un déplacement vers une autre échéance valide est indétectable sans historique.')
 UNION ALL
 SELECT '14_virements',jsonb_build_object('groupes',(SELECT count(*) FROM g),
 'anormaux',(SELECT count(*) FROM g WHERE n<>2 OR owners<>1 OR accounts<>2 OR outgoing<>1 OR incoming<>1 OR amounts<>1 OR dates<>1 OR statuses<>1 OR accounting_dates<>1 OR nulls<>0),
 'jambes_sans_groupe',(SELECT count(*) FROM m WHERE kind IN ('transfer_in','transfer_out') AND grp IS NULL),
 'exemples',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) FROM (
 SELECT ref AS groupe_ref,n AS jambes,owners AS proprietaires,accounts AS comptes,outgoing,incoming,amounts AS montants_distincts,dates AS dates_distinctes,statuses AS statuts_distincts,accounting_dates,nulls,sample_movement
 FROM g WHERE n<>2 OR owners<>1 OR accounts<>2 OR outgoing<>1 OR incoming<>1 OR amounts<>1 OR dates<>1 OR statuses<>1 OR accounting_dates<>1 OR nulls<>0 ORDER BY ref LIMIT 30) x),
 'attention','Une jambe PERSO seule peut représenter un transfert vers COMMUN, à distinguer d’une paire interne cassée.')
 UNION ALL
 SELECT '15_decisions_historiques',jsonb_build_object(
 'anomalies',(SELECT count(*) FROM proposal_check WHERE cardinality(problems)>0),
 'par_diagnostic',(SELECT jsonb_object_agg(problem,n) FROM (SELECT problem,count(*) n FROM proposal_check CROSS JOIN LATERAL unnest(problems) problem GROUP BY problem) x),
 'exemples',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) FROM (SELECT ref AS proposition_ref,month,status,slot,group_ref,problems FROM proposal_check WHERE cardinality(problems)>0 ORDER BY ref LIMIT 30) x),
 'historiques_mensuelles_acceptees_ou_supprimees',(SELECT count(*) FROM p WHERE slot='0' AND status IN ('accepted','deleted')),
 'groupes_partages_par_plusieurs_decisions',(SELECT count(*) FROM (SELECT grp FROM p WHERE grp IS NOT NULL GROUP BY grp HAVING count(*)>1) x),
 'mois_melangeant_legacy_et_nouveaux_creneaux',(SELECT count(*) FROM (SELECT owner_id,src,dst,month FROM p GROUP BY owner_id,src,dst,month HAVING bool_or(slot='0') AND bool_or(slot IN ('1','15'))) x))
 UNION ALL
 SELECT '16_integrite_mouvements',jsonb_build_object(
 'cles_nulles',(SELECT count(*) FROM m WHERE owner_id IS NULL OR account_id IS NULL OR id IS NULL),
 'statuts_inattendus',(SELECT count(*) FROM m WHERE status IS NULL OR status NOT IN ('planned','completed','cancelled')),
 'types_inattendus',(SELECT count(*) FROM m WHERE kind IS NULL OR kind NOT IN ('income','expense','transfer_in','transfer_out')),
 'montants_non_valides',(SELECT count(*) FROM m WHERE amount IS NULL OR amount<0 OR amount::text IN ('NaN','Infinity','-Infinity')),
 'date_prevue_nulle',(SELECT count(*) FROM m WHERE planned IS NULL),
 'comptes_absents_ou_autre_proprietaire',(SELECT count(*) FROM m WHERE NOT EXISTS(SELECT 1 FROM a WHERE a.j->>'id'=m.account_id AND a.j->>'owner_id'=m.owner_id)),
 'pointes_sans_date_comptable',(SELECT count(*) FROM m WHERE status='completed' AND completed_date IS NULL AND completed_at IS NULL),
 'identite_sans_recurrence',(SELECT count(*) FROM m WHERE origin IS NOT NULL AND recurrence_id IS NULL),
 'recurrences_materialisees_et_exclues',(SELECT count(*) FROM m WHERE recurrence_id IS NOT NULL AND EXISTS(SELECT 1 FROM e WHERE e.j->>'recurrence_id'=m.recurrence_id AND e.j->>'occurrence_date'=m.future_origin)),
 'doublons_sources',(SELECT count(*) FROM (SELECT owner_id,j->>'source_type',j->>'source_key' FROM m WHERE j->>'source_type' IS NOT NULL AND j->>'source_key' IS NOT NULL GROUP BY owner_id,j->>'source_type',j->>'source_key' HAVING count(*)>1) x))
 UNION ALL
 SELECT '17_snapshots_et_fonds',jsonb_build_object(
 'snapshots_incomplets',(SELECT count(*) FROM snap WHERE j->>'id' IS NULL OR j->>'owner_id' IS NULL OR j->>'account_id' IS NULL OR j->>'balance' IS NULL OR j->>'snapshot_date' IS NULL OR j->>'created_at' IS NULL),
 'snapshots_futurs',(SELECT count(*) FROM snap WHERE (j->>'snapshot_date')::date>(current_timestamp AT TIME ZONE 'Europe/Paris')::date),
 'snapshots_depart_ambigus',(SELECT count(*) FROM (SELECT j->>'owner_id',j->>'account_id',j->>'snapshot_date',j->>'created_at' FROM snap GROUP BY 1,2,3,4 HAVING count(*)>1) x),
 'comptes_epargne_sans_snapshot',(SELECT count(*) FROM a WHERE j->>'account_type'='savings' AND NOT EXISTS(SELECT 1 FROM snap WHERE snap.j->>'account_id'=a.j->>'id' AND snap.j->>'owner_id'=a.j->>'owner_id')))
)
SELECT section,details FROM report ORDER BY section;
