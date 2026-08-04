# Correctif Potentiel d’épargne — enregistrement

- sauvegarde par `upsert` sur `owner_id` ;
- relecture immédiate des valeurs sauvegardées ;
- chargement explicite des paramètres de l’utilisateur connecté ;
- résumé du profil configuré directement dans le menu replié ;
- conservation du choix « Revenus mariages ».

La migration `20260804_perso_savings_income_source.sql` doit avoir été exécutée dans Supabase.
