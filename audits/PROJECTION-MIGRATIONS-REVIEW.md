# Revue finale locale des migrations Projection

Aucune migration exécutée, aucune connexion ni écriture de production. Seuls les deux fichiers SQL locaux ont été renforcés ; aucun code applicatif modifié pendant cette revue.

## Portée de la validation

Les résultats transmis établissent : 366 mouvements, 54 occurrences matérialisées sur calendrier, 0 doublon sur les nouvelles clés, 21 groupes dont 4 à une jambe PERSO↔COMMUN, 5 décisions legacy (3 accepted, 2 deleted). Les résultats détaillés du premier audit concernant types, CHECK, policies, ACL, triggers et dépendances n'ont pas été transmis dans la conversation. Leur compatibilité ne peut donc pas être certifiée ici. PostgreSQL/psql et un parseur PL/pgSQL ne sont pas disponibles localement : revue statique, pas de validation d'exécution SQL.

## Fichiers et ordre obligatoire

1. `supabase/migrations/20260928090000_projection_stable_identities.sql`
2. `supabase/migrations/20260928090100_projection_savings_decisions.sql`

Exécuter les fichiers complets individuellement, dans cet ordre. Ne pas lancer une commande qui appliquerait toutes les migrations historiques du dépôt : leur correspondance à la production n'est pas établie. Chaque fichier contient sa propre transaction ; ils ne forment pas ensemble une transaction unique. Ne pas activer le nouveau code avant validation de la seconde migration. Suspendre les écritures applicatives pendant l'opération et les comparaisons avant/après.

### Migration 1

Ajoute occurrence_date, vérifie en transaction que chaque mouvement récurrent à reprendre appartient au calendrier actuel et au même propriétaire, puis copie exclusivement movement_date. Crée le trigger d'identité stable et l'index unique owner/récurrence/occurrence/type. Ajoute decision_slot=0 aux propositions historiques, remplace seulement les unicités exactes owner/source/destination/mois par l'unicité incluant le créneau et autorise 0/1/15. Ni montant, ni statut, ni date comptable n'est modifié par les instructions de migration. Les effets de triggers préexistants restent à examiner.

Les 54 lignes reçoivent occurrence_date=movement_date si la base est inchangée. Basic fit Manon garde l'échéance prévue comme identité ; sa date de pointage reste indépendante. Il s'agit de figer l'identité actuellement représentée dans les données, pas de prétendre retrouver une ancienne date perdue. Un déplacement ancien vers une autre échéance valide reste indétectable. Si la preuve de l'absence de tout déplacement historique est exigée, il faut un historique/sauvegarde avant application ; ce backfill seul ne fournit pas cette preuve.

L'index de récurrence ne porte pas sur transfer_group_id. Les quatre jambes PERSO↔COMMUN ne bloquent donc pas sa création. Les 0 doublons rapportés rendent les deux nouvelles unicités compatibles avec les lignes auditées ; les contraintes seront à nouveau contrôlées lors de leur création.

### Migration 2

Crée la RPC transactionnelle, SECURITY INVOKER, propriétaire courant via auth.uid(), filtres owner explicites, recherche pg_catalog avant public, EXECUTE révoqué pour PUBLIC/anon puis accordé à authenticated. Ne change pas les policies ni les données lors de son installation.

Les décisions legacy accepted/deleted au créneau 0 conservent leur portée mensuelle. La RPC refuse de les remplacer par une nouvelle décision de créneau sur le même couple de comptes/mois. Pas de conversion arbitraire vers 1 ou 15.

### Renforcements depuis la première version

- Verrous transactionnels sur les données du backfill et timeout de verrou de 5 secondes.
- Contrôle bloquant du calendrier actuel avant backfill ; completed_date/completed_at jamais utilisés comme identité.
- Créations sans IF NOT EXISTS / OR REPLACE : état partiellement installé ou collision de noms = arrêt, pas acceptation silencieuse ni conservation d'ACL inattendues.
- Droits publics retirés à la fonction de trigger ; elle n'est pas une RPC ouverte.
- Dépendances minimales de la migration 1 explicitement vérifiées au début de la migration 2.
- Validation des paramètres et refus des montants arrondis à zéro.
- Avant modification/suppression d'une décision acceptée : verrouillage et vérification de ses deux jambes, sens, comptes, montants, statut, dates et absence de partage du groupe avec une autre décision du propriétaire.
- Contrôle du nombre de lignes réellement modifiées et du résultat final. Une anomalie RLS/trigger provoque une exception et le rollback de l'appel entier.

## Transferts PERSO↔COMMUN

Le code `createTransfer` dans `src/app/(app)/perso/actions.ts` crée l'écriture COMMUN sans transfer_group_id puis un UUID de groupe uniquement pour PERSO. L'absence de correspondance par groupe dans COMMUN est donc expliquée par le code existant. Ce constat ne prouve pas individuellement que l'autre écriture existe encore.

Le moteur accepte une seule jambe PERSO d'un groupe comme flux externe ; les mouvements déjà completed sont intégrés au solde de départ et ne sont pas reprojetés. Il ne les répare ni ne les supprime. Cette tolérance signifie qu'il ne peut pas distinguer avec certitude une véritable paire PERSO cassée d'un transfert externe à une jambe sans métadonnée de liaison supplémentaire.

Aucune des migrations ne lit ou ne modifie les données COMMUN. La RPC d'épargne ne recherche pas tous les groupes historiques : elle traite uniquement le groupe explicitement lié à sa décision. Un groupe à une seule jambe est refusé avant toute mutation. Aucun rattrapage COMMUN n'est prévu.

## Contrôles immédiatement avant

1. Sauvegarde/export restaurable du schéma (contraintes, index, ACL, policies, fonctions, triggers) et des tables affectées ; conserver les résultats d'audit. Une empreinte ne remplace pas une sauvegarde.
2. Rejouer `audits/projection-production-readonly.sql`. Examiner particulièrement les colonnes/types, contraintes (notamment amount=0 permis pour deleted), RLS/policies, droits authenticated, triggers et dépendances des anciennes unicités. Pas de dépendance bloquante, pas d'objet homonyme préexistant des nouvelles colonnes/index/fonctions/trigger. Reprendre aussi les sections additionnelles 18–20 de l'audit fourni dans la conversation si des objets ont changé.
3. Exécuter `audits/projection-migration-checks.sql`, enregistrer tout le résultat. Attendu sur la base inchangée : 366 mouvements, 54 récurrents sans identité, 0 doublon, 5 propositions aux statuts 3 accepted/2 deleted avec créneau absent, 21 groupes dont 4 à une jambe.
4. Confirmer que les comptes/propriétaires, les trois décisions acceptées et leurs paires sont cohérents et que les snapshots ne présentent pas d'anomalie. La validation des fonds de la RPC dépend de ces snapshots.
5. Tester les deux fichiers sur une copie locale/de test avec le vrai schéma, notamment RLS de deux propriétaires, acceptation concurrente, refus de groupe externe/incomplet, erreur sur une jambe et rollback intégral. Les tests applicatifs existants ne remplacent pas ce test SQL.

## Contrôles immédiatement après, avant reprise des écritures

Exécuter à nouveau `audits/projection-migration-checks.sql` :
- toujours 366 mouvements, 54 récurrents ; 0 identité absente ; 54 identités égales à movement_date ; aucune identité sur un mouvement non récurrent ; 0 doublon ;
- 5 décisions, toujours 3 accepted/2 deleted, toutes slot 0 ;
- toujours 21 groupes dont 4 à une jambe ; empreinte COMMUN inchangée ;
- empreintes des mouvements hors occurrence_date et des propositions hors decision_slot inchangées. Si un trigger updated_at préexistant les change, l'expliquer avec un diff contrôlé avant de valider ;
- deux index présents, uniques et valides, avec les bonnes colonnes/prédicat ; trigger identité actif ;
- RPC SECURITY INVOKER, EXECUTE authenticated=true et anon/PUBLIC=false ; fonction trigger non exposée ; RLS inchangée.

Rejouer également l'audit de métadonnées : ancienne unicité mensuelle supprimée uniquement sur les quatre colonnes prévues ; unicité à cinq colonnes présente ; CHECK decision_slot 0/1/15 ; policies et autres contraintes/index inchangés (notamment personal_movements_source_uidx). Ne pas tester les mutations RPC sur de vraies données de production pour ces contrôles.

## Rollback et limites de sécurité

Avant COMMIT, toute erreur annule le fichier concerné (si l'éditeur conserve une transaction en échec, la terminer avant une nouvelle tentative). Après COMMIT, aucun rollback magique : si la seconde migration échoue, la première reste appliquée. Suspendre la bascule applicative, ne pas relancer la première à l'aveugle.

Après installation sans nouvelles écritures, un retour au schéma précédent doit restaurer les définitions exactes sauvegardées et supprimer uniquement les objets introduits. Aucun script destructeur générique n'est fourni sans ces définitions. Après création de décisions 1 et 15, rétablir l'ancienne unicité peut échouer ; supprimer decision_slot/occurrence_date ferait perdre les identités. Il faut une procédure de restauration ou de rapprochement explicitement approuvée.

Le verrou advisory sérialise les appels de cette RPC entre eux, pas toutes les autres écritures possibles de l'application. Le contrôle des fonds n'est donc pas une contrainte bancaire globale contre des mutations directes concurrentes ; l'égalité débit/crédit de la paire reste transactionnelle. Les policies/ACL/triggers réels doivent être revus et testés : aucune certification complète de sécurité sur le seul résumé d'audit reçu.
