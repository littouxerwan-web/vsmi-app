# VSMI — cohérence En cours / Projection — 10 août 2026

- `En cours` utilise désormais `buildReliableProjection()` comme `Projection` pour ses soldes de fin de mois et après épargne.
- La colonne **Fin de mois** correspond au solde avant transferts d'épargne automatiques ; **Après épargne** correspond à la clôture du moteur fiable.
- Les propositions de versement et d'utilisation d'épargne affichées dans l'assistant sont extraites du même moteur fiable.
- Le graphique accessible depuis chaque carte **Soldes par compte** reprend les opérations du moteur fiable et permet de changer de mois.
- Ajout d'un retour visuel de navigation plein écran avec le logo VSMI et d'un `loading.tsx` pour les transitions serveur.
- Le sous-menu **Analyse** est positionné avant **Enfants**.
- Les listes de catégories indiquent explicitement **Débit** ou **Crédit**.
- Nouveau type de compte **Crypto**. Une migration Supabase étend la contrainte `personal_accounts_account_type_check`.

## Migration requise
Exécuter `supabase/migrations/20260810_personal_accounts_crypto.sql` sur la base avant de créer un compte Crypto.
