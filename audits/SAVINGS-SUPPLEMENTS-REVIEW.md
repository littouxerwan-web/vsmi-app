# Compléments d’épargne — préparation locale, non publiée

## Comportement

Un virement déjà accepté et pointé reste inchangé. Un besoin résiduel peut produire une nouvelle proposition « Complément d’épargne proposé », avec deux jambes virtuelles de même montant. L’identité de ce complément est `(owner_id, decision_id, previous_transfer_group_id)` : elle ne dépend ni de la date affichée ni du montant.

Le nouveau moteur ne propose un complément que si la paire précédente est présente, complète, pointée et non future. Une paire encore prévue ou incohérente reste signalée sans générer de complément automatique. Les propositions normales du 1er/15 et les virements COMMUN ne sont pas modifiés.

- Modifier une proposition ajuste uniquement le complément non accepté.
- Supprimer une proposition conserve un statut `deleted` : aucun recalcul ne la recrée.
- Accepter crée une nouvelle paire atomique. Les appels répétés sont idempotents.
- Une fois le complément accepté, un besoin ultérieur peut produire un autre complément, rattaché à cette nouvelle paire.
- Un complément accepté est conservé par cette RPC : elle refuse sa modification/suppression. Les mouvements effectifs restent gérables par les fonctions habituelles des mouvements.
- Sans la nouvelle table, le chargement conserve le comportement existant ; les compléments automatiques restent désactivés. Une autre erreur de chargement n’est jamais ignorée.

## Fichiers principaux

- `supabase/migrations/20261019093000_personal_savings_supplements.sql` : nouvelle table, index, policy propriétaire et RPC SECURITY INVOKER. Aucun backfill, aucune modification d’une table existante, aucune modification des anciennes décisions ou des mouvements historiques.
- `src/lib/perso/reliable-projection-engine.ts` : chaîne de compléments, protection contre les doublons, prise en compte des compléments projetés.
- `src/lib/perso/savings-supplements.ts` : chargement paginé limité au propriétaire.
- Pages PERSO/Aujourd’hui, Projection et actions serveur : chargement et identité séparée, RPC dédiée.

## Avant production

1. Exécuter uniquement `audits/savings-supplements-preflight.sql` dans le SQL Editor et faire examiner son résultat. Il s’agit exclusivement d’un SELECT de métadonnées.
2. Vérifier notamment les colonnes requises, types monétaires, droits, policies et triggers réels. Les noms de la table, des index et de la fonction doivent être disponibles.
3. Après validation de ce contrôle, exécuter manuellement la migration additive dans sa transaction. Ne pas réexécuter les anciennes migrations.
4. Vérifier la table vide, les droits (aucun accès anon), la RLS, les index et la fonction invoker. Publier ensuite le code et tester l’interface sans enregistrer de mouvement réel involontairement.

Aucune exécution en production, aucun commit/push/déploiement effectué dans cette préparation.

## Validation locale

89 tests Node (moteur, actions RPC, formulaires, pagination). TypeScript, `git diff --check` et build webpack.

Exécution réelle dans PostgreSQL 17.6, image Supabase déjà installée, conteneur `vsmi-savings-supplement-test-20261019`, isolé du réseau, sans volume hôte ni données réelles. Nouvelle migration exécutée avec succès dans une base dédiée `supplements_v2`.

Scripts reproductibles, **uniquement en base jetable vide** :
1. `tests/postgres/savings-supplements-fixture.sql`
2. migration `20261019093000_personal_savings_supplements.sql`
3. `tests/postgres/savings-supplements-checks.sql`
4. `python3 tests/postgres/run-supplement-concurrency.py` (nom du conteneur et base de test explicitement fixés).

Contrôles réussis : pending/accept/delete, double acceptation, deuxième complément, suppression persistante, rejet d’un groupe appartenant à une autre décision, fonds insuffisants, conservation des historiques, absence de droits anon, isolation de lecture/RPC entre propriétaires, rollback de la première jambe lorsqu’une erreur est forcée sur la seconde, deux appels concurrents sur la même identité, deux retraits concurrents au-delà du disponible (un seul autorisé).

Limite : le schéma préalable et les policies des tables historiques sont des fixtures synthétiques. Ces tests valident PostgreSQL et la nouvelle RPC, pas la compatibilité avec tous les triggers/policies de production. Le contrôle préalable de production reste obligatoire.

## Retour arrière

Revenir d’abord au code précédent : les virements déjà créés restent de vrais mouvements et continuent d’être comptés. Conserver la nouvelle table afin de préserver les décisions et les suppressions. Ne pas supprimer les mouvements ou les compléments pour revenir à l’ancien affichage. La suppression technique de la table/fonction ne doit être envisagée que si la table est encore vide et après contrôle des dépendances ; aucun script destructif automatique n’est fourni.
