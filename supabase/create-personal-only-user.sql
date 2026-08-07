-- À exécuter APRÈS avoir créé l'utilisateur dans Supabase > Authentication > Users.
-- Remplacer l'adresse ci-dessous par son email exact.
-- Ce rôle est stocké dans app_metadata : l'utilisateur ne peut pas se l'attribuer lui-même.

update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"personal"}'::jsonb
where lower(email) = lower('EMAIL_DU_NOUVEL_UTILISATEUR');

-- Contrôle : doit retourner role = personal pour le nouvel utilisateur.
select id, email, raw_app_meta_data ->> 'role' as role
from auth.users
where lower(email) = lower('EMAIL_DU_NOUVEL_UTILISATEUR');
