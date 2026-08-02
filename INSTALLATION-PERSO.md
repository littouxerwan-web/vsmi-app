# Installation du module PERSO

## 1. Sauvegarde

```bash
cd ~/Desktop/vsmi-app
git add . && git commit -m "Sauvegarde avant module PERSO"
```

## 2. Remplacement des fichiers

Décompresser l'archive reçue sur le Bureau puis lancer :

```bash
cd ~/Desktop
rsync -av --exclude='.env*' --exclude='.git' VSMI-PERSO-MODIFIE/ ~/Desktop/vsmi-app/
```

## 3. Base de données Supabase

Dans Supabase > SQL Editor, exécuter le fichier :

`supabase/migrations/20260802_module_perso.sql`

## 4. Test local

```bash
cd ~/Desktop/vsmi-app
npm install
npm run build
npm run dev
```

Le module est accessible depuis `/perso`.

## 5. Validation Git

```bash
cd ~/Desktop/vsmi-app
git add src supabase/migrations/20260802_module_perso.sql INSTALLATION-PERSO.md
git commit -m "Ajoute le module de comptabilité personnelle PERSO"
git push origin main
```

## Mise à jour V2

Après la migration V1, exécuter également dans Supabase SQL Editor :

`supabase/migrations/20260802_module_perso_v2.sql`

Cette mise à jour ajoute les objectifs d’épargne. La V2 apporte aussi : gestion détaillée de plusieurs comptes, projection par date et par compte, alerte de découvert, et opérations du mois courant suivies des six prochains mois en menus déroulants.
