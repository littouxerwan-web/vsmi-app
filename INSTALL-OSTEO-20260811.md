# Module OSTEO — installation

## Contenu
- Page `/osteo`, accessible uniquement lorsque `app_metadata.osteo_access = true`.
- La migration attribue cet accès au compte dont `user_metadata.first_name = Laure`.
- Import des données 2026 du classeur fourni : 238 honoraires historiques, 143 lignes de charges/projection et paramètres mensuels.
- `+ Honoraires` : date, CB / espèces / chèque, montant.
- CB et chèques synchronisés dans PERSO sur le compte OSTEO sélectionné. Espèces conservées uniquement dans OSTEO.
- Charges projetées vers PERSO : Loyer, Assurance local, Frais bancaires, Cotisations trimestrielles, URSSAF, CARE, AGIPI, RCP, CFE, Doctolib, Téléphone, Comptable.
- Vue mensuelle détaillée et vue annuelle 2035, avec exports PDF.
- Sous-location, km/jour, bénéfice N-1, honoraires et charges restent modifiables.

## Installation Supabase
Exécuter d'abord :
`supabase/migrations/20260811_osteo_module.sql`

Après la migration, Laure doit se déconnecter/reconnecter une fois afin que le JWT récupère `osteo_access=true`.

## Première ouverture
Dans OSTEO, sélectionner le compte bancaire dédié puis Enregistrer. Cela matérialise automatiquement les honoraires CB/chèque futurs et les charges projetables à venir dans PERSO.

## Contrôle
Lancer `npm run build` avant déploiement.
