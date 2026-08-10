# Refonte Aujourd'hui — 10/08/2026

Périmètre volontairement limité à la page d'accueil/navigation.

- Aujourd'hui devient l'entrée après connexion pour tous les profils.
- Aujourd'hui est placé en premier dans la barre latérale, hors PERSO / COMMUN / PHOTO.
- Le logo mobile renvoie vers Aujourd'hui.
- Tableau de bord responsive iPhone : grille 2 colonnes de cartes carrées.
- Palette limitée au noir, or et argent.
- Comptes personnels limités au propriétaire connecté + compte COMMUN pour tous.
- Ordre des cartes personnalisable depuis Aujourd'hui et persisté dans user_metadata Supabase.
- Bouton + sur chaque carte pour créer rapidement un débit/crédit sur le bon compte.
- Le + du compte COMMUN écrit uniquement dans common_movements ; le + d'un compte personnel écrit uniquement dans personal_movements.
- Le bloc Mariages est chargé uniquement lorsque photo_access=true.
- Aucun moteur de Projection, Budget, Epargne, COMMUN ou Mariages n'est modifié.
- Aucune migration SQL requise.
