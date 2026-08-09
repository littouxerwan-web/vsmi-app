# Analyse — détail des postes et statut Essentielle

Modifications limitées à Analyse et au champ d'override individuel des mouvements réalisés.

- Postes les plus coûteux : chaque catégorie est déroulable et affiche les opérations réalisées et prévues.
- Structure des dépenses : « Arbitrables » devient « Dépenses non essentielles ».
- Les blocs « Dépenses essentielles » et « Dépenses non essentielles » sont déroulables.
- Pour un mouvement réalisé, la case « Essentielle » peut être cochée ou décochée directement dans Analyse.
- L'override individuel du mouvement est prioritaire. En son absence, le statut provient de la récurrence, puis de la catégorie.
- Les mouvements prévus restent en lecture seule et héritent de leur récurrence/catégorie : aucune règle de Projection n'est modifiée.
- Après mise à jour, la page Analyse est revalidée et les totaux se recalculent.

Migration SQL requise : `20260809_personal_movement_essential_override.sql`.
