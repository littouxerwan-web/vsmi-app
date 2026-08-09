# Audit budgets — unification du calcul (2026-08-09)

## Règle unique
Pour un budget mensuel B, les flux rattachés au budget sont consolidés ainsi :

- débit / transfer_out : + montant consommé ;
- crédit / transfer_in : - montant consommé ;
- consommation nette = max(0, somme des impacts) ;
- budget restant = max(0, B - consommation nette).

Le budget restant est le seul débit synthétique ajouté à la projection. Les mouvements déjà présents restent des mouvements normaux : ils ne sont donc pas ajoutés une seconde fois via le budget.

## Fichiers alignés
- `src/lib/perso/budget-engine.ts` : source unique des règles de calcul (`budgetFlowImpact`, `calculateBudgetUsage`, `calculateBudgetRemaining`).
- `src/lib/perso/reliable-projection-engine.ts` : Projection utilise `calculateBudgetUsage` avant de créer `Budget restant`.
- `src/components/perso/projection-view.tsx` : affichage des budgets du mois basé sur la même fonction.
- `src/components/perso/monthly-operations.tsx` : En cours utilise la même fonction.
- `src/app/(app)/perso/page.tsx` : calcul de fin de mois utilise le même signe débit/crédit via `budgetFlowImpact`.
- `src/lib/perso/savings-engine.ts` : le moteur d'épargne utilise le même impact débit/crédit pour la consommation du budget.

## Nettoyage
Le doublon inutilisé `src/lib/perso/projection-view.tsx` a été supprimé. La page PERSO importe uniquement `@/components/perso/projection-view`.

## Contrôles
- Vérification syntaxique TypeScript/TSX des fichiers modifiés : OK.
- Aucune migration SQL nécessaire.
