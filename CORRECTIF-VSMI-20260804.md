# Correctif VSMI — navigation iPhone, budgets et épargne

## Modifications

- La barre basse iPhone affiche désormais **Compta** à la place du bouton central **Ajouter**.
- Un bouton **+** est placé au centre du bandeau supérieur.
- Ce bouton ouvre directement la saisie rapide d’un mouvement dans PERSO.
- Un budget peut être récurrent tous les mois ou limité à un mois précis.
- La période est modifiable dans PERSO > Paramètres > Catégories et budgets.
- Les budgets ponctuels sont filtrés dans la prévision de fin de mois, les mouvements mensuels, la projection et le calcul du potentiel d’épargne.

## Ordre d’installation

1. Exécuter `supabase/migrations/20260804_perso_budget_periods.sql` dans le SQL Editor Supabase.
2. Copier les fichiers du correctif à la racine du projet.
3. Lancer `npm run build`.
