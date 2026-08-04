# Correctif VSMI — potentiel d’épargne par cycle de trésorerie

## Installation
1. Exécuter `supabase/migrations/20260804_perso_primary_income_cycle.sql` dans le SQL Editor Supabase.
2. Copier les fichiers du correctif à la racine de `vsmi-app`.
3. Lancer `npm run build`.

## Paramétrage
Dans PERSO > Paramètres > Catégories et budgets, cocher **Revenu principal / début de cycle** sur la catégorie Salaire.
Une seule catégorie active peut porter cet indicateur.

## Logique
- Le versement portant cette catégorie ouvre un cycle de trésorerie.
- VSMI simule les flux jusqu’au revenu principal suivant.
- Il recherche le solde minimum du cycle.
- Le montant proposé correspond à `solde minimum du cycle - seuil de sécurité`.
- La proposition est datée du jour du revenu principal et intégrée virtuellement aux projections suivantes.
- Si le compte passe sous zéro, une utilisation d’épargne est proposée à la date exacte du premier découvert, dans la limite de l’épargne disponible.
