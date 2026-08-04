# Correctif VSMI — utilisation d'épargne en cas de découvert

Fichiers modifiés :
- `src/app/(app)/perso/page.tsx`
- `src/components/perso/projection-view.tsx`
- `src/app/(app)/perso/actions.ts`

Corrections :
- charge les propositions enregistrées depuis `personal_savings_proposals` ;
- transmet à Projection les deux profils d'épargne et les soldes courants ;
- génère une proposition d'utilisation de l'épargne lorsqu'un compte associé devient négatif et que son compte d'épargne contient un solde disponible ;
- date les propositions de versement et de reprise au 28 du mois concerné ;
- affiche les propositions en tête de la vue mensuelle, avant les filtres et les autres opérations ;
- permet de valider, modifier ou supprimer directement depuis ce bloc prioritaire.

Aucune migration SQL supplémentaire n'est nécessaire si la table `personal_savings_proposals` existe déjà.
