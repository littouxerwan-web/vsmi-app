# Correctif potentiel d'épargne au 28

## Règle appliquée

- Le potentiel est calculé pour chaque compte courant configuré.
- Si le solde projeté du mois dépasse le seuil, la différence est proposée en épargne.
- Exemple : solde projeté 800 €, seuil 500 € → proposition 300 €.
- Si le solde ne dépasse pas le seuil, aucune proposition n'est créée.
- La proposition est datée du 28 du mois concerné.
- Tant qu'elle n'est pas supprimée, elle est intégrée par défaut dans les projections futures.
- Une validation crée les deux mouvements planifiés complets : débit du compte courant et crédit du compte d'épargne, tous deux au 28.
- Si le compte courant devient négatif, une proposition inverse d'utilisation de l'épargne est générée, dans la limite de l'épargne disponible.

## Fichiers modifiés

- src/app/(app)/perso/page.tsx
- src/app/(app)/perso/actions.ts
- src/components/perso/projection-view.tsx
- src/lib/perso/savings-engine.ts

Aucune migration SQL supplémentaire n'est nécessaire si la table personal_savings_proposals existe déjà.
