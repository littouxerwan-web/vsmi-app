# Refonte moteur Projection — 2026-08-08

## Source de vérité unique

La page Projection utilise désormais `src/lib/perso/reliable-projection-engine.ts` comme moteur unique.
L'ancien empilement `calculateSavingsPlan` + trajectoire quotidienne + protections supplémentaires a été retiré de Projection.

## Invariants

1. Les mouvements `completed` ne sont jamais reprojetés : le solde actuel les contient déjà.
2. Une occurrence récurrente matérialisée dans `personal_movements` n'est jamais régénérée.
3. Les mouvements `planned` en retard sont considérés dus aujourd'hui.
4. Les transferts sont appliqués en sortie et entrée avec le même montant effectif.
5. Un transfert sortant d'un compte épargne est plafonné à son solde disponible : aucune épargne négative.
6. Les budgets utilisent le reliquat net : débits rattachés moins crédits rattachés.
7. PHOTO et URSSAF sont intégrés une seule fois.
8. ENFANTS est intégré via `personal_movements`, donc sans moteur parallèle.
9. À la clôture du mois, si un compte courant est sous son seuil et que son épargne associée est mobilisable, une reprise est générée. Sa date d'affichage est J-2 du premier franchissement du seuil dans le mois.
10. À la clôture du mois, l'excédent d'un compte courant au-dessus de son seuil est transféré vers son épargne associée.
11. Les budgets d'épargne réduisent la part mobilisable, pas le solde physique total d'épargne.
12. Horizon fixe : 60 mois, un point de fin de mois par mois.

## Interface

- Sélecteur de mois : 60 mois disponibles individuellement.
- Le sélecteur, le curseur, les métriques et les mouvements du mois sont synchronisés.
- Résumé mensuel : dépenses, recettes, épargne utilisée, épargne proposée.
- Les mouvements prévus du mois restent modifiables/supprimables via les actions existantes.
