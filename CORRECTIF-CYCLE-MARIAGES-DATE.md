# Correctif cycle d'épargne — date réelle et revenus mariages

## Modifications

- La carte Finances n'affiche plus automatiquement le 1er du mois suivant.
- Elle affiche la date réellement calculée par le moteur : jour du revenu principal ou lendemain.
- La validation crée le virement à cette même date.
- Un profil d'épargne peut utiliser comme déclencheur :
  - une catégorie de revenu personnel ;
  - les revenus mariages (chaque encaissement attendu affecté au compte analysé).

## Installation

1. Copier les fichiers dans la racine du projet.
2. Exécuter dans Supabase SQL Editor :
   `supabase/migrations/20260804_perso_savings_income_source.sql`
3. Lancer `npm run build`.
4. Dans PERSO > Paramètres > Potentiels d'épargne, choisir le type de revenu principal et enregistrer.
