# Correctif retour de page après enregistrement — 2026-08-10

## Objectif
Après un enregistrement, rester sur la vue exacte depuis laquelle l'action a été lancée au lieu de revenir sur `PERSO > En cours`.

## Modifications
- `src/app/(app)/perso/actions.ts`
  - les actions génériques d'enregistrement conservent désormais l'URL courante de `/perso` (vue, section, mois, filtres et autres paramètres de recherche) via l'en-tête `Referer` ;
  - le message de succès est ajouté sans perdre les paramètres existants ;
  - les sauvegardes de catégories, simulations de budgets, réglages ENFANTS, comptes par défaut et profils d'épargne utilisent le même comportement ;
  - repli sécurisé vers `PERSO > En cours` uniquement si l'URL d'origine n'est pas disponible/exploitable.
- `src/app/(app)/commun/actions.ts`
  - même principe pour `COMMUN`, afin de conserver `En cours` ou `Budget` et les paramètres de la vue active.

## Vérification
La syntaxe TypeScript des deux fichiers modifiés a été contrôlée. Le build Next.js complet doit être exécuté sur le Mac de développement car `node_modules` n'est pas inclus dans l'archive.
