# Correctif hiérarchie Budgets Épargne — 10/08/2026

Règle unique appliquée dans Budgets Épargne, Projection et moteur d'utilisation d'épargne :

- Réserve : mobilisable immédiatement.
- Épargne non affectée : mobilisable immédiatement.
- Projet Libre : disponible en second rang, après épuisement de la réserve mobilisable.
- Projet Intouchable : jamais mobilisé automatiquement.
- Plancher physique de 30 € par compte d'épargne conservé.
- Priorité manuelle non utilisée.

Le correctif inclut aussi le sélecteur propre de compte épargne dans Analyse et conserve la courbe « Épargne mobilisable » dans Projection.

Une migration Supabase normalise les anciennes lignes de type Réserve pour éviter qu'un ancien champ protection/allow_recovery ne les rende artificiellement non mobilisables.
