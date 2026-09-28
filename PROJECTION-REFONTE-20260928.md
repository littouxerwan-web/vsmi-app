# Refonte Projection — 28 septembre 2026

## Règles et corrections

- `buildReliableProjection` produit `budgetStatements` via `buildBudgetStatements` : enveloppe, réalisé, engagé, reliquat non engagé, dépassement, futur total. Les cartes et le contrôle affichent ces mêmes objets. Le filtre de compte n’intervient pas dans ce calcul.
- Réalisé : mouvements `completed` à date, date `completed_date`, sinon jour Paris de `completed_at`, sinon `movement_date` pour les données historiques. Engagé : flux non réalisés à leur date effective de projection. Annulés ignorés financièrement mais conservés pour supprimer les occurrences virtuelles correspondantes.
- Reliquat = max(0, enveloppe − réalisé − engagé), futur = engagé + reliquat. Aucun report entre mois. Le reliquat est distribué sur les jours restants en centimes, sans perte d’arrondi. Une opération déjà réalisée est présente uniquement dans le solde de départ et le réalisé budgétaire.
- Les virements ne consomment pas de budget. Une paire interne est appliquée ensemble. Une sortie d’épargne insuffisante réduit les deux jambes au même montant réellement disponible, affiché dans les opérations. Une paire incohérente est signalée et n’est pas appliquée partiellement.
- Une vraie dépense d’épargne reste intégrale : le déficit est visible (règle confirmée par l’utilisateur). Les protections et allocations existantes de `savingsAvailabilityForAccount` restent utilisées par les propositions automatiques : plancher de 30 €, projets protégés, fonds libres et récupérables.
- Les décisions d’épargne utilisent une identité compte source/destination/mois/créneau 1 ou 15, indépendante de leur date effective. Le créneau courant est évalué même après le 15. Les suppressions sont conservées. Les anciennes décisions mensuelles acceptées/supprimées gardent leur portée mensuelle (`decision_slot = 0`).
- Le minimum et les risques utilisent la trajectoire après chaque événement (chaque virement étant indivisible), pas les seules clôtures mensuelles. À date égale, l’ordre est déterministe ; les données n’ont pas d’heure de débit prévue.
- Les récurrences utilisent une date d’occurrence d’origine distincte de leur date éditable. Déplacement, pointage et suppression utilisent cette identité. Les échéances mensuelles restent ancrées au jour initial : 31 janvier → 28 février → 31 mars.
- Le serveur transmet son jour Paris au composant Projection ; aucun « aujourd’hui » figé au chargement du module. Une page laissée ouverte doit être actualisée au changement de jour.
- Une modification sans champ d’exclusion conserve `exclude_from_analysis`. Ce drapeau continue de concerner l’analyse statistique, pas la réalité des flux de trésorerie ni la consommation d’une enveloppe.
- Le simulateur d’achat appelle le même moteur ; ses comparaisons de dates échantillonnent le 1er, le 15 et la fin des mois, sans prétendre explorer chaque jour.
- ENFANTS reste indépendant : aucune modification du générateur ni des tables sources. PHOTO conserve sa date d’encaissement lorsqu’aucun pointage PERSO ne la remplace ; URSSAF et les overrides restent intégrés une fois.

## Migrations préparées, non exécutées

1. `supabase/migrations/20260928090000_projection_stable_identities.sql` : `personal_movements.occurrence_date`, trigger préservant l’identité, index unique owner/récurrence/occurrence/type ; `personal_savings_proposals.decision_slot`, unicité incluant ce créneau au lieu de l’ancienne unicité mensuelle.
2. `supabase/migrations/20260928090100_projection_savings_decisions.sql` : RPC transactionnelle authentifiée sous RLS. Proposition et deux jambes sont acceptées/modifiées/supprimées ensemble ; verrou par propriétaire ; contrôle des fonds disponibles lors d’une utilisation réelle ; refus d’une décision supprimée ou d’un historique incohérent.

**Ne pas utiliser les nouvelles actions contre le schéma ancien.** Les nouvelles requêtes ont besoin des nouvelles colonnes et la mutation d’épargne a besoin de la RPC. Aucun test de ces migrations sur un PostgreSQL réel n’a été exécuté ici.

Avant toute application : inspecter le schéma réel de ces tables, les RLS, les contraintes/index existants, les doublons par owner/récurrence/date/type, les groupes de virements incomplets et les décisions historiques. Vérifier également l’absence de dépendances externes aux anciennes contraintes d’unicité.

Une occurrence déplacée *avant* cette refonte peut avoir perdu sa date d’origine. Le backfill proposé ne peut deviner cette date : il reprend `movement_date`. Ces occurrences doivent être identifiées et rapprochées de leur échéance originale avant d’appliquer la migration. Aucun rapprochement automatique ni suppression de doublons n’a été effectué. L’index bloque l’application en cas de doublons au lieu de les fusionner silencieusement.

Valider ensuite sur une base locale/de test : application des migrations dans cet ordre, isolation des propriétaires sous RLS, acceptations concurrentes, rollback complet sur erreur d’une jambe, conservation des suppressions, mise à jour des propositions acceptées et restauration/sauvegarde. Les tests Node vérifient le moteur et la frontière RPC, pas l’exécution PL/pgSQL.

## Pagination : risque identifié, chargement non refondu

Les pages PERSO et Aujourd’hui chargent plusieurs tables avec `select` sans pagination exhaustive. La limite effective du serveur Supabase n’a pas été interrogée. Si elle est atteinte, des mouvements, exclusions, décisions ou snapshots peuvent manquer : réalisé sous-estimé, solde faux, paire incomplète, récurrence/proposition supprimée réapparente.

Travail à prévoir séparément : chargeur partagé avec tri stable incluant une clé unique et pagination exhaustive (ou curseur), erreurs remontées et complétude contrôlée ; chargement de toutes les traces d’identité nécessaires ; restriction temporelle uniquement après prise en compte des dates comptables et des occurrences déplacées. Tester avec plus d’une page de chaque table, dates identiques, dernière page pleine et modification concurrente. Si une cohérence de lecture atomique est nécessaire, exposer une lecture transactionnelle côté SQL plutôt que supposer plusieurs requêtes synchronisées. Augmenter seulement la limite ne résout pas durablement ce problème.

## Tests et contrôles

`npm test` : 52 tests, incluant les 10 tests ENFANTS préexistants. Couverture : budgets vierges/partiels/pleins/dépassés, réalisé + engagé, multi-opérations/comptes/filtres, changement de mois et non-report, statuts et exclusions, récurrences matérialisées/déplacées/annulées/supprimées en retard, 29/30/31 et février bissextile, virements insuffisants et ordres inversés, dépenses d’épargne déficitaires, besoins avant/après le 15, suppressions, creux intramensuel, PHOTO/URSSAF/ENFANTS, calendrier Paris, rendu réel des deux cartes, frontière transactionnelle des actions d’épargne.

L’invariant de conservation vérifie 100 scénarios déterministes, l’égalité débit/crédit des paires et la réconciliation ouverture + flux = clôture. Aucun réseau n’est utilisé par les tests.

Contrôles : TypeScript (`npm run typecheck`), `npm test`, `git diff --check`, build (`npm run build -- --webpack`). Aucun script/configuration lint dans ce dépôt ; pas d’ajout d’outillage sans rapport avec la refonte.

## Fichiers concernés

- Moteur : `src/lib/perso/budget-engine.ts`, `calendar.ts` (nouveau), `reliable-projection-engine.ts`, `savings-engine.ts` (type de décision).
- Composants : `src/components/perso/budget-statements.tsx` (nouveau), `projection-view.tsx`, `monthly-operations.tsx`, `savings-proposal-card.tsx`.
- Serveur : `src/app/(app)/perso/page.tsx`, `actions.ts`, `src/app/(app)/aujourd-hui/page.tsx`.
- Tests : `tests/projection.test.cjs`, `projection-ui.test.cjs`, `projection-actions.test.cjs`, `helpers/load-typescript.cjs` (nouveaux), `children-monthly-actions.test.cjs` ; script dans `package.json`.
- SQL : les deux migrations indiquées ci-dessus.
- Documentation : ce rapport.

Les anciens moteurs inutilisés, la refonte générale du chargement, les données de production et les règles métier ENFANTS ne sont pas modifiés. `AGENTS.md` et `CLAUDE.md`, déjà non suivis et générés par Next, sont laissés intacts. Aucun `.env` n’est modifié. Aucun commit, push ou déploiement.
